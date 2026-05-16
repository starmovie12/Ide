/**
 * Agent Draft Store — Phase 5 Bug #B30
 * Autosaves unsaved agent form changes per keystroke.
 * EditAgentView reads/writes here to prevent data loss on navigation.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface AgentDraft {
  agentId: string;
  name: string;
  emoji: string;
  role: string;
  model: string;
  systemPrompt: string;
  temperature: number;
  color: string;
  savedAt: number;
}

interface AgentDraftStoreState {
  /** Map of agentId → draft */
  drafts: Record<string, AgentDraft>;

  /** Save (or update) a draft for an agent — call on every form field change */
  saveDraft: (agentId: string, fields: Omit<AgentDraft, 'agentId' | 'savedAt'>) => void;

  /** Retrieve draft for an agent, or null if none */
  getDraft: (agentId: string) => AgentDraft | null;

  /** Clear the draft after a successful save to DB */
  clearDraft: (agentId: string) => void;

  /** Returns true if the agent has unsaved changes */
  hasDraft: (agentId: string) => boolean;
}

export const useAgentDraftStore = create<AgentDraftStoreState>()(
  persist(
    (set, get) => ({
      drafts: {},

      saveDraft: (agentId, fields) => {
        set((s) => ({
          drafts: {
            ...s.drafts,
            [agentId]: {
              ...fields,
              agentId,
              savedAt: Date.now(),
            },
          },
        }));
      },

      getDraft: (agentId) => {
        return get().drafts[agentId] ?? null;
      },

      clearDraft: (agentId) => {
        set((s) => {
          const next = { ...s.drafts };
          delete next[agentId];
          return { drafts: next };
        });
      },

      hasDraft: (agentId) => {
        return agentId in get().drafts;
      },
    }),
    {
      name: 'agent-draft-store',
      // Only persist the drafts — no derived state
      partialize: (state) => ({ drafts: state.drafts }),
    },
  ),
);
