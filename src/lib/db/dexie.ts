/**
 * Dexie DB — v6 Phase 5 update
 * Added: blueprints, runs, prs tables (§4.3, §4.9)
 * Bug #B24: navigator.storage.persist() called on init to prevent eviction.
 */

import Dexie, { type Table } from 'dexie';
import type { SearchReplaceBlock } from '@/lib/diff/parser';
import type { SandboxMode } from '@/lib/sandbox/types';

export interface DBAgent {
  id: string;
  name: string;
  emoji: string;
  role: string;
  model: string;
  systemPrompt: string;
  temperature: number;
  routeOutputTo: string | null;
  isTemplate: boolean;
  color: string;
  createdAt: number;
}

export interface DBChat {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  agentIds: string[];
}

export interface DBMessage {
  id: string;
  chatId: string;
  role: 'user' | 'agent' | 'system';
  agentId?: string;
  agentName?: string;
  content: string;
  timestamp: number;
}

export interface DBFile {
  id: string;
  chatId: string;
  path: string;
  content: string;
  language: string;
  updatedAt: number;
}

export interface DBVersion {
  id: string;
  chatId: string;
  files: Record<string, string>;
  description: string;
  timestamp: number;
  agentId?: string;
}

export interface DBSettings {
  id: string;
  key: string;
  value: unknown;
}

export interface DBAPIKey {
  id: string;
  key: string;
  label: string;
  status: 'active' | 'warning' | 'dead';
  requestCount: number;
  lastUsed: number | null;
  addedAt: number;
}

/** Blueprint record — Phase 5 §4.3 */
export interface DBBlueprint {
  id: string;
  chatId: string;
  repoUrl: string;
  ref: string;            // branch HEAD SHA at build time
  buildAt: number;
  status: 'building' | 'ready' | 'error';
  /** JSON-serialised RepoBlueprint (compressed) */
  data: string;
}

/** Pipeline run record — Phase 5 §4.9 */
export interface DBRun {
  id: string;
  chatId: string;
  prompt: string;
  startedAt: number;
  finishedAt?: number;
  status: 'pending' | 'running' | 'success' | 'heal-failed' | 'cancelled' | 'error';
  agents: Array<{ name: string; model: string; tokensIn: number; tokensOut: number; durationMs: number }>;
  diffs: SearchReplaceBlock[];
  sandboxMode: SandboxMode | 'skip';
  healAttempts: number;
  prNumber?: number;
  prUrl?: string;
  previewUrl?: string;
  errorTail?: string;
}

/** Open PR record — Phase 5 §4.9 */
export interface DBPullRequest {
  id: string;
  chatId: string;
  prNumber: number;
  prUrl: string;
  branch: string;
  repoUrl: string;
  status: 'open' | 'merged' | 'closed' | 'ci-pending' | 'ci-success' | 'ci-failed' | 'preview-ready';
  previewUrl?: string;
  createdAt: number;
  updatedAt: number;
}

export class AIAgentStudioDB extends Dexie {
  agents!: Table<DBAgent, string>;
  chats!: Table<DBChat, string>;
  messages!: Table<DBMessage, string>;
  files!: Table<DBFile, string>;
  versions!: Table<DBVersion, string>;
  settings!: Table<DBSettings, string>;
  apiKeys!: Table<DBAPIKey, string>;
  blueprints!: Table<DBBlueprint, string>;
  runs!: Table<DBRun, string>;
  prs!: Table<DBPullRequest, string>;

  constructor() {
    super('AIAgentStudioDB');

    // v1 — original schema
    this.version(1).stores({
      agents:   'id, name, isTemplate, createdAt',
      chats:    'id, title, createdAt, updatedAt',
      messages: 'id, chatId, role, timestamp',
      files:    'id, chatId, path, updatedAt',
      versions: 'id, chatId, timestamp',
      settings: 'id, key',
      apiKeys:  'id, status, addedAt',
    });

    // v2 — Phase 5: blueprint, runs, prs tables (§4.3, §4.9)
    this.version(2).stores({
      agents:     'id, name, isTemplate, createdAt',
      chats:      'id, title, createdAt, updatedAt',
      messages:   'id, chatId, role, timestamp',
      files:      'id, chatId, path, updatedAt',
      versions:   'id, chatId, timestamp',
      settings:   'id, key',
      apiKeys:    'id, status, addedAt',
      blueprints: 'id, chatId, repoUrl, ref, buildAt, [repoUrl+ref]',
      runs:       'id, chatId, startedAt, status',
      prs:        'id, chatId, prNumber, branch, repoUrl, status, updatedAt',
    });
  }
}

export const db = new AIAgentStudioDB();

/**
 * Bug #B24 — Request persistent storage on boot to prevent IndexedDB eviction.
 * Call once at app startup (e.g. in main.tsx).
 * https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  try {
    const granted = await navigator.storage.persist();
    return granted;
  } catch {
    return false;
  }
}

/**
 * Get storage usage estimate for the health UI.
 */
export async function getStorageEstimate(): Promise<{ usageBytes: number; quotaBytes: number } | null> {
  if (!navigator.storage?.estimate) return null;
  try {
    const est = await navigator.storage.estimate();
    return {
      usageBytes: est.usage ?? 0,
      quotaBytes: est.quota ?? 0,
    };
  } catch {
    return null;
  }
}
