import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ChatMessage {
  id: string;
  role: 'user' | 'agent' | 'system';
  content: string;
  agentId?: string;
  agentName?: string;
  agentEmoji?: string;
  agentColorIndex?: number;
  timestamp: number;
  hasDiff?: boolean;
  isStreaming?: boolean;
}

export interface Chat {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  agentIds: string[];
}

export interface ChatState {
  chats: Chat[];
  activeChatId: string | null;
  messagesByChat: Record<string, ChatMessage[]>;
  streamingMessageId: string | null;
  activeAgentId: string | null;

  getMessages: (chatId: string) => ChatMessage[];
  addMessage: (chatId: string, msg: Omit<ChatMessage, 'id' | 'timestamp'>) => string;
  updateMessage: (chatId: string, id: string, updates: Partial<ChatMessage>) => void;
  appendToMessage: (chatId: string, id: string, token: string) => void;
  clearMessages: (chatId: string) => void;

  createChat: (title?: string) => string;
  switchChat: (id: string) => void;
  updateChatTitle: (id: string, title: string) => void;
  deleteChat: (id: string) => void;

  setStreamingMessageId: (id: string | null) => void;
  setActiveAgentId: (id: string | null) => void;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      chats: [],
      activeChatId: null,
      messagesByChat: {},
      streamingMessageId: null,
      activeAgentId: null,

      getMessages: (chatId) => get().messagesByChat[chatId] ?? [],

      addMessage: (chatId, msg) => {
        const id = crypto.randomUUID();
        const message: ChatMessage = { ...msg, id, timestamp: Date.now() };
        set((state) => ({
          messagesByChat: {
            ...state.messagesByChat,
            [chatId]: [...(state.messagesByChat[chatId] ?? []), message],
          },
        }));
        return id;
      },

      updateMessage: (chatId, id, updates) => {
        set((state) => ({
          messagesByChat: {
            ...state.messagesByChat,
            [chatId]: (state.messagesByChat[chatId] ?? []).map((m) =>
              m.id === id ? { ...m, ...updates } : m
            ),
          },
        }));
      },

      appendToMessage: (chatId, id, token) => {
        set((state) => ({
          messagesByChat: {
            ...state.messagesByChat,
            [chatId]: (state.messagesByChat[chatId] ?? []).map((m) =>
              m.id === id ? { ...m, content: m.content + token } : m
            ),
          },
        }));
      },

      clearMessages: (chatId) => {
        set((state) => ({
          messagesByChat: { ...state.messagesByChat, [chatId]: [] },
        }));
      },

      createChat: (title = 'New Chat') => {
        const id = crypto.randomUUID();
        const now = Date.now();
        set((state) => ({
          chats: [{ id, title, createdAt: now, updatedAt: now, agentIds: [] }, ...state.chats],
          activeChatId: id,
          messagesByChat: { ...state.messagesByChat, [id]: [] },
        }));
        return id;
      },

      switchChat: (id) => set({ activeChatId: id }),

      updateChatTitle: (id, title) =>
        set((state) => ({
          chats: state.chats.map((c) =>
            c.id === id ? { ...c, title, updatedAt: Date.now() } : c
          ),
        })),

      deleteChat: (id) =>
        set((state) => {
          const chats = state.chats.filter((c) => c.id !== id);
          const { [id]: _removed, ...rest } = state.messagesByChat;
          return {
            chats,
            messagesByChat: rest,
            activeChatId:
              state.activeChatId === id ? (chats[0]?.id ?? null) : state.activeChatId,
          };
        }),

      setStreamingMessageId: (id) => set({ streamingMessageId: id }),
      setActiveAgentId: (id) => set({ activeAgentId: id }),
    }),
    {
      name: 'chat-storage',
      partialize: (state) => ({
        chats: state.chats,
        activeChatId: state.activeChatId,
        messagesByChat: state.messagesByChat,
      }),
    }
  )
);
