/**
 * Run Recorder — Phase 5 §4.9
 * Records every full pipeline execution in Dexie `runs` table.
 * Provides the run history UI and audit trail.
 */

import { db } from '@/lib/db/dexie';
import type { SearchReplaceBlock } from '@/lib/diff/parser';
import type { SandboxMode } from '@/lib/sandbox/types';

export interface AgentRunEntry {
  name: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  durationMs: number;
}

export type RunStatus = 'pending' | 'running' | 'success' | 'heal-failed' | 'cancelled' | 'error';

export interface RunRecord {
  id: string;
  chatId: string;
  prompt: string;
  startedAt: number;
  finishedAt?: number;
  status: RunStatus;
  agents: AgentRunEntry[];
  diffs: SearchReplaceBlock[];
  sandboxMode: SandboxMode | 'skip';
  healAttempts: number;
  prNumber?: number;
  prUrl?: string;
  previewUrl?: string;
  errorTail?: string;
}

/** Start a new run record and return its ID */
export async function startRun(chatId: string, prompt: string): Promise<string> {
  const id = crypto.randomUUID();
  await db.runs.add({
    id,
    chatId,
    prompt,
    startedAt: Date.now(),
    status: 'running',
    agents: [],
    diffs: [],
    sandboxMode: 'skip',
    healAttempts: 0,
  });
  return id;
}

/** Update a run with partial data */
export async function updateRun(id: string, patch: Partial<RunRecord>): Promise<void> {
  await db.runs.update(id, patch as Record<string, unknown>);
}

/** Mark a run as complete */
export async function finishRun(
  id: string,
  status: RunStatus,
  extra?: Partial<RunRecord>
): Promise<void> {
  await db.runs.update(id, {
    finishedAt: Date.now(),
    status,
    ...extra,
  } as Record<string, unknown>);
}

/** Get all runs for a chat, newest first */
export async function getRunsForChat(chatId: string): Promise<RunRecord[]> {
  return db.runs.where('chatId').equals(chatId).reverse().sortBy('startedAt') as Promise<RunRecord[]>;
}

/** Get a single run by ID */
export async function getRun(id: string): Promise<RunRecord | undefined> {
  return db.runs.get(id) as Promise<RunRecord | undefined>;
}

/** Add an agent entry to the run */
export async function addAgentEntry(runId: string, entry: AgentRunEntry): Promise<void> {
  const run = await db.runs.get(runId) as RunRecord | undefined;
  if (!run) return;
  const agents = [...(run.agents ?? []), entry];
  await db.runs.update(runId, { agents });
}

/** Append diffs to the run */
export async function addDiffsToRun(runId: string, newDiffs: SearchReplaceBlock[]): Promise<void> {
  const run = await db.runs.get(runId) as RunRecord | undefined;
  if (!run) return;
  const diffs = [...(run.diffs ?? []), ...newDiffs];
  await db.runs.update(runId, { diffs });
}

/** Prune runs older than 30 days to respect IndexedDB budget */
export async function pruneOldRuns(): Promise<void> {
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const old = await (db.runs as { where: (k: string) => { below: (v: number) => { primaryKeys: () => Promise<string[]> } } })
    .where('startedAt')
    .below(cutoff)
    .primaryKeys();
  await db.runs.bulkDelete(old as string[]);
}
