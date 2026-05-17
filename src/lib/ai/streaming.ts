/**
 * SSE Streaming handler — v6.1
 *
 * Fixes (May 2026):
 *   FIX-S1 — Previously imported `releaseKey` from `./keyManager`, which has
 *            its own private `let keys: ManagedKey[] = []` state that is never
 *            populated (no `loadKeys()` call exists anywhere in the codebase).
 *            So `releaseKey` was a permanent no-op and `reserveCount` never
 *            decremented anywhere observable. Now we use the apiKeyStore's
 *            own `releaseKey` so reserveCount actually moves.
 *   FIX-S2 — `store.markFailure(id, true)` used to silently drop the 2nd arg
 *            because the store's signature was `markFailure(id)`. Quota-
 *            exhausted state was therefore never recorded. Now matches the
 *            new store signature (id, isQuotaExhausted, retryAfterSeconds).
 *   FIX-S3 — Retry-After is forwarded from GeminiError to markFailure so the
 *            store sets a proper cooldown for burst 429s.
 *   FIX-S4 — When stream throws AbortError (user pressed Stop), we exit
 *            cleanly without emitting an `error` event — previously this
 *            surfaced as "AbortError: signal is aborted without reason".
 *
 *   Pre-existing:
 *   Bug #B2  — emoji/multi-codepoint chars handled via Array.from() (surrogate-pair safe)
 *   Bug #B31 — quota-exhausted surfaces specific banner, not generic "API error"
 */

import { streamGemini, type GeminiConfig, type GeminiMessage, GeminiError } from './gemini';
import { useAPIKeyStore } from '@/lib/store/apiKeyStore';
import { FALLBACK_CHAIN } from './constants';
import type { GeminiModelId } from './constants';

export type StreamEvent =
  | { type: 'token'; text: string }
  | { type: 'done'; fullText: string; finishReason?: string }
  | {
      type: 'error';
      message: string;
      isQuotaExhausted?: boolean;
      isAllKeysExhausted?: boolean;
    };

export type StreamHandler = (event: StreamEvent) => void;

/**
 * Tokenize a chunk of streamed text into code-point-safe characters.
 * Bug #B2 fix: Array.from() correctly splits surrogate pairs (emoji like ❌ = 1 entry).
 * The old char-by-char regex approach broke on anything outside the BMP.
 */
export function tokenizeStreamChunk(text: string): string[] {
  return Array.from(text);
}

function isAbortError(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.name === 'AbortError' ||
      err.message.toLowerCase().includes('aborted') ||
      err.message.toLowerCase().includes('the user aborted'))
  );
}

/**
 * Stream a single agent call with automatic key rotation on 429/401
 * and model fallback on deprecated model (404 / isModelUnavailable).
 */
export async function streamAgentCall(
  config: Omit<GeminiConfig, 'apiKey'>,
  messages: GeminiMessage[],
  onEvent: StreamHandler,
  maxRetries = 3
): Promise<void> {
  let retries = 0;
  let fullText = '';
  let currentModel = config.model as GeminiModelId;
  let fallbackIndex = 0;
  let lastFinishReason: string | undefined;

  while (retries < maxRetries) {
    const store = useAPIKeyStore.getState();
    const managedKey = store.getNextAvailableKey();

    if (!managedKey) {
      onEvent({
        type: 'error',
        message:
          'No active API keys. Add a Gemini API key in Settings → API Keys.',
        isAllKeysExhausted: true,
      });
      return;
    }

    let released = false;
    const release = () => {
      if (!released) {
        released = true;
        useAPIKeyStore.getState().releaseKey(managedKey.id);
      }
    };

    try {
      const stream = streamGemini(
        { ...config, apiKey: managedKey.key, model: currentModel },
        messages
      );

      for await (const chunk of stream) {
        if (chunk.text) {
          fullText += chunk.text;
          onEvent({ type: 'token', text: chunk.text });
        }
        if (chunk.finishReason) lastFinishReason = chunk.finishReason;
        if (chunk.done) {
          // markSuccess internally decrements reserveCount; mark released
          // before calling so our finally-block release is a no-op.
          released = true;
          useAPIKeyStore.getState().markSuccess(managedKey.id);
          onEvent({ type: 'done', fullText, finishReason: lastFinishReason });
          return;
        }
      }
      // Stream ended without `done: true` (rare — server closed early).
      release();
      onEvent({ type: 'done', fullText, finishReason: lastFinishReason });
      return;
    } catch (err) {
      release();

      if (isAbortError(err)) {
        // User-initiated cancel — exit silently. The UI's stop button is the
        // signal owner; surfacing this as an error confuses the user.
        return;
      }

      if (err instanceof GeminiError) {
        if (err.isQuotaExhausted) {
          // FIX-S2 — store now records 'quota-exhausted' status + cooldown
          useAPIKeyStore
            .getState()
            .markFailure(managedKey.id, true, err.retryAfterSeconds);
          retries += 1;
          if (retries < maxRetries) continue;
          onEvent({
            type: 'error',
            message: err.message,
            isQuotaExhausted: true,
            isAllKeysExhausted:
              useAPIKeyStore.getState().getNextAvailableKey() === null,
          });
          return;
        }

        if (err.isModelUnavailable) {
          // Try next model in fallback chain — §2.1
          const chain = FALLBACK_CHAIN[currentModel] ?? [];
          if (fallbackIndex < chain.length) {
            currentModel = chain[fallbackIndex] as GeminiModelId;
            fallbackIndex += 1;
            // Don't burn a retry slot on a model-fallback retry — the user-facing
            // budget is for transient infra errors, not for our own fallback walk.
            continue;
          }
          onEvent({ type: 'error', message: err.message });
          return;
        }

        if (err.isRateLimited || err.isInvalidKey) {
          useAPIKeyStore
            .getState()
            .markFailure(managedKey.id, false, err.retryAfterSeconds);
          if (retries < maxRetries - 1) {
            retries += 1;
            continue;
          }
        }

        onEvent({ type: 'error', message: err.message });
        return;
      }

      onEvent({
        type: 'error',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
      return;
    }
  }

  onEvent({
    type: 'error',
    message: 'Max retries exceeded. All keys may be rate-limited.',
  });
}

/** Convert a ChatMessage array to Gemini message format */
export function toGeminiMessages(
  messages: Array<{ role: 'user' | 'agent' | 'system'; content: string }>
): GeminiMessage[] {
  return messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }],
    }));
}
