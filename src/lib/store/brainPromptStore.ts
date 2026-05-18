/**
 * Brain Prompt Store — Part 4 §4.2
 *
 * Owns the user's per-chat Brain Prompt (project rules, style guide,
 * personal voice) AND the global default they save once and inherit
 * into every new chat.
 *
 * The orchestrator (Phase 5.10.H) injects this into the Ustaad persona
 * at the `<user_provided_brain>` anchor — see Part 4 §4.3.
 *
 * Hard cap of 4000 tokens is enforced in brainPromptValidator.ts at
 * write time; this store does no validation itself (it can't — counting
 * tokens needs the tokenCounter which is async).
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useChatStore } from '@/lib/store/chatStore';
import { useMemo } from 'react';

interface BrainPromptState {
  /** Saved-as-default brain prompt — inherited by new chats. */
  defaultPrompt: string;

  /** Per-chat overrides. Falls back to defaultPrompt if missing. */
  perChatPrompts: Record<string, string>;

  /** Read the prompt for a chat (or default if no per-chat override). */
  getForChat: (chatId: string | null | undefined) => string;

  /** Write the prompt for a specific chat. */
  setForChat: (chatId: string, prompt: string) => void;

  /** Promote a prompt to global default — all future new chats inherit it. */
  saveAsDefault: (prompt: string) => void;

  /** Remove a chat-specific prompt, letting it fall back to default. */
  clearForChat: (chatId: string) => void;
}

export const useBrainPromptStore = create<BrainPromptState>()(
  persist(
    (set, get) => ({
      defaultPrompt: '',
      perChatPrompts: {},

      getForChat: (chatId) => {
        const state = get();
        if (!chatId) return state.defaultPrompt;
        const override = state.perChatPrompts[chatId];
        // Empty string is a valid override ("user explicitly cleared it for this chat").
        // Only fall back to default when there is NO entry at all.
        return override !== undefined ? override : state.defaultPrompt;
      },

      setForChat: (chatId, prompt) => {
        set((state) => ({
          perChatPrompts: { ...state.perChatPrompts, [chatId]: prompt },
        }));
      },

      saveAsDefault: (prompt) => set({ defaultPrompt: prompt }),

      clearForChat: (chatId) => {
        set((state) => {
          if (!(chatId in state.perChatPrompts)) return state;
          const next = { ...state.perChatPrompts };
          delete next[chatId];
          return { perChatPrompts: next };
        });
      },
    }),
    {
      name: 'forge-brain-prompt',
      partialize: (state) => ({
        defaultPrompt: state.defaultPrompt,
        perChatPrompts: state.perChatPrompts,
      }),
    },
  ),
);

/**
 * Convenience hook — reads/writes the brain prompt for the currently active
 * chat. If no chat is active, reads the default and writes to a sentinel
 * "unsaved" bucket (cleared automatically when the user actually creates a chat).
 *
 * Returns a stable tuple so it can be destructured like useState.
 */
const UNSAVED_CHAT_KEY = '__forge_unsaved__';

export function useBrainPrompt(): [string, (p: string) => void] {
  const activeChatId = useChatStore((s) => s.activeChatId);
  const getForChat = useBrainPromptStore((s) => s.getForChat);
  const setForChat = useBrainPromptStore((s) => s.setForChat);

  const value = getForChat(activeChatId ?? UNSAVED_CHAT_KEY);

  // useMemo prevents the setter identity from churning every render and
  // forcing downstream BrainPromptEditor to re-effect on each keystroke.
  const setter = useMemo(
    () => (p: string) => setForChat(activeChatId ?? UNSAVED_CHAT_KEY, p),
    [activeChatId, setForChat],
  );

  return [value, setter];
}
