import { db, type DBChat, type DBMessage } from './dexie';

export async function getChat(id: string): Promise<DBChat | undefined> {
  return db.chats.get(id);
}

export async function getChats(): Promise<DBChat[]> {
  return db.chats.orderBy('updatedAt').reverse().toArray();
}

export async function saveChat(chat: DBChat): Promise<string> {
  await db.chats.put(chat);
  return chat.id;
}

export async function deleteChat(id: string): Promise<void> {
  await db.transaction('rw', db.chats, db.messages, async () => {
    await db.chats.delete(id);
    await db.messages.where('chatId').equals(id).delete();
  });
}

export async function getChatMessages(chatId: string): Promise<DBMessage[]> {
  return db.messages.where('chatId').equals(chatId).sortBy('timestamp');
}

export async function saveMessage(message: DBMessage): Promise<string> {
  await db.messages.put(message);
  return message.id;
}

export async function deleteMessage(id: string): Promise<void> {
  await db.messages.delete(id);
}
