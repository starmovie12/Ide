import { z } from 'zod';

export const chatMessageSchema = z.object({
  id: z.string(),
  chatId: z.string(),
  role: z.enum(['user', 'agent', 'system']),
  agentId: z.string().optional(),
  agentName: z.string().optional(),
  content: z.string(),
  timestamp: z.number(),
  isStreaming: z.boolean().optional(),
});

export const chatSchema = z.object({
  id: z.string(),
  title: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
  agentIds: z.array(z.string()),
});

export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type Chat = z.infer<typeof chatSchema>;
