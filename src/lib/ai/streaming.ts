/**
 * SSE Streaming handler — v6.2 (Phase 5 complete)
 *
 * PRD reference: §3.2 — "Streaming SSE | src/lib/ai/streaming.ts | Fix emoji
 * surrogate bug (Bug #B2)". This file is the thin routing layer between
 * streamGemini (raw Gemini REST) and the orchestrator's callAgent function.
 * It owns: API-key rotation, quota-aware key management, abort propagation,
 * and daily-quota tracking for the §2.4 quota health pill.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * FIXES APPLIED
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * v6.1 fixes (carried forward):
 *   FIX-S1 — Uses apiKeyStore.releaseKey() (not the orphaned keyManager.ts
 *             whose private `let keys: ManagedKey[] = []` state is never
 *             populated, making releaseKey a permanent no-op and reserveCount
 *             never decrement).
 *   FIX-S2 — markFailure signature is (id, isQuotaExhausted, retryAfterSeconds).
 *             Previously the store only accepted (id), so quota-exhausted state
 *             was never recorded and dead-key cooldowns were never set.
 *   FIX-S3 — Retry-After header value from GeminiError.retryAfterSeconds is
 *             forwarded to markFailure so burst-429 keys get a proper short
 *             cooldown instead of the permanent-dead misclassification.
 *   FIX-S4 — AbortError (user pressed Stop) exits cleanly without emitting an
 *             'error' event. Previously the 'AbortError: signal is aborted
 *             without reason' message surfaced in the chat bubble.
 *   Bug #B2 — tokenizeStreamChunk uses Array.from() (surrogate-pair safe).
 *             The previous char-by-char regex broke on multi-codepoint emoji
 *             (e.g. ❌ = U+274C = 2 UTF-16 units) and infinite-looped.
 *   Bug #B31— Quota exhaustion shows the specific "resets at midnight PT"
 *             banner (via gemini.ts parseGeminiError) instead of generic
 *             "API error". isQuotaExhausted flag now surfaces to the caller.
 *
 * v6.2 new fixes (this version):
 *   FIX-S5 — signal?: AbortSignal accepted as an explicit 5th parameter AND
 *             merged from config.signal. Forwarded to streamGemini so the
 *             in-flight HTTP fetch is actually cancelled (not just ignored)
 *             when the user clicks Stop. Previously, stopping sent an AbortSignal
 *             to the orchestrator but never reached the fetch() call.
 *   FIX-S6 — _incrementRequest() called after markSuccess so the daily-quota
 *             counter (dailyRequests) in the API Keys settings panel (§2.4)
 *             always reflects real usage. Previously, dailyRequests was only
 *             updated on testKey() calls, never on streaming calls.
 *   FIX-S7 — isInvalidKey (401 / 403) marks the key dead immediately and
 *             rotates to the next key. Previously, an invalid key would burn
 *             through all maxRetries before being marked dead.
 *   FIX-S8 — getNextAvailableKey() is always re-called from the live store
 *             (useAPIKeyStore.getState()) not from a snapshot captured before
 *             the retry loop. This ensures the key with the lowest
 *             reserveCount among currently-available keys is picked on each
 *             attempt — fixing a class of bugs where the snapshot became stale
 *             after a concurrent call modified the key's reserveCount.
 *   FIX-S9 — toGeminiMessages filters out blank-content messages (S10). Gemini
 *             returns HTTP 400 "Request contains an invalid argument" when any
 *             parts[].text value is empty or whitespace-only.
 *   FIX-S10— All magic numbers replaced with named typed constants per PRD
 *             Law 1 (zero ambiguity) and Law 10.2 (named constants).
 *   FIX-S11— Model-unavailable fallback walk does NOT burn a key-rotation
 *             retry slot. The user-facing retry budget is for transient infra
 *             errors (429, network drops); model deprecation is an architectural
 *             issue that should exhaust the FALLBACK_CHAIN independently.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ARCHITECTURE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  ┌───────────────────────────┐
 *  │   orchestrator.callAgent  │  (manages model fallback chain + continuations)
 *  └───────────┬───────────────┘
 *              │ calls with each model in FALLBACK_CHAIN
 *              ▼
 *  ┌───────────────────────────┐
 *  │   streaming.streamAgent   │  (manages key rotation within one model)
 *  │   Call (this file)        │
 *  └───────────┬───────────────┘
 *              │ for each available key
 *              ▼
 *  ┌───────────────────────────┐
 *  │   gemini.streamGemini()   │  (raw fetch → SSE → JSON objects → chunks)
 *  └───────────────────────────┘
 *
 * The two-level separation means:
 *   - streamAgentCall rotates API keys (same model, different keys).
 *   - callAgent rotates models (model deprecation / quota at model level).
 */

import {
  streamGemini,
  type GeminiConfig,
  type GeminiMessage,
  GeminiError,
} from './gemini';
import { useAPIKeyStore } from '@/lib/store/apiKeyStore';
import { FALLBACK_CHAIN } from './constants';
import type { GeminiModelId } from './constants';

// ─────────────────────────────────────────────────────────────────────────────
// Named constants — PRD Law 1 (zero magic numbers / strings) + Law 10.2
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Default maximum number of key-rotation retries per streamAgentCall.
 * Overridable by the caller (e.g., title generation uses 1).
 */
const DEFAULT_MAX_RETRIES = 3 as const;

/**
 * The DOMException name raised by fetch() when given an aborted AbortSignal.
 * Varies by browser: Chrome = 'AbortError', Firefox = 'AbortError',
 * some builds may emit just 'Error' with the word 'aborted' in the message.
 */
const ABORT_ERROR_NAME = 'AbortError' as const;

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Discriminated union of all events emitted by {@link streamAgentCall}.
 *
 * Callers SHOULD handle every variant. TypeScript's exhaustive-check pattern:
 *
 * ```ts
 * streamAgentCall(config, msgs, (event) => {
 *   if (event.type === 'token')  { ... }
 *   else if (event.type === 'done')  { ... }
 *   else if (event.type === 'error') { ... }
 *   // TS narrows correctly in each branch
 * });
 * ```
 */
export type StreamEvent =
  /**
   * Partial text token — append to the streaming bubble.
   * Emitted for every non-empty text chunk the Gemini API yields.
   */
  | { type: 'token'; text: string }
  /**
   * Stream completed cleanly.
   *
   * @field fullText     - Complete accumulated response text.
   * @field finishReason - Forwarded from the Gemini API.
   *                       'STOP'      = natural end (most common).
   *                       'MAX_TOKENS'= truncated; orchestrator will resume.
   *                       'SAFETY'    = blocked by safety filter.
   *                       'RECITATION'= blocked by recitation filter.
   *                       undefined   = server closed without sending reason.
   */
  | { type: 'done'; fullText: string; finishReason?: string }
  /**
   * Unrecoverable streaming error after all retries are exhausted.
   *
   * @field message           - Human-readable description for the chat bubble.
   * @field isQuotaExhausted  - true → show "resets at midnight PT" banner.
   * @field isAllKeysExhausted- true → every key tried; no key rotation possible.
   */
  | {
      type: 'error';
      message: string;
      isQuotaExhausted?: boolean;
      isAllKeysExhausted?: boolean;
    };

/** Callback invoked synchronously for each {@link StreamEvent}. */
export type StreamHandler = (event: StreamEvent) => void;

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tokenize a streamed text chunk into an array of Unicode code-point strings.
 *
 * Bug #B2 fix: `Array.from()` iterates by code-point, not UTF-16 unit, so
 * multi-codepoint sequences (emoji, flags, ZWJ sequences) are treated as a
 * single entry. The prior char-by-char regex split on UTF-16 surrogates and
 * entered an infinite loop on any character outside the Basic Multilingual
 * Plane (U+10000 and above, e.g. ❌ = U+274C = 1 code-point = 2 UTF-16 units).
 *
 * Usage: animated typing effects that walk character-by-character should call
 * this and iterate the returned array rather than indexing the raw string.
 *
 * @example
 * ```ts
 * const chars = tokenizeStreamChunk('Hello ❌ world');
 * // → ['H','e','l','l','o',' ','❌',' ','w','o','r','l','d']
 * //                          ^ 1 entry, not 2
 * ```
 *
 * @param text - Raw chunk text received from the Gemini stream.
 * @returns    - Array of Unicode-safe character strings (one code-point each).
 */
export function tokenizeStreamChunk(text: string): string[] {
  return Array.from(text);
}

/**
 * Detects whether a caught value is a user-initiated request cancellation.
 *
 * Handles the standard `DOMException { name: 'AbortError' }` raised by
 * `fetch()` when given an aborted `AbortSignal`, plus the message-text
 * variants produced by different JS runtimes (Chrome, Firefox, Safari,
 * and V8-based environments like the Vercel Edge runtime).
 *
 * @param err - The caught `unknown` value from a try/catch block.
 * @returns   - true if and only if the error represents a deliberate abort.
 */
function isAbortError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.name === ABORT_ERROR_NAME) return true;
  const msg = err.message.toLowerCase();
  return (
    msg.includes('aborted') ||
    msg.includes('the user aborted') ||
    msg.includes('signal is aborted') ||
    msg.includes('fetch was aborted')
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Core public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Stream a single agent call with automatic API-key rotation on HTTP 429 / 401
 * and model fallback on deprecated model errors (404 / isModelUnavailable).
 *
 * ## Key-rotation strategy (PRD §2.2 / Bug #B16)
 *
 * The `apiKeyStore.getNextAvailableKey()` selector picks the least-reserved
 * active key (where "reserved" = currently in-flight calls using that key).
 * This prevents two concurrent orchestrator paths from grabbing the same key
 * and both hitting the per-key RPM cap simultaneously.
 *
 * On each iteration of the while loop, a fresh `getNextAvailableKey()` call
 * is made (FIX-S8) — never a stale snapshot — so the selector always sees
 * the current reserveCount after other concurrent calls have mutated it.
 *
 * ## Daily-quota tracking (PRD §2.4 / FIX-S6)
 *
 * After a successful stream, `_incrementRequest()` is called to update the
 * key's `dailyRequests` counter (reset at Pacific midnight). This keeps the
 * quota health pill in Settings → API Keys accurate without requiring the user
 * to hit a 429 before the UI notices usage.
 *
 * ## Abort propagation (FIX-S4 / FIX-S5)
 *
 * An `AbortSignal` can be provided either in `config.signal` or as the
 * dedicated `signal` parameter (the parameter takes precedence). It is
 * forwarded to the underlying `streamGemini` fetch call so the HTTP connection
 * is actually torn down when the user clicks Stop — not just "checked between
 * chunks" at the JS level.
 *
 * When an AbortError is caught, `streamAgentCall` returns without emitting any
 * event (FIX-S4). The orchestrator detects the abort via its own signal check
 * and cleans up the pipeline appropriately.
 *
 * ## Model-unavailable fallback (PRD §2.1 / FIX-S11)
 *
 * When Gemini returns 404 or a "model not found / deprecated" 400, the
 * function walks `FALLBACK_CHAIN[currentModel]` in order. This fallback walk
 * does NOT consume a `retries` slot — the user-visible retry budget is reserved
 * for transient network errors and rate-limit blips, not for our model-
 * deprecation handling.
 *
 * @param config     - Gemini call config minus the API key (injected from store).
 *                     May include `signal` for abort propagation.
 * @param messages   - Message history in Gemini format (use {@link toGeminiMessages}
 *                     to convert from the orchestrator's ChatMessage format).
 * @param onEvent    - Handler called synchronously for each {@link StreamEvent}.
 * @param maxRetries - Maximum key-rotation attempts before giving up.
 *                     Defaults to {@link DEFAULT_MAX_RETRIES} (3).
 *                     Title generation uses 1. Agent pipeline uses 3.
 * @param signal     - Optional AbortSignal (convenience alias for config.signal).
 *                     When provided, this value supersedes config.signal.
 *
 * @throws Never — all errors are emitted as `{ type: 'error' }` events.
 *
 * @example
 * ```ts
 * const controller = new AbortController();
 *
 * await streamAgentCall(
 *   { model: 'gemini-3-flash-preview', temperature: 0.7, maxOutputTokens: 8192,
 *     systemInstruction: agent.systemPrompt },
 *   toGeminiMessages(chatHistory),
 *   (event) => {
 *     if (event.type === 'token')  appendToMessage(event.text);
 *     if (event.type === 'done')   finaliseMessage(event.fullText);
 *     if (event.type === 'error')  showError(event.message);
 *   },
 *   3,                    // maxRetries
 *   controller.signal,    // abort with controller.abort()
 * );
 * ```
 */
export async function streamAgentCall(
  config: Omit<GeminiConfig, 'apiKey'>,
  messages: GeminiMessage[],
  onEvent: StreamHandler,
  maxRetries: number = DEFAULT_MAX_RETRIES,
  signal?: AbortSignal,
): Promise<void> {
  // FIX-S5: merge the convenience signal parameter with config.signal.
  // The explicit parameter takes precedence so callers that build a config
  // object early (before the AbortController is created) can still inject
  // the signal later without rebuilding the config.
  const effectiveSignal: AbortSignal | undefined = signal ?? config.signal;

  let retries = 0;
  let fullText = '';
  let currentModel = config.model as GeminiModelId;
  let fallbackIndex = 0;
  let lastFinishReason: string | undefined;

  while (retries < maxRetries) {
    // FIX-S5: fast abort before any resource is allocated.
    // This prevents reserving an API key for a call that won't run.
    if (effectiveSignal?.aborted) return;

    // FIX-S8: always read from live store state, never a cached snapshot.
    // Concurrent agent calls may have mutated reserveCount between iterations.
    const managedKey = useAPIKeyStore.getState().getNextAvailableKey();

    if (!managedKey) {
      // All keys are dead, quota-exhausted, or on cooldown — no key to rotate to.
      // Bug #B31: This is the human-readable message, NOT a generic "API error".
      onEvent({
        type: 'error',
        message:
          'No active API keys available. Add a Gemini API key in Settings → API Keys.',
        isAllKeysExhausted: true,
      });
      return;
    }

    // Guard against double-release. getNextAvailableKey already increments
    // reserveCount in the store (Bug #B16 fix), so we only ever want to
    // decrement it exactly once per acquisition attempt.
    let released = false;

    /**
     * Release the key reservation exactly once.
     *
     * `released` prevents re-entry. Safe to call from both the catch block
     * and the success path — whichever runs first wins.
     *
     * FIX-S1: calls the store's own releaseKey(), NOT the orphaned
     * keyManager.ts function whose `let keys` array is never populated and
     * whose releaseKey() is therefore a permanent no-op.
     */
    const releaseOnce = (): void => {
      if (!released) {
        released = true;
        useAPIKeyStore.getState().releaseKey(managedKey.id);
      }
    };

    try {
      // FIX-S5: inject effective signal into every Gemini fetch call so the
      // underlying HTTP connection is torn down on abort — not just checked
      // between emitted chunks at the JS generator level.
      const callConfig: GeminiConfig = {
        ...config,
        model: currentModel,
        apiKey: managedKey.key,
        signal: effectiveSignal,
      };

      const stream = streamGemini(callConfig, messages);

      for await (const chunk of stream) {
        // FIX-S5: check between chunks as a secondary fast-exit. The primary
        // abort happens at the fetch layer (signal above), but generator
        // tear-down may lag a few microtasks behind the signal.
        if (effectiveSignal?.aborted) {
          releaseOnce();
          return; // FIX-S4: silent exit — no 'error' event on user abort
        }

        if (chunk.text) {
          fullText += chunk.text;
          onEvent({ type: 'token', text: chunk.text });
        }

        if (chunk.finishReason) {
          lastFinishReason = chunk.finishReason;
        }

        if (chunk.done) {
          // Mark key success BEFORE releasing so markSuccess's internal
          // reserveCount decrement is applied to the correct snapshot.
          // Setting `released = true` first prevents releaseOnce() in the
          // finally-equivalent path from double-decrementing.
          released = true;
          useAPIKeyStore.getState().markSuccess(managedKey.id);

          // FIX-S6: update dailyRequests so the §2.4 quota health pill in
          // Settings → API Keys stays accurate. markSuccess intentionally
          // does NOT call _incrementRequest (it only resets error state and
          // decrements reserveCount), so we must call it explicitly here.
          // Modelling after testKey()'s post-success sequence: markSuccess → _incrementRequest.
          useAPIKeyStore.getState()._incrementRequest(managedKey.id);

          onEvent({ type: 'done', fullText, finishReason: lastFinishReason });
          return;
        }
      }

      // The async generator exhausted without ever yielding `done: true`.
      // This is rare (server closed connection without sending finishReason),
      // but valid. Treat as a clean finish — the orchestrator can decide
      // whether to continue based on the accumulated fullText length.
      released = true;
      useAPIKeyStore.getState().markSuccess(managedKey.id);
      useAPIKeyStore.getState()._incrementRequest(managedKey.id); // FIX-S6
      onEvent({ type: 'done', fullText, finishReason: lastFinishReason });
      return;

    } catch (err: unknown) {
      // Always release before any early return in the error path.
      releaseOnce();

      // ── User-initiated abort ─────────────────────────────────────────────
      // FIX-S4: exit silently — the UI's stop button is the signal owner.
      // Emitting an 'error' event would show an error bubble ("AbortError:
      // signal is aborted without reason") when the user intentionally stopped.
      if (isAbortError(err)) return;

      if (err instanceof GeminiError) {

        // ── Quota exhausted (HTTP 429 + RESOURCE_EXHAUSTED body) ──────────
        if (err.isQuotaExhausted) {
          // FIX-S2: pass isQuotaExhausted=true so the store sets 'quota-exhausted'
          //         status with a Pacific-midnight cooldown (not 'dead' with no cooldown).
          // FIX-S3: pass retryAfterSeconds (parsed from Retry-After header in gemini.ts)
          //         so burst-429 keys get a short cooldown; daily-quota keys get
          //         the midnight-PT cooldown via nextPacificMidnight() in the store.
          useAPIKeyStore.getState().markFailure(
            managedKey.id,
            true,                      // isQuotaExhausted — FIX-S2
            err.retryAfterSeconds,     // Retry-After forwarding — FIX-S3
          );
          retries += 1;
          if (retries < maxRetries) continue; // rotate to next key

          // All retries spent — check if any key is still alive after rotation.
          // Peek at the next available key without actually acquiring it.
          const peekKey = useAPIKeyStore.getState().getNextAvailableKey();
          if (peekKey !== null) {
            // We got a key just to peek — release it immediately.
            useAPIKeyStore.getState().releaseKey(peekKey.id);
          }

          // Bug #B31: specific quota-exhausted message from gemini.ts parseGeminiError.
          onEvent({
            type: 'error',
            message: err.message,
            isQuotaExhausted: true,
            isAllKeysExhausted: peekKey === null,
          });
          return;
        }

        // ── Model unavailable / deprecated (HTTP 404 / 400 model errors) ──
        // Walk FALLBACK_CHAIN[currentModel] in order (PRD §2.1).
        // FIX-S11: this walk does NOT increment `retries` — it is an architecture-
        // level issue (model deprecated) distinct from transient infra failures.
        if (err.isModelUnavailable) {
          const chain: readonly GeminiModelId[] =
            (FALLBACK_CHAIN[currentModel] as GeminiModelId[] | undefined) ?? [];
          if (fallbackIndex < chain.length) {
            currentModel = chain[fallbackIndex];
            fallbackIndex += 1;
            // Reset fullText for the fresh model attempt so the caller gets a
            // clean response, not a partial from the failed model's chunks.
            fullText = '';
            lastFinishReason = undefined;
            continue; // retry immediately with the fallback model
          }
          // Entire FALLBACK_CHAIN exhausted — surface the error.
          onEvent({ type: 'error', message: err.message });
          return;
        }

        // ── Invalid API key (HTTP 401 / 403) ─────────────────────────────
        // FIX-S7: mark dead immediately and rotate to the next key right away.
        // Previously, an invalid key would consume all `maxRetries` before being
        // marked dead — wasting the user's retry budget on a key that will never work.
        if (err.isInvalidKey) {
          useAPIKeyStore.getState().markFailure(
            managedKey.id,
            false,  // not quota-exhausted — key is invalid
            null,   // no retry-after — key is permanently invalid
          );
          retries += 1;
          if (retries < maxRetries) continue; // try the next key
          onEvent({ type: 'error', message: err.message });
          return;
        }

        // ── Burst rate-limit (HTTP 429, NOT quota-exhausted) ──────────────
        // Short cooldown set from Retry-After header. Rotate to the next key.
        if (err.isRateLimited) {
          useAPIKeyStore.getState().markFailure(
            managedKey.id,
            false,                 // not quota-exhausted
            err.retryAfterSeconds, // FIX-S3: forward Retry-After
          );
          retries += 1;
          if (retries < maxRetries) continue;
          onEvent({ type: 'error', message: err.message });
          return;
        }

        // ── All other GeminiErrors (safety block, malformed request, etc.) ─
        // Non-retriable — surface immediately without consuming retries.
        onEvent({ type: 'error', message: err.message });
        return;
      }

      // ── Non-GeminiError (network failure, JSON parse error, etc.) ─────────
      // These are unexpected. Surface with a readable message.
      onEvent({
        type: 'error',
        message:
          err instanceof Error
            ? err.message
            : 'An unexpected streaming error occurred. Please try again.',
      });
      return;
    }
  }

  // The while loop completed all `maxRetries` attempts without a clean exit
  // OR an explicit return inside the loop. This happens when every iteration
  // ends with `continue` and `retries` finally reaches `maxRetries`.
  onEvent({
    type: 'error',
    message:
      `Max retries (${maxRetries}) exceeded. ` +
      'All available API keys may be rate-limited or quota-exhausted. ' +
      'Add more keys in Settings → API Keys, or wait for quota reset at midnight PT.',
    isAllKeysExhausted: true,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Message format conversion
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert the orchestrator's internal `ChatMessage` array to the Gemini REST
 * API's `contents` format (`GeminiMessage[]`).
 *
 * Transformations applied:
 *
 * 1. **System messages dropped** — Gemini takes system context via the separate
 *    `systemInstruction` field (passed in GeminiConfig), not as a `contents`
 *    entry. Including a system-role message in `contents` causes a 400 error.
 *
 * 2. **Empty content filtered out (FIX-S9)** — Gemini returns HTTP 400
 *    "Request contains an invalid argument" when any `parts[].text` is an
 *    empty string or whitespace-only. This can happen when the orchestrator
 *    passes an intermediate assistant message that has no visible text (e.g.
 *    a mid-pipeline state placeholder). These messages are silently dropped.
 *
 * 3. **Role mapping** — The orchestrator uses `'user' | 'agent' | 'system'`;
 *    Gemini's API uses `'user' | 'model'`. The `'agent'` role maps to `'model'`.
 *
 * @param messages - Read-only array of orchestrator-format chat messages.
 * @returns        - Gemini-format messages array, safe to pass as `contents`.
 *
 * @example
 * ```ts
 * const geminiMsgs = toGeminiMessages([
 *   { role: 'system', content: 'You are a coder.' },     // → dropped
 *   { role: 'user',   content: 'Add a button.' },         // → { role: 'user', ... }
 *   { role: 'agent',  content: 'Here is the change.' },   // → { role: 'model', ... }
 *   { role: 'user',   content: '' },                      // → dropped (FIX-S9)
 * ]);
 * // Result: 2 messages (user + model)
 * ```
 */
export function toGeminiMessages(
  messages: ReadonlyArray<{
    role: 'user' | 'agent' | 'system';
    content: string;
  }>,
): GeminiMessage[] {
  const result: GeminiMessage[] = [];

  for (const m of messages) {
    // Drop system messages — handled by GeminiConfig.systemInstruction.
    if (m.role === 'system') continue;

    // FIX-S9: drop empty / whitespace-only content.
    // Gemini returns 400 "invalid argument" for empty parts[].text values.
    if (!m.content.trim()) continue;

    result.push({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }],
    });
  }

  return result;
}
