import { db, type DBAgent } from './dexie';

export async function getAgent(id: string): Promise<DBAgent | undefined> {
  return db.agents.get(id);
}

export async function getAgents(): Promise<DBAgent[]> {
  return db.agents.orderBy('createdAt').reverse().toArray();
}

export async function getTemplateAgents(): Promise<DBAgent[]> {
  return db.agents.where('isTemplate').equals(1 as unknown as string).toArray();
}

export async function saveAgent(agent: DBAgent): Promise<string> {
  await db.agents.put(agent);
  return agent.id;
}

export async function upsertAgent(agent: DBAgent): Promise<string> {
  await db.agents.put(agent);
  return agent.id;
}

export async function deleteAgent(id: string): Promise<void> {
  await db.agents.delete(id);
}
