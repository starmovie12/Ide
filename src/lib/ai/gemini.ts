/**
 * src/lib/ai/gemini.ts
 * ──────────────────────────────────────────────────────────────────────────────
 * Gemini API wrapper — raw browser-direct calls to the Gemini REST API.
 *
 * PRD v6 references:
 *   §2.1  Verified model list + fallback chain (model IDs in constants.ts)
 *   §2.2  Multi-key strategy (KeyManager / apiKeyStore own rotation; this
 *          file is the raw HTTP layer — no key logic here)
 *   §2.3  Auto-resume on token cutoff (autoResume.ts wraps this file)
 *   §2.4  Quota visibility (parseGeminiError raises human-readable banners)
 *   B25   tokenCounter.ts stub → implement via countTokens() REST endpoint
 *   B31   Quota exhaustion shows "resets at midnight PT" banner (not generic error)
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * FIXES IN THIS FILE
 * ──────────────────────────────────────────────────────────────────────────────
 *
 * v6.1 (initial fixes):
 *   FIX-G1 — `?alt=sse` query param requested on streaming endpoint.
 *   FIX-G2 — promptFeedback.blockReason raised as GeminiError mid-stream.
 *   FIX-G3 — Retry-After header parsed on 429 (integer seconds OR HTTP-date).
 *   FIX-G4 — finishReason propagated from streaming candidate to StreamChunk.
 *
 * v6.2 (production fix — empty bubbles on idehjji.vercel.app):
 *   FIX-G5 — Frame-based SSE parser replaced with a streaming brace-depth
 *            tracker (StreamingObjectExtractor). The v6.1 parser split frames
 *            on `\n\n` but Gemini emits `\r\n\r\n`; every chunk was discarded
 *            causing empty agent bubbles despite the stream completing.
 *            New parser is framing-agnostic: yields each top-level JSON object
 *            the moment its closing `}` is seen. Handles all three response
 *            shapes Gemini may emit (SSE \n\n, SSE \r\n\r\n, JSON array).
 *            String literals are tracked so `{`/`}` inside quoted strings do
 *            not desync depth — verified with `"x = { a: 1 }"` samples.
 *   FIX-G6 — Buffer compaction. Prior parser sliced after every frame (O(N²)
 *            on long streams). New parser tracks a cursor and only compacts
 *            when depth === 0 AND objStart === -1, preventing mid-object loss.
 *   FIX-G7 — If the stream finishes with finishReason=SAFETY|RECITATION AND
 *            zero tokens were yielded, raise a GeminiError instead of letting
 *            the caller receive a silent empty bubble.
 *
 * v6.3 (PRD Phase 5 complete — this file):
 *   FIX-G8 — countTokens() REST endpoint added (Bug #B25). tokenCounter.ts
 *            was a stub; the actual /v1beta/models/{model}:countTokens call
 *            now lives here, consistent with how callGemini wraps generateContent.
 *   FIX-G9 — generateEmbedding() added for text-embedding-004 model.
 *            Used by blueprint/builder.ts (Phase 5 keyword → Phase 6 vector).
 *   FIX-G10— GeminiPart union type added: text | inlineData (base64 image).
 *            Required by Designer agent for screenshot-to-JSX in Phase 6 but
 *            exported now so the type is stable before the feature lands.
 *   FIX-G11— GeminiConfig extended with optional safetySettings, responseMimeType,
 *            topP, topK. Code-editing agents need to lower safety thresholds to
 *            avoid false positives on security-related code. JSON-mode
 *            (responseMimeType: 'application/json') needed by blueprint builder
 *            (Phase B summarization batch, Phase C convention sniffer).
 *   FIX-G12— callGemini() supports JSON-structured output by forwarding
 *            responseMimeType and (optionally) responseSchema from config.
 *   FIX-G13— parseGeminiError() extended: isInvalidKey flag added for 401/403
 *            so streaming.ts can mark keys dead immediately on auth failure
 *            (FIX-S7 in streaming.ts depends on this flag being present here).
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * ARCHITECTURE NOTE
 * ──────────────────────────────────────────────────────────────────────────────
 *
 *  gemini.ts      — raw REST calls (generateContent, streamGenerateContent,
 *                   countTokens, embedContent). No key rotation. No retry logic.
 *  streaming.ts   — key rotation + model-fallback on top of streamGemini().
 *  autoResume.ts  — MAX_TOKENS continuation loop on top of streamGemini().
 *  orchestrator.ts— agent pipeline: calls streaming.ts per agent step.
 *  keyManager.ts  — DEPRECATED module-level state; all live state now in apiKeyStore.
 *  constants.ts   — GEMINI_MODELS, FALLBACK_CHAIN, AGENT_DEFAULT_MODELS (§2.1).
 */

// ────────────────────────────────────────────────────────────────────────────
// § PUBLIC TYPES
// ────────────────────────────────────────────────────────────────────────────

/**
 * A single content part in a Gemini message.
 *
 * FIX-G10: union type so future multimodal (image) parts slot in without
 * breaking existing callers that only use the text variant.
 *
 * - `text`       — plain text (most calls)
 * - `inlineData` — base64-encoded image for Designer agent vision (Phase 6)
 * - `functionCall` / `functionResponse` — tool use (Phase 6+, stubs provided)
 */
export type GeminiPart =
  /** Plain text token */
  | { text: string }
  /** Base64-encoded image for multimodal requests (Designer agent vision) */
  | {
      inlineData: {
        /** IANA media type, e.g. 'image/png' | 'image/jpeg' | 'image/webp' */
        mimeType: string;
        /** Base64-encoded bytes of the image */
        data: string;
      };
    }
  /**
   * Function call emitted by the model when tool use is enabled (Phase 6+).
   * Stubs are defined now so the type is stable before the feature lands.
   */
  | {
      functionCall: {
        name: string;
        args: Record<string, unknown>;
      };
    }
  /**
   * Function response sent back to the model after the client executed a tool
   * call. Paired with a prior `functionCall` part (Phase 6+).
   */
  | {
      functionResponse: {
        name: string;
        response: Record<string, unknown>;
      };
    };

/** A single message in a Gemini conversation (`contents` array entry). */
export interface GeminiMessage {
  role: 'user' | 'model';
  /** One or more content parts. Most calls use `[{ text: '...' }]`. */
  parts: GeminiPart[];
}

/**
 * Safety threshold values accepted by the Gemini API.
 * BLOCK_NONE is used by code-editing agents to avoid false positives on
 * security-related code (e.g. writing an auth middleware with SQL injection).
 */
export type HarmBlockThreshold =
  | 'HARM_BLOCK_THRESHOLD_UNSPECIFIED'
  | 'BLOCK_LOW_AND_ABOVE'
  | 'BLOCK_MEDIUM_AND_ABOVE'
  | 'BLOCK_ONLY_HIGH'
  | 'BLOCK_NONE';

/** Harm categories the Gemini API exposes for per-category threshold tuning. */
export type HarmCategory =
  | 'HARM_CATEGORY_HARASSMENT'
  | 'HARM_CATEGORY_HATE_SPEECH'
  | 'HARM_CATEGORY_SEXUALLY_EXPLICIT'
  | 'HARM_CATEGORY_DANGEROUS_CONTENT'
  | 'HARM_CATEGORY_CIVIC_INTEGRITY';

/** Per-category safety setting passed in the request body. */
export interface SafetySetting {
  category: HarmCategory;
  threshold: HarmBlockThreshold;
}

/**
 * Recommended safety settings for code-editing agents.
 *
 * Code review / diff generation frequently references security vulnerabilities,
 * injection patterns, and authentication code. The default Gemini thresholds
 * block these prompts as "dangerous content". Setting to BLOCK_NONE lets code
 * agents work without false-positive refusals.
 *
 * These settings are passed by streaming.ts when building the callConfig for
 * agent calls. Non-code calls (title generation, convention sniffing) can
 * omit safetySettings to keep the defaults.
 */
export const CODE_AGENT_SAFETY_SETTINGS: SafetySetting[] = [
  { category: 'HARM_CATEGORY_HARASSMENT',       threshold: 'BLOCK_ONLY_HIGH' },
  { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_ONLY_HIGH' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE'     },
];

/**
 * Configuration for a single Gemini API call.
 *
 * FIX-G11: added safetySettings, responseMimeType, responseSchema, topP, topK.
 */
export interface GeminiConfig {
  /** Raw Gemini API key (injected by streaming.ts from apiKeyStore). */
  apiKey: string;
  /**
   * Model ID — must be one of the keys in GEMINI_MODELS (constants.ts).
   * Examples: 'gemini-3-flash-preview', 'gemini-2.5-flash-lite'.
   * Deprecated models (gemini-2.0-*, gemini-1.5-*) must never be passed here.
   */
  model: string;
  /** Sampling temperature. Default: 0.7. Lower = more deterministic. */
  temperature?: number;
  /** Maximum output tokens. Default: 8192. */
  maxOutputTokens?: number;
  /**
   * System instruction injected via the Gemini `systemInstruction` field
   * (separate from the `contents` array). Role-based agent brains go here.
   */
  systemInstruction?: string;
  /**
   * AbortSignal for cancellation. Forwarded to the underlying fetch() call
   * so the HTTP connection is torn down (not just JS-level checked) on abort.
   * FIX-S5 in streaming.ts merges config.signal with its own signal parameter.
   */
  signal?: AbortSignal;
  /**
   * Per-category safety thresholds (FIX-G11).
   * Code agents should pass CODE_AGENT_SAFETY_SETTINGS.
   * If omitted, Gemini's default moderation thresholds apply.
   */
  safetySettings?: SafetySetting[];
  /**
   * Force structured JSON output (FIX-G11 / FIX-G12).
   * Pass 'application/json' to activate JSON mode.
   * Required by blueprint builder (convention sniffer + rules extractor)
   * and any agent call that needs machine-parseable structured output.
   *
   * When set, the model will always return valid JSON.
   * Pair with responseSchema for typed validation (optional).
   */
  responseMimeType?: 'text/plain' | 'application/json';
  /**
   * Optional JSON schema for the structured response (FIX-G11).
   * Used together with responseMimeType: 'application/json'.
   * The model will produce output conforming to this schema.
   * Omit for free-form JSON responses where you'll parse manually.
   *
   * @example
   * responseSchema: {
   *   type: 'object',
   *   properties: {
   *     title:   { type: 'string' },
   *     summary: { type: 'string' },
   *   },
   *   required: ['title', 'summary'],
   * }
   */
  responseSchema?: Record<string, unknown>;
  /**
   * Nucleus sampling probability mass (0.0–1.0, FIX-G11).
   * Reduces diversity. Recommended for structured tasks. Default: model default.
   */
  topP?: number;
  /**
   * Top-K sampling (FIX-G11). Number of highest-probability tokens considered.
   * Default: model default.
   */
  topK?: number;
}

/**
 * A single streaming chunk yielded by {@link streamGemini}.
 *
 * Callers should accumulate `text` values until `done === true`.
 * The final chunk always has `text === ''` and `done === true`.
 */
export interface StreamChunk {
  /** Partial or empty text token. Non-empty only when `done === false`. */
  text: string;
  /** True on the terminal sentinel chunk (no more chunks follow). */
  done: boolean;
  /**
   * Forwarded from the Gemini candidate (FIX-G4).
   * Present on intermediate chunks that carry a finishReason and on the
   * final sentinel chunk.
   *
   * Common values:
   *   'STOP'       — natural end of response
   *   'MAX_TOKENS' — truncated; autoResume.ts will continue
   *   'SAFETY'     — blocked (FIX-G7 raises GeminiError for this)
   *   'RECITATION' — blocked (FIX-G7 raises GeminiError for this)
   */
  finishReason?: string;
}

/**
 * Result returned by {@link countTokens}.
 */
export interface TokenCountResult {
  /** Total number of tokens in the provided contents. */
  totalTokens: number;
  /**
   * Breakdown per content item (optional — present when Gemini returns it).
   * May be absent on older model endpoints.
   */
  cachedContentTokenCount?: number;
}

/**
 * Result returned by {@link generateEmbedding}.
 */
export interface EmbeddingResult {
  /** Dense float vector representing the input text (typically 768 dims). */
  values: number[];
}

// ────────────────────────────────────────────────────────────────────────────
// § CONSTANTS
// ────────────────────────────────────────────────────────────────────────────

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

// ────────────────────────────────────────────────────────────────────────────
// § INTERNAL HELPERS
// ────────────────────────────────────────────────────────────────────────────

/**
 * Build a REST endpoint URL for the given model + method.
 *
 * @param model      — model ID (e.g. 'gemini-3-flash-preview')
 * @param method     — Gemini method (e.g. 'generateContent', 'countTokens')
 * @param apiKey     — raw Gemini API key
 * @param extraQuery — additional query string parameters (without leading `&`)
 *
 * @example
 * buildUrl('gemini-3-flash-preview', 'streamGenerateContent', key, 'alt=sse')
 * // → 'https://.../models/gemini-3-flash-preview:streamGenerateContent?key=...&alt=sse'
 */
function buildUrl(
  model: string,
  method: string,
  apiKey: string,
  extraQuery = '',
): string {
  const qs = `?key=${encodeURIComponent(apiKey)}${extraQuery ? `&${extraQuery}` : ''}`;
  return `${GEMINI_BASE}/models/${model}:${method}${qs}`;
}

/**
 * Build the `generationConfig` object from a {@link GeminiConfig}.
 *
 * FIX-G11 / FIX-G12: responseMimeType, responseSchema, topP, topK forwarded
 * so callers can activate JSON mode without touching the request body directly.
 */
function buildGenerationConfig(config: GeminiConfig): Record<string, unknown> {
  const gc: Record<string, unknown> = {
    temperature:     config.temperature     ?? 0.7,
    maxOutputTokens: config.maxOutputTokens ?? 8192,
  };
  if (config.responseMimeType) gc['responseMimeType'] = config.responseMimeType;
  if (config.responseSchema)   gc['responseSchema']   = config.responseSchema;
  if (config.topP !== undefined) gc['topP'] = config.topP;
  if (config.topK !== undefined) gc['topK'] = config.topK;
  return gc;
}

/**
 * Build the complete request body shared by generateContent and
 * streamGenerateContent.
 */
function buildRequestBody(
  config: GeminiConfig,
  messages: GeminiMessage[],
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    contents:         messages,
    generationConfig: buildGenerationConfig(config),
  };
  if (config.systemInstruction) {
    body['systemInstruction'] = { parts: [{ text: config.systemInstruction }] };
  }
  if (config.safetySettings?.length) {
    body['safetySettings'] = config.safetySettings;
  }
  return body;
}

/**
 * Parse the `Retry-After` HTTP response header into a seconds value.
 *
 * FIX-G3: supports both integer-seconds (`60`) and HTTP-date formats
 * (`Mon, 18 May 2026 00:00:00 GMT`).
 *
 * @returns seconds to wait, or null if the header is absent / unparseable.
 */
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

/**
 * Convert an HTTP error response body + status code to a typed {@link GeminiError}.
 *
 * FIX-G11 / FIX-G13 extensions:
 *   - isInvalidKey flag (401 / 403) so streaming.ts (FIX-S7) can mark keys dead
 *     immediately without burning through retry budget.
 *   - Explicit human-readable messages for every error class the pipeline cares
 *     about, per PRD §2.4 quota visibility + Bug #B31.
 *
 * @param status              — HTTP status code
 * @param body                — parsed JSON body (or empty object on parse failure)
 * @param retryAfterSeconds   — value from readRetryAfter(), or null
 */
function parseGeminiError(
  status: number,
  body: unknown,
  retryAfterSeconds: number | null,
): GeminiError {
  const errBody = body as { error?: { message?: string; status?: string } };
  const raw       = errBody?.error?.message ?? '';
  const apiStatus = errBody?.error?.status  ?? '';
  const lower     = raw.toLowerCase();

  // ── Quota exhausted (429 + RESOURCE_EXHAUSTED) ──────────────────────────
  // Bug #B31: specific banner with "resets at midnight PT" copy, not generic.
  const isQuotaExhausted =
    status === 429 &&
    (lower.includes('quota') ||
      lower.includes('resource has been exhausted') ||
      apiStatus === 'RESOURCE_EXHAUSTED');

  // ── Model deprecated / region-blocked (404, or 400 with model error) ────
  const isModelUnavailable =
    status === 404 ||
    (status === 400 &&
      (lower.includes('not found') ||
        lower.includes('not supported') ||
        lower.includes('deprecated')));

  // ── Invalid API key (401 / 403) — FIX-G13 ───────────────────────────────
  const isInvalidKey = status === 401 || status === 403;

  // ── Burst rate-limit (429 without quota-exhausted body) ─────────────────
  const isRateLimited = status === 429 && !isQuotaExhausted;

  // ── Human-readable message selection ────────────────────────────────────
  let friendly: string;
  if (isQuotaExhausted) {
    // PRD §2.4 + Bug #B31 — exact copy for the quota banner in the UI
    friendly =
      'All keys quota-exhausted. Resets at midnight PT. Add another key in Settings → API Keys.';
  } else if (isModelUnavailable) {
    friendly = `Model unavailable or deprecated — trying fallback. (${raw || `HTTP ${status}`})`;
  } else if (isInvalidKey) {
    friendly = 'Invalid API key. Check Settings → API Keys.';
  } else if (isRateLimited) {
    friendly = `Rate-limited${retryAfterSeconds != null ? ` — retry in ${retryAfterSeconds}s` : ''}. Rotating to next key.`;
  } else if (status === 400 && lower.includes('safety')) {
    friendly = 'Request blocked by Gemini safety filter. Rephrase the prompt.';
  } else if (status === 400 && lower.includes('api key')) {
    friendly = 'Invalid API key. Check Settings → API Keys.';
  } else if (status === 400 && lower.includes('invalid argument')) {
    friendly = `Bad request — ${raw || 'invalid argument'}.`;
  } else if (status === 503) {
    friendly = 'Gemini API temporarily unavailable (503). Will retry.';
  } else {
    friendly = raw || `Gemini HTTP ${status}`;
  }

  const err = new GeminiError(status, friendly);
  err.isQuotaExhausted  = isQuotaExhausted;
  err.isModelUnavailable = isModelUnavailable;
  err.isInvalidKey       = isInvalidKey;       // FIX-G13
  err.retryAfterSeconds  = retryAfterSeconds;
  return err;
}

// ────────────────────────────────────────────────────────────────────────────
// § STREAMING OBJECT EXTRACTOR (FIX-G5 / FIX-G6)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Streaming JSON-object extractor — see FIX-G5 / FIX-G6 in the file header.
 *
 * Maintains parser state across multiple `feed()` calls so that a JSON object
 * spanning two network reads is still extracted correctly.
 *
 * ## Design
 * The parser is deliberately framing-agnostic: it only tracks `{`, `}`, `"`,
 * and `\`. Everything else — `data:` prefixes, CR / LF / CRLF, array brackets,
 * commas — is treated as non-significant whitespace.
 *
 * This makes it handle ALL response shapes Gemini may emit:
 *   - Server-Sent Events with `\n\n` separators
 *   - Server-Sent Events with `\r\n\r\n` separators (actual Gemini production)
 *   - JSON array fallback (`[{...},{...}]`) when SSE is silently degraded
 *
 * ## String tracking
 * The parser enters "string mode" on `"` and exits on the next unescaped `"`.
 * While in string mode, `{` / `}` are ignored so JSON values like
 * `"x = { a: 1 }"` don't desync the brace depth counter.
 *
 * ## Buffer compaction (FIX-G6)
 * After yielding a complete object, the buffer is only compacted when
 * `depth === 0 AND objStart === -1` (i.e. we are between objects). Compacting
 * mid-object would invalidate `objStart`, causing data loss.
 * Compaction is only triggered after the cursor exceeds 4096 bytes to avoid
 * the O(N²) per-chunk slice cost that plagued the v6.1 parser.
 */
class StreamingObjectExtractor {
  private depth    = 0;
  private objStart = -1;
  private inString = false;
  private escape   = false;
  private cursor   = 0;
  private buffer   = '';

  /**
   * Feed a new network chunk into the parser and yield complete JSON objects.
   *
   * @param chunk — raw text chunk from TextDecoder
   * @yields      — complete JSON object strings (unparsed), one per top-level `{...}`
   */
  *feed(chunk: string): Generator<string> {
    this.buffer += chunk;

    while (this.cursor < this.buffer.length) {
      const ch = this.buffer[this.cursor];

      if (this.escape) {
        // The character after a backslash is always literal — skip it.
        this.escape = false;
      } else if (this.inString) {
        if (ch === '\\') {
          this.escape = true;
        } else if (ch === '"') {
          this.inString = false;
        }
        // All other characters inside a string are non-significant.
      } else {
        // Outside a string — significant characters only:
        if (ch === '"') {
          this.inString = true;
        } else if (ch === '{') {
          if (this.depth === 0) this.objStart = this.cursor;
          this.depth++;
        } else if (ch === '}') {
          this.depth--;
          if (this.depth === 0 && this.objStart !== -1) {
            // Complete top-level object found — yield its text.
            yield this.buffer.slice(this.objStart, this.cursor + 1);
            this.objStart = -1;
          }
        }
        // `[`, `]`, `,`, whitespace, `data:` prefix characters are all ignored.
      }

      this.cursor++;
    }

    // Compact between objects to keep memory usage O(1) on long streams.
    // Guard: only compact when we are NOT inside an in-flight object.
    // Compaction threshold: 4096 bytes, to amortize the slice cost.
    if (
      this.depth    === 0 &&
      this.objStart === -1 &&
      !this.inString &&
      this.cursor   > 4096
    ) {
      this.buffer = this.buffer.slice(this.cursor);
      this.cursor = 0;
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// § PUBLIC API — GENERATE CONTENT (non-streaming)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Non-streaming Gemini `generateContent` call.
 *
 * Use for:
 * - Chat title generation (Bug #B11 — Flash-Lite one-shot call in orchestrator)
 * - Blueprint convention sniffer (Phase C, 1 call)
 * - Blueprint rules extractor (Phase D, 1 call)
 * - Any task where the full response is short enough to buffer without streaming
 *
 * For structured JSON output, set `config.responseMimeType = 'application/json'`
 * (FIX-G12). The returned string will be valid JSON; parse it at the call site.
 *
 * @param config   — call configuration (model, key, temp, safety, JSON mode…)
 * @param messages — conversation history in Gemini format
 * @returns        — the full response text (or JSON string in JSON mode)
 * @throws {GeminiError} on non-2xx HTTP status or promptFeedback.blockReason
 */
export async function callGemini(
  config: GeminiConfig,
  messages: GeminiMessage[],
): Promise<string> {
  const body = buildRequestBody(config, messages);
  const url  = buildUrl(config.model, 'generateContent', config.apiKey);

  const res = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
    signal:  config.signal,
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw parseGeminiError(res.status, errBody, readRetryAfter(res));
  }

  const data = await res.json();

  // FIX-G2 (non-streaming variant): blockReason in promptFeedback is a hard stop.
  const blockReason = (data as { promptFeedback?: { blockReason?: string } })
    ?.promptFeedback?.blockReason;
  if (blockReason) {
    throw new GeminiError(400, `Blocked by Gemini: ${blockReason}`);
  }

  // Standard path: extract text from the first candidate's first part.
  const candidates = (data as { candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }> })?.candidates;

  const firstCandidate = candidates?.[0];

  // FIX-G7 (non-streaming variant): safety / recitation stop with no text.
  if (
    firstCandidate?.finishReason === 'SAFETY' ||
    firstCandidate?.finishReason === 'RECITATION'
  ) {
    const reason = firstCandidate.finishReason;
    if (!firstCandidate?.content?.parts?.some((p) => p.text?.trim())) {
      throw new GeminiError(
        400,
        `Response blocked by Gemini (${reason}). Try rephrasing.`,
      );
    }
  }

  return (
    firstCandidate?.content?.parts
      ?.map((p) => p?.text ?? '')
      .filter(Boolean)
      .join('') ?? ''
  );
}

// ────────────────────────────────────────────────────────────────────────────
// § PUBLIC API — STREAM GENERATE CONTENT (streaming)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Streaming Gemini `streamGenerateContent` call.
 *
 * Yields {@link StreamChunk} values as the model generates output.
 * The final chunk always has `{ text: '', done: true }`.
 *
 * ## Response shape handling (FIX-G5)
 * Works correctly with all three response shapes Gemini may emit:
 *   1. SSE with `\n\n` separators
 *   2. SSE with `\r\n\r\n` separators (actual production Gemini)
 *   3. JSON array fallback when `?alt=sse` is silently ignored
 *
 * ## Abort propagation
 * Pass `config.signal` from an AbortController to cancel the in-flight fetch.
 * streaming.ts (FIX-S5) also passes an explicit signal that supersedes this.
 *
 * ## Auto-resume
 * This generator does NOT handle `MAX_TOKENS` continuation automatically.
 * autoResume.ts wraps this generator and issues continuation calls (§2.3).
 *
 * @param config   — call configuration (must include apiKey)
 * @param messages — conversation history in Gemini format
 * @yields         — StreamChunk objects; last chunk has `done: true`
 * @throws {GeminiError} on non-2xx HTTP, blockReason, or SAFETY stop with no tokens
 */
export async function* streamGemini(
  config: GeminiConfig,
  messages: GeminiMessage[],
): AsyncGenerator<StreamChunk> {
  const body = buildRequestBody(config, messages);
  // FIX-G1: ?alt=sse ensures SSE framing is requested.
  const url  = buildUrl(config.model, 'streamGenerateContent', config.apiKey, 'alt=sse');

  const res = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
    signal:  config.signal,
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw parseGeminiError(res.status, errBody, readRetryAfter(res));
  }

  const reader = res.body?.getReader();
  if (!reader) throw new GeminiError(500, 'No response body from Gemini streaming endpoint.');

  const decoder   = new TextDecoder();
  const extractor = new StreamingObjectExtractor();

  let lastFinishReason: string | undefined;
  let yieldedAny = false;
  let aborted    = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // Decode the binary chunk. `stream: true` keeps the decoder's internal
      // state for multi-byte UTF-8 sequences that span network reads.
      const decoded = decoder.decode(value, { stream: true });

      for (const objText of extractor.feed(decoded)) {
        // Parse the extracted JSON object. On malformed JSON (partial chunk
        // that somehow escaped the extractor), skip gracefully.
        let parsed: unknown;
        try {
          parsed = JSON.parse(objText);
        } catch {
          continue;
        }

        const obj = parsed as {
          promptFeedback?: { blockReason?: string };
          candidates?: Array<{
            content?:     { parts?: Array<{ text?: string }> };
            finishReason?: string;
          }>;
        };

        // FIX-G2: promptFeedback.blockReason is a hard stop mid-stream.
        // Raise an error immediately — do not try to continue streaming.
        if (obj?.promptFeedback?.blockReason) {
          aborted = true;
          throw new GeminiError(
            400,
            `Blocked by Gemini: ${obj.promptFeedback.blockReason}`,
          );
        }

        const candidate = obj?.candidates?.[0];
        if (!candidate) continue;

        // Concatenate all text parts in this candidate's content.
        const parts = candidate?.content?.parts ?? [];
        const text  = parts
          .map((p) => (p as { text?: string })?.text ?? '')
          .filter(Boolean)
          .join('');

        // FIX-G4: propagate finishReason from Gemini so autoResume.ts can
        // detect MAX_TOKENS and streaming.ts can see SAFETY / RECITATION.
        const finishReason = candidate?.finishReason;
        if (finishReason) lastFinishReason = finishReason;

        if (text) {
          yieldedAny = true;
          yield { text, done: false, finishReason };
        }
      }
    }
  } finally {
    // Always release the reader lock, even on throw / abort.
    try { reader.releaseLock(); } catch { /* ignore */ }

    if (!aborted) {
      // FIX-G7: if the model stopped for SAFETY or RECITATION but produced
      // zero visible text, raise an explicit error rather than handing the
      // caller a silent empty bubble.
      if (
        !yieldedAny &&
        (lastFinishReason === 'SAFETY' || lastFinishReason === 'RECITATION')
      ) {
        throw new GeminiError(
          400,
          `Response blocked by Gemini (${lastFinishReason}). Try rephrasing.`,
        );
      }

      // Terminal sentinel — callers break their loop on `done === true`.
      yield { text: '', done: true, finishReason: lastFinishReason };
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// § PUBLIC API — COUNT TOKENS (Bug #B25 — FIX-G8)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Count the number of tokens in the provided messages WITHOUT generating output.
 *
 * FIX-G8 / Bug #B25:
 *   `tokenCounter.ts` was an empty stub. The actual REST call to
 *   `/v1beta/models/{model}:countTokens` is implemented here so tokenCounter.ts
 *   can import and call it.
 *
 * ## Usage in this codebase
 *   - Orchestrator: checks token budget before adding full file content to
 *     agent context (PRD §1.2 blueprint selector).
 *   - Blueprint builder: estimates summarization batch cost before
 *     sending Phase B Flash calls (§1.2 "Cost estimate" note).
 *   - Settings → API Keys §2.4 quota health pill (approximate daily TPM used).
 *
 * ## API surface
 *   The countTokens endpoint accepts the same `contents` and `systemInstruction`
 *   format as generateContent. It does NOT accept safetySettings or
 *   generationConfig (they have no effect on token count).
 *
 * @param config   — must include apiKey and model; other fields are optional
 * @param messages — messages to count tokens for
 * @returns        — { totalTokens: number } plus optional cachedContentTokenCount
 * @throws {GeminiError} on HTTP error
 *
 * @example
 * ```ts
 * const { totalTokens } = await countTokens(
 *   { apiKey, model: 'gemini-3-flash-preview' },
 *   toGeminiMessages(chatHistory),
 * );
 * console.log(`Context is ${totalTokens} tokens`);
 * ```
 */
export async function countTokens(
  config: Pick<GeminiConfig, 'apiKey' | 'model' | 'systemInstruction' | 'signal'>,
  messages: GeminiMessage[],
): Promise<TokenCountResult> {
  const body: Record<string, unknown> = { contents: messages };
  if (config.systemInstruction) {
    body['systemInstruction'] = { parts: [{ text: config.systemInstruction }] };
  }

  const url = buildUrl(config.model, 'countTokens', config.apiKey);

  const res = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
    signal:  config.signal,
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw parseGeminiError(res.status, errBody, readRetryAfter(res));
  }

  const data = await res.json() as {
    totalTokens?: number;
    cachedContentTokenCount?: number;
  };

  return {
    totalTokens:              data.totalTokens              ?? 0,
    cachedContentTokenCount:  data.cachedContentTokenCount,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// § PUBLIC API — EMBEDDINGS (FIX-G9)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Generate a text embedding vector using `text-embedding-004`.
 *
 * FIX-G9:
 *   Blueprint builder (Phase 5 keyword matching, Phase 6 Orama vector RAG)
 *   needs to embed file summaries and user prompts. The `text-embedding-004`
 *   model produces 768-dimensional dense float vectors and is free-tier
 *   (100 RPD, 5 RPM per PRD §2.1).
 *
 * ## Task types
 * The Gemini Embeddings API accepts an optional `taskType` that tunes the
 * embedding for specific use cases. Blueprint file summaries should use
 * `RETRIEVAL_DOCUMENT`; query embeddings at prompt time should use
 * `RETRIEVAL_QUERY`.
 *
 * ## Phase 5 / Phase 6 split
 * Phase 5 uses keyword matching (no embeddings, cheaper).
 * Phase 6 replaces keyword matching with Orama in-memory vector search over
 * embedded file summaries (§5.1). This function is wired up now so the
 * interface is stable before the Phase 6 upgrade lands.
 *
 * @param apiKey  — raw Gemini API key
 * @param text    — text to embed (max 2048 tokens for text-embedding-004)
 * @param taskType — embedding task type hint (default: 'RETRIEVAL_DOCUMENT')
 * @param signal  — optional AbortSignal
 * @returns       — { values: number[] } — 768-dimensional float vector
 * @throws {GeminiError} on HTTP error
 *
 * @example
 * ```ts
 * const embedding = await generateEmbedding(apiKey, fileSummary, 'RETRIEVAL_DOCUMENT');
 * // embedding.values is a Float32-precision array of length 768
 * ```
 */
export async function generateEmbedding(
  apiKey: string,
  text: string,
  taskType:
    | 'RETRIEVAL_DOCUMENT'
    | 'RETRIEVAL_QUERY'
    | 'SEMANTIC_SIMILARITY'
    | 'CLASSIFICATION'
    | 'CLUSTERING'
    | 'QUESTION_ANSWERING'
    | 'FACT_VERIFICATION' = 'RETRIEVAL_DOCUMENT',
  signal?: AbortSignal,
): Promise<EmbeddingResult> {
  // text-embedding-004 is the only free embedding model (§2.1).
  const model = 'text-embedding-004';
  const url   = buildUrl(model, 'embedContent', apiKey);

  const body = {
    model:   `models/${model}`,
    content: { parts: [{ text }] },
    taskType,
  };

  const res = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw parseGeminiError(res.status, errBody, readRetryAfter(res));
  }

  const data = await res.json() as {
    embedding?: { values?: number[] };
  };

  const values = data?.embedding?.values;
  if (!values || values.length === 0) {
    throw new GeminiError(500, 'Gemini embedContent returned an empty embedding vector.');
  }

  return { values };
}

// ────────────────────────────────────────────────────────────────────────────
// § GEMINI ERROR CLASS
// ────────────────────────────────────────────────────────────────────────────

/**
 * Strongly-typed error thrown by all public functions in this file.
 *
 * Callers (streaming.ts, autoResume.ts, orchestrator.ts) switch on the boolean
 * flags to decide their recovery strategy:
 *
 *   isQuotaExhausted  → cool down key to midnight PT; rotate to next key
 *   isModelUnavailable → walk FALLBACK_CHAIN[model] (streaming.ts FIX-S11)
 *   isInvalidKey       → mark key dead immediately; rotate (FIX-G13 / FIX-S7)
 *   isRateLimited      → short cooldown (retryAfterSeconds); rotate
 *   retryAfterSeconds  → forward to apiKeyStore.markFailure() for cooldown calc
 */
export class GeminiError extends Error {
  /**
   * True when HTTP 429 + RESOURCE_EXHAUSTED body — daily quota used up.
   * Bug #B31: triggers "resets at midnight PT" banner instead of generic error.
   */
  isQuotaExhausted   = false;
  /**
   * True when HTTP 404 or HTTP 400 with "not found / deprecated / not supported".
   * streaming.ts walks FALLBACK_CHAIN[model] on this flag (FIX-S11).
   */
  isModelUnavailable = false;
  /**
   * True when HTTP 401 or 403 — key is invalid / revoked.
   * FIX-G13: streaming.ts marks the key dead immediately on this flag (FIX-S7).
   */
  isInvalidKey       = false;
  /**
   * Seconds parsed from the `Retry-After` response header (FIX-G3).
   * Forwarded to apiKeyStore.markFailure() to set a precise cooldown.
   * null when the header is absent.
   */
  retryAfterSeconds: number | null = null;

  constructor(public readonly statusCode: number, message: string) {
    super(message);
    this.name = 'GeminiError';
    // Restore the prototype chain for instanceof checks across transpilation
    // (required when targeting ES5 and some bundler configurations).
    Object.setPrototypeOf(this, GeminiError.prototype);
  }

  /**
   * True when HTTP 429 AND NOT a full daily-quota exhaustion.
   * Indicates a burst rate-limit (RPM exceeded) — short cooldown, then rotate.
   */
  get isRateLimited(): boolean {
    return this.statusCode === 429 && !this.isQuotaExhausted;
  }
}
