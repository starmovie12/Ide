import { db, type DBFile } from './dexie';

export async function getFile(id: string): Promise<DBFile | undefined> {
  return db.files.get(id);
}

export async function getFiles(chatId: string): Promise<DBFile[]> {
  return db.files.where('chatId').equals(chatId).toArray();
}

export async function getFileByPath(chatId: string, path: string): Promise<DBFile | undefined> {
  return db.files.where(['chatId', 'path'] as unknown as string).equals([chatId, path]).first();
}

export async function saveFile(file: DBFile): Promise<string> {
  await db.files.put(file);
  return file.id;
}

export async function deleteFile(id: string): Promise<void> {
  await db.files.delete(id);
}

export async function deleteChatFiles(chatId: string): Promise<void> {
  await db.files.where('chatId').equals(chatId).delete();
}
