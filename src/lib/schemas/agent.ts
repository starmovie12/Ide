import { z } from 'zod';

export const AgentSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(50),
  emoji: z.string(),
  role: z.string().default(''),
  systemPrompt: z.string(),
  brainNotes: z.string().optional(),
  brainFileIds: z.array(z.object({
    id: z.string(),
    fileName: z.string(),
    chunkCount: z.number(),
  })).default([]),
  model: z.enum([
    'gemini-2.5-pro',
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-1.5-flash',
    'gemini-3-flash',
    'gemini-3.1-pro',
  ]),
  temperature: z.number().min(0).max(2).default(0.7),
  routeOutputTo: z.string().nullable().default(null),
  active: z.boolean().default(false),
  isTemplate: z.boolean().default(false),
  isDefault: z.boolean().default(false),
  templateId: z.string().optional(),
  color: z.string().default('#7c6af7'),
  order: z.number().default(0),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export const CreateAgentSchema = AgentSchema.omit({ id: true, createdAt: true, updatedAt: true });

export type Agent = z.infer<typeof AgentSchema>;
export type CreateAgent = z.infer<typeof CreateAgentSchema>;
