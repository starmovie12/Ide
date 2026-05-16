/**
 * Gemini API wrapper — raw browser-direct calls to the Gemini REST API.
 * v6 updates:
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
}

export interface StreamChunk {
  text: string;
  done: boolean;
  /** finish reason from Gemini (STOP | MAX_TOKENS | SAFETY | RECITATION | OTHER) */
  finishReason?: string;
}

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

function buildUrl(model: string, method: string, apiKey: string): string {
  return `${GEMINI_BASE}/models/${model}:${method}?key=${apiKey}`;
}

/**
 * Parse Gemini error body into a structured GeminiError.
 * Bug #B31: distinguishes quota-exhausted from generic rate-limit 429.
 */
function parseGeminiError(status: number, body: unknown): GeminiError {
  const errBody = body as {
    error?: { message?: string; status?: string };
  };
  const raw = errBody?.error?.message ?? '';
  const apiStatus = errBody?.error?.status ?? '';

  const isQuotaExhausted =
    status === 429 &&
    (raw.toLowerCase().includes('quota') ||
      raw.toLowerCase().includes('resource has been exhausted') ||
      apiStatus === 'RESOURCE_EXHAUSTED');

  const isModelUnavailable =
    status === 404 ||
    (status === 400 && raw.toLowerCase().includes('not found'));

  let friendly: string;
  if (isQuotaExhausted) {
    friendly =
      'All keys quota-exhausted. Resets at midnight PT. Add another key in Settings → API Keys.';
  } else if (isModelUnavailable) {
    friendly = `Model unavailable or deprecated — trying fallback. (${raw})`;
  } else if (status === 400 && raw.toLowerCase().includes('safety')) {
    friendly = 'Request blocked by Gemini safety filter. Rephrase the prompt.';
  } else {
    friendly = raw || `HTTP ${status}`;
  }

  const err = new GeminiError(status, friendly);
  err.isQuotaExhausted = isQuotaExhausted;
  err.isModelUnavailable = isModelUnavailable;
  return err;
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
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw parseGeminiError(res.status, errBody);
  }

  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

/**
 * Streaming call — yields chunks via async generator.
 * finishReason (MAX_TOKENS, STOP, SAFETY…) is forwarded on each chunk.
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

  const res = await fetch(buildUrl(config.model, 'streamGenerateContent', config.apiKey), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw parseGeminiError(res.status, errBody);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';
  let lastFinishReason: string | undefined;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === '[' || trimmed === ']' || trimmed === ',') continue;
        const json = trimmed.startsWith('data: ') ? trimmed.slice(6) : trimmed;
        try {
          const parsed = JSON.parse(json);
          const candidate = parsed?.candidates?.[0];
          const text: string | undefined = candidate?.content?.parts?.[0]?.text;
          const finishReason: string | undefined = candidate?.finishReason;
          if (finishReason) lastFinishReason = finishReason;
          if (text) yield { text, done: false, finishReason };
        } catch {
          /* skip malformed chunks */
        }
      }
    }
  } finally {
    reader.releaseLock();
    yield { text: '', done: true, finishReason: lastFinishReason };
  }
}

export class GeminiError extends Error {
  /** True when 429 is a daily quota exhaustion (not a burst rate-limit) — Bug #B31 */
  isQuotaExhausted = false;
  /** True when model is deprecated / not found — triggers fallback chain §2.1 */
  isModelUnavailable = false;

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
