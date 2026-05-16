import { z } from 'zod';

export const diffBlockSchema = z.object({
  id: z.string(),
  filePath: z.string(),
  searchContent: z.string(),
  replaceContent: z.string(),
  status: z.enum(['pending', 'accepted', 'rejected']),
  agentId: z.string(),
  timestamp: z.number(),
});

export type DiffBlock = z.infer<typeof diffBlockSchema>;
