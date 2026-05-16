import { create } from 'zustand';
import type { RepoBlueprint, BlueprintProgressPhase } from '@/lib/blueprint/types';

export interface GitHubConnection {
  token: string;
  user: {
    login: string;
    name: string | null;
    avatar_url: string;
  } | null;
  repoUrl: string;
  owner: string;
  repo: string;
  ref: string;
  connectedAt: number;
}

export interface BlueprintState {
  blueprints: Record<string, RepoBlueprint>;
  activeBlueprint: RepoBlueprint | null;
  buildingChatId: string | null;

  githubToken: string | null;
  githubUser: GitHubConnection['user'] | null;
  repoConnections: Record<string, GitHubConnection>;

  setBlueprint: (blueprint: RepoBlueprint) => void;
  getBlueprint: (chatId: string) => RepoBlueprint | null;
  setActiveBlueprint: (chatId: string) => void;
  setBuildingChatId: (chatId: string | null) => void;
  /**
   * Update streaming build progress for a blueprint.
   * §1.2 — called by builder.ts on each phase transition.
   * @param label Human-readable status e.g. "Indexed 47/151 files…"
   */
  updateBlueprintProgress: (
    chatId: string,
    phase: BlueprintProgressPhase,
    done: number,
    total: number,
    label: string,
  ) => void;
  /** Mark a blueprint as errored */
  setBlueprintError: (chatId: string, error: string) => void;

  setGitHubToken: (token: string | null) => void;
  setGitHubUser: (user: GitHubConnection['user'] | null) => void;
  connectRepo: (chatId: string, connection: GitHubConnection) => void;
  disconnectRepo: (chatId: string) => void;
  getRepoConnection: (chatId: string) => GitHubConnection | null;
}

export const useBlueprintStore = create<BlueprintState>()((set, get) => ({
  blueprints: {},
  activeBlueprint: null,
  buildingChatId: null,
  githubToken: null,
  githubUser: null,
  repoConnections: {},

  setBlueprint: (blueprint) => {
    set((state) => ({
      blueprints: { ...state.blueprints, [blueprint.chatId]: blueprint },
      activeBlueprint:
        state.activeBlueprint?.chatId === blueprint.chatId ? blueprint : state.activeBlueprint,
    }));
  },

  getBlueprint: (chatId) => get().blueprints[chatId] ?? null,

  setActiveBlueprint: (chatId) => {
    const bp = get().blueprints[chatId];
    set({ activeBlueprint: bp ?? null });
  },

  setBuildingChatId: (chatId) => set({ buildingChatId: chatId }),

  updateBlueprintProgress: (chatId, phase, done, total, label) => {
    set((state) => {
      const existing = state.blueprints[chatId];
      if (!existing) return state;
      const updated: RepoBlueprint = {
        ...existing,
        status: 'building',
        progress: { phase, done, total, label },
      };
      return {
        blueprints: { ...state.blueprints, [chatId]: updated },
        activeBlueprint:
          state.activeBlueprint?.chatId === chatId ? updated : state.activeBlueprint,
      };
    });
  },

  setBlueprintError: (chatId, error) => {
    set((state) => {
      const existing = state.blueprints[chatId];
      if (!existing) return state;
      const updated: RepoBlueprint = { ...existing, status: 'error', error };
      return {
        blueprints: { ...state.blueprints, [chatId]: updated },
        activeBlueprint:
          state.activeBlueprint?.chatId === chatId ? updated : state.activeBlueprint,
      };
    });
  },

  setGitHubToken: (token) => set({ githubToken: token }),
  setGitHubUser: (user) => set({ githubUser: user }),

  connectRepo: (chatId, connection) => {
    set((state) => ({
      repoConnections: { ...state.repoConnections, [chatId]: connection },
      githubToken: connection.token,
      githubUser: connection.user,
    }));
  },

  disconnectRepo: (chatId) => {
    set((state) => {
      const { [chatId]: _removed, ...rest } = state.repoConnections;
      const { [chatId]: _bp, ...bps } = state.blueprints;
      return {
        repoConnections: rest,
        blueprints: bps,
        activeBlueprint: state.activeBlueprint?.chatId === chatId ? null : state.activeBlueprint,
      };
    });
  },

  getRepoConnection: (chatId) => get().repoConnections[chatId] ?? null,
}));
