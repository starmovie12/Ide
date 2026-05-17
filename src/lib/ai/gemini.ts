/**
 * Gemini API wrapper — raw browser-direct calls to the Gemini REST API.
 *
 * v6.2 (May 2026) — CRITICAL FIX after v6.1 still produced empty bubbles
 * in production on idehjji.vercel.app:
 *
 *   FIX-G5 — The v6.1 SSE parser split frames on `\n\n`, but Gemini's actual
 *            response uses `\r\n\r\n` (standard HTTP line endings). My
 *            substring search never matched, so EVERY chunk was discarded
 *            and the agent bubble stayed empty even though the stream ran
 *            to completion. Reproduced locally with literal CRLF samples:
 *
 *              sse-lf   → ["Hello", " world"]   ✓
 *              sse-crlf → []                    ✗  ← this is what Gemini emits
 *              json-arr → []                    ✗
 *
 *            The fix replaces the frame-based parser with a streaming
 *            brace-depth tracker that yields each top-level JSON object as
 *            soon as its closing `}` is seen, regardless of the surrounding
 *            framing characters. Same parser handles all three response
 *            shapes Gemini might emit:
 *              - SSE with \n\n
 *              - SSE with \r\n\r\n
 *              - JSON array fallback (when alt=sse is silently ignored)
 *            String literals are tracked so `{`/`}` inside quoted strings
 *            don't desync depth — verified with a sample containing
 *            `"x = { a: 1 }"` (parser correctly extracted "x = { a: 1 }").
 *
 *   FIX-G6 — Buffer compaction. The previous parser sliced the buffer
 *            after every frame, which is O(N²) on a long stream. New
 *            parser tracks a cursor and only compacts when both
 *            `depth === 0` AND `objStart === -1`, so we never copy past
 *            a partial in-flight object.
 *
 *   FIX-G7 — If the stream finished with finishReason=SAFETY|RECITATION
 *            AND yielded zero tokens, raise a useful error instead of
 *            ending cleanly with an empty bubble.
 *
 * Earlier v6.1 fixes retained:
 *   FIX-G1 — `?alt=sse` query param requested.
 *   FIX-G2 — promptFeedback.blockReason raised as an error mid-stream.
 *   FIX-G3 — Retry-After header parsed on 429.
 *   FIX-G4 — finishReason propagated to chunks.
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
  signal?: AbortSignal;
}

export interface StreamChunk {
  text: string;
  done: boolean;
  finishReason?: string;
}

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

function buildUrl(model: string, method: string, apiKey: string, extraQuery = ''): string {
  const qs = `?key=${encodeURIComponent(apiKey)}${extraQuery ? `&${extraQuery}` : ''}`;
  return `${GEMINI_BASE}/models/${model}:${method}${qs}`;
}

function parseGeminiError(
  status: number,
  body: unknown,
  retryAfterSeconds: number | null
): GeminiError {
  const errBody = body as { error?: { message?: string; status?: string } };
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
      (lower.includes('not found') ||
        lower.includes('not supported') ||
        lower.includes('deprecated')));

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

/** Non-streaming call */
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
  const blockReason = data?.promptFeedback?.blockReason;
  if (blockReason) {
    throw new GeminiError(400, `Blocked by Gemini: ${blockReason}`);
  }
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

/**
 * Streaming JSON-object extractor — see FIX-G5 in the header comment.
 *
 * Maintains parser state across multiple `feed()` calls so that an object
 * spanning two network reads is still extracted correctly. The parser is
 * deliberately stupid about framing: it only knows about `{`, `}`, `"`,
 * and `\`. Anything else (commas, brackets, `data:` prefixes, CR / LF)
 * is just non-significant whitespace from its perspective.
 */
class StreamingObjectExtractor {
  private depth = 0;
  private objStart = -1;
  private inString = false;
  private escape = false;
  private cursor = 0;
  private buffer = '';

  *feed(chunk: string): Generator<string> {
    this.buffer += chunk;
    while (this.cursor < this.buffer.length) {
      const ch = this.buffer[this.cursor];
      if (this.escape) {
        this.escape = false;
      } else if (this.inString) {
        if (ch === '\\') this.escape = true;
        else if (ch === '"') this.inString = false;
      } else {
        if (ch === '"') this.inString = true;
        else if (ch === '{') {
          if (this.depth === 0) this.objStart = this.cursor;
          this.depth++;
        } else if (ch === '}') {
          this.depth--;
          if (this.depth === 0 && this.objStart !== -1) {
            yield this.buffer.slice(this.objStart, this.cursor + 1);
            this.objStart = -1;
          }
        }
      }
      this.cursor++;
    }

    // Compact between objects so memory doesn't grow with stream length.
    // Compacting mid-object would lose the start index, so guard on depth.
    if (
      this.depth === 0 &&
      this.objStart === -1 &&
      !this.inString &&
      this.cursor > 4096
    ) {
      this.buffer = this.buffer.slice(this.cursor);
      this.cursor = 0;
    }
  }
}

/**
 * Streaming call — yields chunks via async generator.
 *
 * Works with all three response shapes Gemini might emit (see FIX-G5).
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
  const extractor = new StreamingObjectExtractor();
  let lastFinishReason: string | undefined;
  let yieldedAny = false;
  let aborted = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const decoded = decoder.decode(value, { stream: true });

      for (const objText of extractor.feed(decoded)) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(objText);
        } catch {
          continue;
        }

        const obj = parsed as {
          promptFeedback?: { blockReason?: string };
          candidates?: Array<{
            content?: { parts?: Array<{ text?: string }> };
            finishReason?: string;
          }>;
        };

        if (obj?.promptFeedback?.blockReason) {
          aborted = true;
          throw new GeminiError(
            400,
            `Blocked by Gemini: ${obj.promptFeedback.blockReason}`
          );
        }

        const candidate = obj?.candidates?.[0];
        if (!candidate) continue;

        const parts = candidate?.content?.parts ?? [];
        const text = parts
          .map((p) => p?.text ?? '')
          .filter(Boolean)
          .join('');

        const finishReason = candidate?.finishReason;
        if (finishReason) lastFinishReason = finishReason;
        if (text) {
          yieldedAny = true;
          yield { text, done: false, finishReason };
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
      // FIX-G7 — empty stream + safety stop ⇒ tell the user, not hand them
      // an empty bubble.
      if (
        !yieldedAny &&
        (lastFinishReason === 'SAFETY' || lastFinishReason === 'RECITATION')
      ) {
        throw new GeminiError(
          400,
          `Response blocked by Gemini (${lastFinishReason}). Try rephrasing.`
        );
      }
      yield { text: '', done: true, finishReason: lastFinishReason };
    }
  }
}

export class GeminiError extends Error {
  isQuotaExhausted = false;
  isModelUnavailable = false;
  retryAfterSeconds: number | null = null;

  constructor(public statusCode: number, message: string) {
    super(message);
    this.name = 'GeminiError';
  }

  get isRateLimited(): boolean {
    return this.statusCode === 429 && !this.isQuotaExhausted;
  }

  get isInvalidKey(): boolean {
    return this.statusCode === 401 || this.statusCode === 403;
  }
}
