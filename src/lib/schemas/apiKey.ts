import { z } from 'zod';

export const apiKeySchema = z.object({
  id: z.string(),
  key: z.string().min(10),
  label: z.string().min(1).max(50),
  status: z.enum(['active', 'warning', 'dead']),
  requestCount: z.number().int().min(0),
  lastUsed: z.number().nullable(),
  addedAt: z.number(),
});

export const addAPIKeySchema = apiKeySchema.pick({ key: true, label: true });

export type APIKey = z.infer<typeof apiKeySchema>;
export type AddAPIKey = z.infer<typeof addAPIKeySchema>;
