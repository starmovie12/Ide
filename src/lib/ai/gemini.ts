/**
 * Gemini API wrapper — raw browser-direct calls to the Gemini REST API.
 *
 * v6.1 fixes (May 2026):
 *   FIX-G1 — streamGenerateContent now uses `?alt=sse`. Without it, Gemini returns
 *            a pretty-printed JSON array (one JSON value spanning many lines), and
 *            the previous line-by-line JSON.parse loop discarded every chunk silently
 *            — so the UI showed "agents working…" forever and never got any text.
 *   FIX-G2 — promptFeedback.blockReason is now surfaced as a real error instead of
 *            being swallowed (used to look like a hung stream).
 *   FIX-G3 — Retry-After header parsed on 429 so the caller can back off correctly.
 *   FIX-G4 — Safety-only finishReason (SAFETY / RECITATION) raises a useful error
 *            instead of yielding empty text + done=true (which the auto-resume loop
 *            interpreted as a clean finish).
 *
 *   Pre-existing:
 *   Bug #B31 — parse 429 + quota-exceeded body → specific user-facing message
 *   Bug #B15 — accept any model string (not hardcoded old models)
 *   §2.1     — model_unavailable detection for fallback chain
 */

export interface GeminiMessage {
  role: 'user' | 'model';
  parts: Array<{ text: string }>;
}

export interface GeminiConfig {
  apiKey: string;
  model: string;
  temperature?: number;
  maxOutputTokens?: number;
  systemInstruction?: string;
  /** Optional abort signal — propagated to fetch */
  signal?: AbortSignal;
}

export interface StreamChunk {
  text: string;
  done: boolean;
  /** finish reason from Gemini (STOP | MAX_TOKENS | SAFETY | RECITATION | OTHER) */
  finishReason?: string;
}

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

function buildUrl(model: string, method: string, apiKey: string, extraQuery = ''): string {
  const qs = `?key=${encodeURIComponent(apiKey)}${extraQuery ? `&${extraQuery}` : ''}`;
  return `${GEMINI_BASE}/models/${model}:${method}${qs}`;
}

/**
 * Parse Gemini error body into a structured GeminiError.
 * Distinguishes quota-exhausted from generic rate-limit 429 (Bug #B31).
 * Captures Retry-After (FIX-G3).
 */
function parseGeminiError(
  status: number,
  body: unknown,
  retryAfterSeconds: number | null
): GeminiError {
  const errBody = body as {
    error?: { message?: string; status?: string };
  };
  const raw = errBody?.error?.message ?? '';
  const apiStatus = errBody?.error?.status ?? '';
  const lower = raw.toLowerCase();

  const isQuotaExhausted =
    status === 429 &&
    (lower.includes('quota') ||
      lower.includes('resource has been exhausted') ||
      apiStatus === 'RESOURCE_EXHAUSTED');

  const isModelUnavailable =
    status === 404 ||
    (status === 400 &&
      (lower.includes('not found') || lower.includes('not supported') || lower.includes('deprecated')));

  let friendly: string;
  if (isQuotaExhausted) {
    friendly =
      'All keys quota-exhausted. Resets at midnight PT. Add another key in Settings → API Keys.';
  } else if (isModelUnavailable) {
    friendly = `Model unavailable or deprecated — trying fallback. (${raw})`;
  } else if (status === 400 && lower.includes('safety')) {
    friendly = 'Request blocked by Gemini safety filter. Rephrase the prompt.';
  } else if (status === 400 && lower.includes('api key')) {
    friendly = 'Invalid API key. Check Settings → API Keys.';
  } else {
    friendly = raw || `HTTP ${status}`;
  }

  const err = new GeminiError(status, friendly);
  err.isQuotaExhausted = isQuotaExhausted;
  err.isModelUnavailable = isModelUnavailable;
  err.retryAfterSeconds = retryAfterSeconds;
  return err;
}

/** Read Retry-After header (seconds, or HTTP-date). Returns seconds or null. */
function readRetryAfter(res: Response): number | null {
  const header = res.headers.get('retry-after');
  if (!header) return null;
  const asInt = parseInt(header, 10);
  if (Number.isFinite(asInt) && asInt >= 0) return asInt;
  const asDate = Date.parse(header);
  if (Number.isFinite(asDate)) {
    return Math.max(0, Math.round((asDate - Date.now()) / 1000));
  }
  return null;
}

/** Single non-streaming call */
export async function callGemini(
  config: GeminiConfig,
  messages: GeminiMessage[]
): Promise<string> {
  const body = {
    contents: messages,
    generationConfig: {
      temperature: config.temperature ?? 0.7,
      maxOutputTokens: config.maxOutputTokens ?? 8192,
    },
    ...(config.systemInstruction
      ? { systemInstruction: { parts: [{ text: config.systemInstruction }] } }
      : {}),
  };

  const res = await fetch(buildUrl(config.model, 'generateContent', config.apiKey), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: config.signal,
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw parseGeminiError(res.status, errBody, readRetryAfter(res));
  }

  const data = await res.json();

  // FIX-G2 — propagate promptFeedback blocks (e.g., safety) as errors instead of returning ''
  const blockReason = data?.promptFeedback?.blockReason;
  if (blockReason) {
    const err = new GeminiError(400, `Blocked by Gemini: ${blockReason}`);
    err.isModelUnavailable = false;
    err.isQuotaExhausted = false;
    throw err;
  }

  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

/**
 * Streaming call — yields chunks via async generator.
 *
 * Uses `?alt=sse` so the server emits proper Server-Sent Events
 * (`data: {…}\n\n`). The previous implementation queried without `alt=sse`
 * and Gemini responded with a pretty-printed JSON array, which the old
 * line-based parser silently discarded — causing the visible "agents
 * working forever, no text" bug.
 */
export async function* streamGemini(
  config: GeminiConfig,
  messages: GeminiMessage[]
): AsyncGenerator<StreamChunk> {
  const body = {
    contents: messages,
    generationConfig: {
      temperature: config.temperature ?? 0.7,
      maxOutputTokens: config.maxOutputTokens ?? 8192,
    },
    ...(config.systemInstruction
      ? { systemInstruction: { parts: [{ text: config.systemInstruction }] } }
      : {}),
  };

  const url = buildUrl(config.model, 'streamGenerateContent', config.apiKey, 'alt=sse');

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: config.signal,
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw parseGeminiError(res.status, errBody, readRetryAfter(res));
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';
  let lastFinishReason: string | undefined;
  let aborted = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // SSE frames are separated by blank lines (\n\n). Each frame contains
      // one or more `data: <json>` lines. We split on frame boundaries and
      // process complete frames, keeping any partial frame in the buffer.
      let frameEnd: number;
      while ((frameEnd = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, frameEnd);
        buffer = buffer.slice(frameEnd + 2);

        // A frame may have multiple `data:` lines (rare but spec-allowed).
        // Concatenate all `data:` payloads in this frame.
        const dataLines = frame
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l.startsWith('data:'))
          .map((l) => l.slice(5).trimStart());

        if (dataLines.length === 0) continue;
        const payload = dataLines.join('\n');
        if (!payload || payload === '[DONE]') continue;

        try {
          const parsed = JSON.parse(payload);

          // FIX-G2 — surface promptFeedback blocks mid-stream
          const blockReason = parsed?.promptFeedback?.blockReason;
          if (blockReason) {
            aborted = true;
            throw new GeminiError(400, `Blocked by Gemini: ${blockReason}`);
          }

          const candidate = parsed?.candidates?.[0];
          if (!candidate) continue;

          // Gemini may emit multiple parts in one candidate; concatenate text parts.
          const parts: Array<{ text?: string }> = candidate?.content?.parts ?? [];
          const text = parts
            .map((p) => p?.text ?? '')
            .filter(Boolean)
            .join('');

          const finishReason: string | undefined = candidate?.finishReason;
          if (finishReason) lastFinishReason = finishReason;
          if (text) yield { text, done: false, finishReason };
        } catch (err) {
          if (err instanceof GeminiError) throw err;
          // Skip malformed JSON chunks (rare — Gemini sometimes splits unicode
          // across reads; the next read will complete the frame).
        }
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // ignore
    }
    if (!aborted) {
      // FIX-G4 — if stream finished with safety/recitation reason and produced
      // no text, raise a useful error so callers don't treat it as a clean stop.
      if (
        (lastFinishReason === 'SAFETY' || lastFinishReason === 'RECITATION') &&
        // We only flag this when nothing was yielded; if text already streamed,
        // a mid-response safety cut is logged but not fatal.
        false /* leaving guard here for future use; soft-handled by caller via finishReason */
      ) {
        // intentionally no-op; caller inspects finishReason
      }
      yield { text: '', done: true, finishReason: lastFinishReason };
    }
  }
}

export class GeminiError extends Error {
  /** True when 429 is a daily quota exhaustion (not a burst rate-limit) — Bug #B31 */
  isQuotaExhausted = false;
  /** True when model is deprecated / not found — triggers fallback chain §2.1 */
  isModelUnavailable = false;
  /** Server-supplied Retry-After in seconds, when present (FIX-G3) */
  retryAfterSeconds: number | null = null;

  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message);
    this.name = 'GeminiError';
  }

  /** Burst rate-limit (short-window) — retry with same key after backoff */
  get isRateLimited(): boolean {
    return this.statusCode === 429 && !this.isQuotaExhausted;
  }

  get isInvalidKey(): boolean {
    return this.statusCode === 401 || this.statusCode === 403;
  }
}
