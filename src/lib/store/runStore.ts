/**
 * Run Store — Phase 5 §4.9
 * Tracks pipeline executions and open PRs in memory + Dexie.
 * Bug #B32: stale-blueprint banner state also managed here.
 */

import { create } from 'zustand';
import { db } from '@/lib/db/dexie';
import type { DBRun, DBPullRequest } from '@/lib/db/dexie';
import type { SandboxMode } from '@/lib/sandbox/types';
import type { SearchReplaceBlock } from '@/lib/diff/parser';

// ─── Types ────────────────────────────────────────────────────────────────────

export type RunStatus = DBRun['status'];
export type PRStatus  = DBPullRequest['status'];

export interface RunRecord {
  id: string;
  chatId: string;
  prompt: string;
  startedAt: number;
  finishedAt?: number;
  status: RunStatus;
  agents: Array<{ name: string; model: string; tokensIn: number; tokensOut: number; durationMs: number }>;
  diffs: SearchReplaceBlock[];
  sandboxMode: SandboxMode | 'skip';
  healAttempts: number;
  prNumber?: number;
  prUrl?: string;
  previewUrl?: string;
  errorTail?: string;
}

export interface PRRecord {
  id: string;
  chatId: string;
  prNumber: number;
  prUrl: string;
  branch: string;
  repoUrl: string;
  status: PRStatus;
  previewUrl?: string;
  createdAt: number;
  updatedAt: number;
}

// ─── Store ────────────────────────────────────────────────────────────────────

interface RunStoreState {
  /** In-memory map chatId → latest run */
  runsByChatId: Record<string, RunRecord>;
  /** Open PRs keyed by chatId */
  prsByChatId:  Record<string, PRRecord>;
  /** Whether a run is in-flight for a chat */
  isRunning: (chatId: string) => boolean;

  startRun:   (run: RunRecord) => Promise<void>;
  updateRun:  (id: string, patch: Partial<RunRecord>) => Promise<void>;
  finishRun:  (id: string, status: RunStatus, patch?: Partial<RunRecord>) => Promise<void>;
  upsertPR:   (pr: PRRecord) => Promise<void>;
  updatePRStatus: (chatId: string, status: PRStatus, patch?: Partial<PRRecord>) => Promise<void>;
  loadFromDB: (chatId: string) => Promise<void>;
}

export const useRunStore = create<RunStoreState>((set, get) => ({
  runsByChatId: {},
  prsByChatId:  {},

  isRunning: (chatId) => {
    const run = get().runsByChatId[chatId];
    return run?.status === 'pending' || run?.status === 'running';
  },

  startRun: async (run) => {
    set((s) => ({
      runsByChatId: { ...s.runsByChatId, [run.chatId]: run },
    }));
    try {
      await db.runs.put({
        ...run,
        diffs: run.diffs,
        agents: run.agents,
      });
    } catch { /* IndexedDB writes are best-effort */ }
  },

  updateRun: async (id, patch) => {
    set((s) => {
      const updated = { ...s.runsByChatId };
      for (const [chatId, run] of Object.entries(updated)) {
        if (run.id === id) {
          updated[chatId] = { ...run, ...patch };
        }
      }
      return { runsByChatId: updated };
    });
    try {
      await db.runs.update(id, patch as Partial<DBRun>);
    } catch { /* best-effort */ }
  },

  finishRun: async (id, status, patch = {}) => {
    const finishedAt = Date.now();
    set((s) => {
      const updated = { ...s.runsByChatId };
      for (const [chatId, run] of Object.entries(updated)) {
        if (run.id === id) {
          updated[chatId] = { ...run, ...patch, status, finishedAt };
        }
      }
      return { runsByChatId: updated };
    });
    try {
      await db.runs.update(id, { ...patch, status, finishedAt } as Partial<DBRun>);
    } catch { /* best-effort */ }
  },

  upsertPR: async (pr) => {
    set((s) => ({
      prsByChatId: { ...s.prsByChatId, [pr.chatId]: pr },
    }));
    try {
      await db.prs.put({
        id: pr.id,
        chatId: pr.chatId,
        prNumber: pr.prNumber,
        prUrl: pr.prUrl,
        branch: pr.branch,
        repoUrl: pr.repoUrl,
        status: pr.status,
        previewUrl: pr.previewUrl,
        createdAt: pr.createdAt,
        updatedAt: pr.updatedAt,
      });
    } catch { /* best-effort */ }
  },

  updatePRStatus: async (chatId, status, patch = {}) => {
    const updatedAt = Date.now();
    set((s) => {
      const existing = s.prsByChatId[chatId];
      if (!existing) return s;
      return {
        prsByChatId: {
          ...s.prsByChatId,
          [chatId]: { ...existing, ...patch, status, updatedAt },
        },
      };
    });
    const existing = get().prsByChatId[chatId];
    if (existing) {
      try {
        await db.prs.update(existing.id, { ...patch, status, updatedAt } as Partial<DBPullRequest>);
      } catch { /* best-effort */ }
    }
  },

  loadFromDB: async (chatId) => {
    try {
      const [runs, prs] = await Promise.all([
        db.runs.where('chatId').equals(chatId).sortBy('startedAt'),
        db.prs.where('chatId').equals(chatId).toArray(),
      ]);
      if (runs.length > 0) {
        const latest = runs[runs.length - 1];
        set((s) => ({
          runsByChatId: {
            ...s.runsByChatId,
            [chatId]: latest as unknown as RunRecord,
          },
        }));
      }
      if (prs.length > 0) {
        const latest = prs[prs.length - 1];
        set((s) => ({
          prsByChatId: {
            ...s.prsByChatId,
            [chatId]: latest as unknown as PRRecord,
          },
        }));
      }
    } catch { /* best-effort */ }
  },
}));
