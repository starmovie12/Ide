import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { deepClone } from '@/lib/utils/deepClone';

export interface Agent {
  id: string;
  name: string;
  emoji: string;
  role: string;
  model: string;
  systemPrompt: string;
  brainNotes?: string;
  brainFileIds?: Array<{ id: string; fileName: string; chunkCount: number }>;
  temperature: number;
  routeOutputTo: string | null;
  isTemplate: boolean;
  isDefault: boolean;
  color: string;
  order: number;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface AgentState {
  // ── Template agents (global library, saved to store/IndexedDB) ──
  templateAgents: Agent[];

  // ── Chat-local instances (deep-cloned from templates on chat creation) ──
  // NOT persisted — lives in memory; cleared on page reload (by design for privacy)
  chatAgents: Record<string, Agent[]>;

  // ── Backward-compat alias (= templateAgents) ──
  agents: Agent[];
  activeAgents: Agent[];

  // ── Template actions ──
  addTemplate: (agent: Omit<Agent, 'id' | 'createdAt' | 'updatedAt' | 'isTemplate'>) => string;
  updateTemplate: (id: string, updates: Partial<Agent>) => void;
  deleteTemplate: (id: string) => void;
  reorderTemplates: (orderedIds: string[]) => void;

  // ── Backward-compat wrappers ──
  addAgent: (agent: Omit<Agent, 'id' | 'createdAt' | 'updatedAt' | 'active' | 'isDefault' | 'order'>) => void;
  removeAgent: (id: string) => void;
  updateAgent: (id: string, updates: Partial<Agent>) => void;
  toggleActive: (id: string) => void;
  reorderAgents: (orderedIds: string[]) => void;

  // ── Chat-instance actions ──
  cloneTemplatesToChat: (chatId: string) => void;
  addAgentToChat: (chatId: string, agentOrTemplate: Agent | Omit<Agent, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateChatAgent: (chatId: string, agentId: string, updates: Partial<Agent>) => void;
  removeChatAgent: (chatId: string, agentId: string) => void;
  reorderChatAgents: (chatId: string, orderedIds: string[]) => void;
  getChatAgents: (chatId: string) => Agent[];
}

function computeActive(agents: Agent[]): Agent[] {
  return agents.filter((a) => a.active).sort((a, b) => a.order - b.order);
}

export const useAgentStore = create<AgentState>()(
  persist(
    (set, get) => ({
      templateAgents: [],
      chatAgents: {},
      agents: [],
      activeAgents: [],

      // ── Template actions ──
      addTemplate: (agentData) => {
        const id = crypto.randomUUID();
        const now = Date.now();
        const order = get().templateAgents.length;
        const agent: Agent = {
          ...agentData,
          id,
          isTemplate: true,
          order,
          createdAt: now,
          updatedAt: now,
        };
        set((state) => {
          const templateAgents = [...state.templateAgents, agent];
          return { templateAgents, agents: templateAgents, activeAgents: computeActive(templateAgents) };
        });
        return id;
      },

      updateTemplate: (id, updates) => {
        set((state) => {
          const templateAgents = state.templateAgents.map((a) =>
            a.id === id ? { ...a, ...updates, updatedAt: Date.now() } : a
          );
          return { templateAgents, agents: templateAgents, activeAgents: computeActive(templateAgents) };
        });
      },

      deleteTemplate: (id) => {
        set((state) => {
          const templateAgents = state.templateAgents.filter((a) => a.id !== id);
          return { templateAgents, agents: templateAgents, activeAgents: computeActive(templateAgents) };
        });
      },

      reorderTemplates: (orderedIds) => {
        set((state) => {
          const templateAgents = state.templateAgents.map((a) => {
            const idx = orderedIds.indexOf(a.id);
            return idx !== -1 ? { ...a, order: idx, updatedAt: Date.now() } : a;
          }).sort((a, b) => a.order - b.order);
          return { templateAgents, agents: templateAgents, activeAgents: computeActive(templateAgents) };
        });
      },

      // ── Backward-compat wrappers ──
      addAgent: (agentData) => {
        const fullData = agentData as Partial<Agent> & typeof agentData;
        get().addTemplate({
          ...agentData,
          active: fullData.active ?? false,
          isDefault: fullData.isDefault ?? false,
          order: fullData.order ?? get().templateAgents.length,
        });
      },

      removeAgent: (id) => get().deleteTemplate(id),
      updateAgent: (id, updates) => get().updateTemplate(id, updates),
      reorderAgents: (orderedIds) => get().reorderTemplates(orderedIds),

      toggleActive: (id) => {
        set((state) => {
          const templateAgents = state.templateAgents.map((a) =>
            a.id === id ? { ...a, active: !a.active, updatedAt: Date.now() } : a
          );
          return { templateAgents, agents: templateAgents, activeAgents: computeActive(templateAgents) };
        });
      },

      // ── Chat-instance actions ──
      cloneTemplatesToChat: (chatId) => {
        const { templateAgents } = get();
        const defaultTemplates = templateAgents.filter((a) => a.isDefault || a.active);
        const clones = defaultTemplates.map((t) => ({
          ...deepClone(t),
          id: crypto.randomUUID(),
          isTemplate: false,
        }));
        set((state) => ({
          chatAgents: { ...state.chatAgents, [chatId]: clones },
        }));
      },

      addAgentToChat: (chatId, agentOrTemplate) => {
        const newAgent: Agent = 'id' in agentOrTemplate
          ? { ...deepClone(agentOrTemplate as Agent), id: crypto.randomUUID(), isTemplate: false }
          : {
              ...(agentOrTemplate as Omit<Agent, 'id' | 'createdAt' | 'updatedAt'>),
              id: crypto.randomUUID(),
              isTemplate: false,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            };
        set((state) => {
          const existing = state.chatAgents[chatId] ?? [];
          return { chatAgents: { ...state.chatAgents, [chatId]: [...existing, newAgent] } };
        });
      },

      updateChatAgent: (chatId, agentId, updates) => {
        set((state) => {
          const existing = state.chatAgents[chatId] ?? [];
          const updated = existing.map((a) =>
            a.id === agentId ? { ...a, ...updates, updatedAt: Date.now() } : a
          );
          return { chatAgents: { ...state.chatAgents, [chatId]: updated } };
        });
      },

      removeChatAgent: (chatId, agentId) => {
        set((state) => {
          const existing = state.chatAgents[chatId] ?? [];
          return { chatAgents: { ...state.chatAgents, [chatId]: existing.filter((a) => a.id !== agentId) } };
        });
      },

      reorderChatAgents: (chatId, orderedIds) => {
        set((state) => {
          const existing = state.chatAgents[chatId] ?? [];
          const reordered = existing.map((a) => {
            const idx = orderedIds.indexOf(a.id);
            return idx !== -1 ? { ...a, order: idx } : a;
          }).sort((a, b) => a.order - b.order);
          return { chatAgents: { ...state.chatAgents, [chatId]: reordered } };
        });
      },

      getChatAgents: (chatId) => {
        return get().chatAgents[chatId] ?? [];
      },
    }),
    {
      name: 'agent-storage',
      partialize: (state) => ({
        templateAgents: state.templateAgents,
        agents: state.templateAgents,
        activeAgents: state.activeAgents,
        // chatAgents intentionally NOT persisted — chat agents are cloned fresh each session
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Sync backward-compat aliases after rehydration
          state.agents = state.templateAgents;
          state.activeAgents = state.templateAgents.filter((a) => a.active).sort((a, b) => a.order - b.order);
        }
      },
    }
  )
);
