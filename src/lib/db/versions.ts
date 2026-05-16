import { db, type DBVersion } from './dexie';

export async function getVersions(chatId: string): Promise<DBVersion[]> {
  return db.versions.where('chatId').equals(chatId).sortBy('timestamp');
}

export async function getVersion(id: string): Promise<DBVersion | undefined> {
  return db.versions.get(id);
}

export async function saveVersion(version: DBVersion): Promise<string> {
  await db.versions.put(version);
  return version.id;
}

export async function deleteVersion(id: string): Promise<void> {
  await db.versions.delete(id);
}

export async function restoreVersion(id: string): Promise<DBVersion | undefined> {
  const version = await db.versions.get(id);
  return version;
}
