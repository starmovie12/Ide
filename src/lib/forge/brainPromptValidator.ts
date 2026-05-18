/**
 * Brain Prompt Validator — Part 4 §4.4
 *
 * Enforces the 4000-token hard cap on Brain Prompt content.
 *
 * Token counting strategy: cheap heuristic only. We do NOT call
 * the Gemini countTokens REST endpoint here because (a) the user
 * is typing in real-time and an async call per keystroke is a
 * latency / quota disaster, and (b) the cap exists to prevent
 * runaway context bloat — perfect token accuracy is unnecessary.
 *
 * Heuristic: chars/4 has been empirically within 10–15% of the
 * true Gemini tokenizer for English+code mixes. Conservative
 * enough to keep the actual call's prompt under the engine's
 * Continuum context budget.
 */

export const MAX_BRAIN_PROMPT_TOKENS = 4000;
const CHARS_PER_TOKEN_HEURISTIC = 3.5;
// 3.5 is slightly more conservative than 4 — we'd rather warn the user a
// little early than let a prompt blow up the actual API call budget.

export interface BrainPromptValidationResult {
  ok: boolean;
  tokens: number;
  /** percentage 0–100 of the cap consumed — drives counter color */
  percentage: number;
  /** If !ok, a string truncated to ~MAX_BRAIN_PROMPT_TOKENS for one-click "Trim" UX */
  truncatedSuggestion?: string;
}

/**
 * Synchronous estimator used by the counter UI on every keystroke.
 * Never throws — empty / null returns a zero-token "ok" result so the
 * editor can start fresh.
 */
export function validateBrainPrompt(text: string): BrainPromptValidationResult {
  const safe = text ?? '';
  const tokens = estimateTokens(safe);
  const percentage = Math.min(100, Math.round((tokens / MAX_BRAIN_PROMPT_TOKENS) * 100));

  if (tokens <= MAX_BRAIN_PROMPT_TOKENS) {
    return { ok: true, tokens, percentage };
  }

  // Suggest a truncation that lands at ~95% of the cap so the user has
  // breathing room to continue editing without immediately re-overflowing.
  const targetTokens = Math.floor(MAX_BRAIN_PROMPT_TOKENS * 0.95);
  const targetChars = Math.floor(targetTokens * CHARS_PER_TOKEN_HEURISTIC);
  const truncated =
    safe.slice(0, Math.max(0, targetChars)).trimEnd() + '\n\n<!-- truncated by validator -->';

  return {
    ok: false,
    tokens,
    percentage,
    truncatedSuggestion: truncated,
  };
}

/**
 * Pure token estimator. Exported for use by other Forge code that needs
 * a rough budget check (e.g. CCC builder in Phase 5.10.H).
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN_HEURISTIC);
}

/**
 * Status enum drives counter pill color in BrainPromptEditor.
 *  - healthy  (< 80% — gray)
 *  - warning  (80–100% — amber)
 *  - over     (> 100% — red, Save disabled)
 */
export type BrainPromptStatus = 'healthy' | 'warning' | 'over';

export function statusFor(result: BrainPromptValidationResult): BrainPromptStatus {
  if (!result.ok) return 'over';
  if (result.percentage >= 80) return 'warning';
  return 'healthy';
}
