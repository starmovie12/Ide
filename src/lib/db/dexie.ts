import Dexie, { type Table } from 'dexie';

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

export class AIAgentStudioDB extends Dexie {
  agents!: Table<DBAgent, string>;
  chats!: Table<DBChat, string>;
  messages!: Table<DBMessage, string>;
  files!: Table<DBFile, string>;
  versions!: Table<DBVersion, string>;
  settings!: Table<DBSettings, string>;
  apiKeys!: Table<DBAPIKey, string>;

  constructor() {
    super('AIAgentStudioDB');
    this.version(1).stores({
      agents: 'id, name, isTemplate, createdAt',
      chats: 'id, title, createdAt, updatedAt',
      messages: 'id, chatId, role, timestamp',
      files: 'id, chatId, path, updatedAt',
      versions: 'id, chatId, timestamp',
      settings: 'id, key',
      apiKeys: 'id, status, addedAt',
    });
  }
}

export const db = new AIAgentStudioDB();
