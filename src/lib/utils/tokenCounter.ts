/**
 * Rough token estimator for Gemini models.
 * Rule of thumb: ~4 chars per token for English text.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function estimateMessagesTokens(
  messages: Array<{ role: string; content: string }>
): number {
  return messages.reduce((acc, m) => acc + estimateTokens(m.content) + 4, 0);
}

/** Returns true if the conversation is approaching a given token budget. */
export function isNearTokenLimit(
  messages: Array<{ role: string; content: string }>,
  limitTokens: number,
  thresholdPercent = 0.85
): boolean {
  return estimateMessagesTokens(messages) >= limitTokens * thresholdPercent;
}

export const GEMINI_TOKEN_LIMITS: Record<string, number> = {
  'gemini-2.5-flash': 1_000_000,
  'gemini-2.5-pro': 1_000_000,
  'gemini-2.0-flash': 1_000_000,
  'gemini-1.5-flash': 1_000_000,
  'gemini-3-flash': 1_000_000,
  'gemini-3.1-pro': 1_000_000,
};
