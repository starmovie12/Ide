/**
 * Gemini API wrapper — raw browser-direct calls to the Gemini REST API.
 * Uses user-provided API keys; no keys are stored server-side.
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
}

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

/** Build Gemini API URL for a given model and method */
function buildUrl(model: string, method: string, apiKey: string): string {
  return `${GEMINI_BASE}/models/${model}:${method}?key=${apiKey}`;
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
    const err = await res.json().catch(() => ({}));
    throw new GeminiError(res.status, err?.error?.message ?? res.statusText);
  }

  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

/** Streaming call — yields chunks via async generator */
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
    const err = await res.json().catch(() => ({}));
    throw new GeminiError(res.status, err?.error?.message ?? res.statusText);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';

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
          const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) yield { text, done: false };
        } catch {
          /* skip malformed chunks */
        }
      }
    }
  } finally {
    reader.releaseLock();
    yield { text: '', done: true };
  }
}

export class GeminiError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
    this.name = 'GeminiError';
  }

  get isRateLimited(): boolean {
    return this.statusCode === 429;
  }

  get isInvalidKey(): boolean {
    return this.statusCode === 401 || this.statusCode === 403;
  }
}
