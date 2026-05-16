/**
 * SSE Streaming handler — v6
 * Bug #B2  — emoji/multi-codepoint chars handled via Array.from() (surrogate-pair safe)
 * Bug #B31 — quota-exhausted surfaces specific banner, not generic "API error"
 */

import { streamGemini, type GeminiConfig, type GeminiMessage, GeminiError } from './gemini';
import { useAPIKeyStore } from '@/lib/store/apiKeyStore';
import { releaseKey } from './keyManager';
import { FALLBACK_CHAIN } from './constants';
import type { GeminiModelId } from './constants';

export type StreamEvent =
  | { type: 'token'; text: string }
  | { type: 'done'; fullText: string }
  | { type: 'error'; message: string; isQuotaExhausted?: boolean; isAllKeysExhausted?: boolean };

export type StreamHandler = (event: StreamEvent) => void;

/**
 * Tokenize a chunk of streamed text into code-point-safe characters.
 * Bug #B2 fix: Array.from() correctly splits surrogate pairs (emoji like ❌ = 1 entry).
 * The old char-by-char regex approach broke on anything outside the BMP.
 */
export function tokenizeStreamChunk(text: string): string[] {
  return Array.from(text);
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

  while (retries < maxRetries) {
    const store = useAPIKeyStore.getState();
    const managedKey = store.getNextAvailableKey();

    if (!managedKey) {
      onEvent({
        type: 'error',
        message: 'No active API keys. Add a Gemini API key in Settings → API Keys.',
        isAllKeysExhausted: true,
      });
      return;
    }

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
        if (chunk.done) {
          store.markSuccess(managedKey.id);
          releaseKey(managedKey.id);
          onEvent({ type: 'done', fullText });
          return;
        }
      }
      return;
    } catch (err) {
      releaseKey(managedKey.id);

      if (err instanceof GeminiError) {
        if (err.isQuotaExhausted) {
          // Mark this key as quota-exhausted (not just dead) — Bug #B31
          store.markFailure(managedKey.id, true);
          retries += 1;
          // Try another key before surfacing error to user
          if (retries < maxRetries) continue;
          onEvent({
            type: 'error',
            message: err.message,
            isQuotaExhausted: true,
            isAllKeysExhausted: store.getNextAvailableKey() === null,
          });
          return;
        }

        if (err.isModelUnavailable) {
          // Try next model in fallback chain — §2.1
          const chain = FALLBACK_CHAIN[currentModel] ?? [];
          if (fallbackIndex < chain.length) {
            currentModel = chain[fallbackIndex] as GeminiModelId;
            fallbackIndex += 1;
            continue; // retry same key with fallback model
          }
          onEvent({ type: 'error', message: err.message });
          return;
        }

        if ((err.isRateLimited || err.isInvalidKey) && retries < maxRetries - 1) {
          store.markFailure(managedKey.id, false);
          retries += 1;
          continue;
        }

        onEvent({ type: 'error', message: err.message });
        return;
      }

      onEvent({ type: 'error', message: (err as Error).message ?? 'Unknown error' });
      return;
    }
  }

  onEvent({ type: 'error', message: 'Max retries exceeded. All keys may be rate-limited.' });
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
