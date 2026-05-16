import { useCallback } from 'react';
import { useChatStore } from '@/lib/store/chatStore';
import { callGemini } from '@/lib/ai/gemini';
import { useAPIKeyStore } from '@/lib/store/apiKeyStore';
import { BLUEPRINT_MODEL } from '@/lib/ai/constants';

/**
 * Bug #B11: Auto-generate a short title for a chat after the first user message.
 */
export function useAutoTitle() {
  const updateChatTitle = useChatStore((s) => s.updateChatTitle);
  const getNextAvailableKey = useAPIKeyStore((s) => s.getNextAvailableKey);

  const autoTitle = useCallback(async (chatId: string, firstUserMessage: string) => {
    const apiKey = getNextAvailableKey();
    if (!apiKey) return;

    try {
      const title = await callGemini(
        {
          apiKey: apiKey.key,
          model: BLUEPRINT_MODEL,
          temperature: 0.3,
          maxOutputTokens: 20,
        },
        [
          {
            role: 'user',
            parts: [{
              text: `Write a short title (4-6 words max, no punctuation, no quotes) for a chat that starts with:\n"${firstUserMessage.slice(0, 300)}"\n\nReturn ONLY the title, nothing else.`,
            }],
          },
        ]
      );

      const cleaned = title.trim().replace(/^["']|["']$/g, '').replace(/\.$/, '').slice(0, 60);
      if (cleaned.length > 3) {
        updateChatTitle(chatId, cleaned);
      }
    } catch {
      // Auto-title is best-effort — silently ignore failures
    }
  }, [getNextAvailableKey, updateChatTitle]);

  return { autoTitle };
}
