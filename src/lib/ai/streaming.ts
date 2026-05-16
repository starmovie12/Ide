/**
 * SSE Streaming handler — Phase 3 (updated to use apiKeyStore)
 */

import { streamGemini, type GeminiConfig, type GeminiMessage, GeminiError } from './gemini';
import { useAPIKeyStore } from '@/lib/store/apiKeyStore';

export type StreamEvent =
  | { type: 'token'; text: string }
  | { type: 'done'; fullText: string }
  | { type: 'error'; message: string };

export type StreamHandler = (event: StreamEvent) => void;

/**
 * Stream a single agent call, with automatic key rotation on 429/401.
 * Uses the apiKeyStore for key management.
 */
export async function streamAgentCall(
  config: Omit<GeminiConfig, 'apiKey'>,
  messages: GeminiMessage[],
  onEvent: StreamHandler,
  maxRetries = 3
): Promise<void> {
  let retries = 0;
  let fullText = '';

  while (retries < maxRetries) {
    const store = useAPIKeyStore.getState();
    const managedKey = store.getNextAvailableKey();
    if (!managedKey) {
      onEvent({ type: 'error', message: 'No active API keys. Add a Gemini API key in Settings.' });
      return;
    }

    try {
      const stream = streamGemini({ ...config, apiKey: managedKey.key }, messages);

      for await (const chunk of stream) {
        if (chunk.text) {
          fullText += chunk.text;
          onEvent({ type: 'token', text: chunk.text });
        }
        if (chunk.done) {
          useAPIKeyStore.getState().markSuccess(managedKey.id);
          onEvent({ type: 'done', fullText });
          return;
        }
      }

      return;
    } catch (err) {
      if (err instanceof GeminiError) {
        useAPIKeyStore.getState().markFailure(managedKey.id);

        if ((err.isRateLimited || err.isInvalidKey) && retries < maxRetries - 1) {
          retries += 1;
          continue;
        }

        onEvent({ type: 'error', message: err.message });
        return;
      }
      onEvent({ type: 'error', message: (err as Error).message });
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
