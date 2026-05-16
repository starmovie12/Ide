/**
 * Size-Aware Edit Validator — Phase 5 §1.3
 *
 * Enforces the surgical editing decision matrix from the PRD.
 * Called by orchestrator AFTER Coder emits, BEFORE apply() runs.
 * On failure, orchestrator silently re-prompts Coder with the suggestion.
 */

import type { SearchReplaceBlock } from './parser';
import type { RepoBlueprint } from '@/lib/blueprint/types';

export type ValidationStatus = 'ok' | 'oversized-rewrite' | 'non-unique-anchor' | 'new-file';

export interface ValidationResult {
  ok: boolean;
  status: ValidationStatus;
  /** Human-readable reason shown to orchestrator for re-prompt construction */
  message?: string;
  /** How the orchestrator should respond: retry with stricter prompt or just warn */
  suggestion?: 'retry-with-surgical-prompt' | 'retry-with-more-context' | 'none';
  /** The specific block that triggered the failure */
  offendingBlock?: SearchReplaceBlock;
}

/**
 * Decision matrix from PRD §1.3:
 *
 * | Change scope         | File size  | Allowed mode            |
 * |----------------------|------------|-------------------------|
 * | 1–15 lines changing  | Any        | Surgical SEARCH/REPLACE |
 * | 16–50 lines changing | < 200 loc  | Surgical multi-block    |
 * | 16–50 lines changing | ≥ 200 loc  | Surgical only (no FWR)  |
 * | 50–200 changing      | < 200 loc  | Full rewrite OK         |
 * | 50–200 changing      | ≥ 200 loc  | Surgical only           |
 * | New file             | N/A        | Full rewrite OK         |
 *
 * RED FLAGS caught here:
 *   1. AI is replacing > 70% of a file with ≥ 200 lines — oversized rewrite
 *   2. SEARCH block has < 2 lines in a file with > 20 lines — anchor not unique
 */
export function validateDiffSize(
  blocks: SearchReplaceBlock[],
  blueprint: RepoBlueprint
): ValidationResult {
  for (const block of blocks) {
    const file = blueprint.files.find((f) => f.path === block.filePath);

    if (!file) {
      // New file — full rewrite always allowed
      continue;
    }

    const fileLines = file.lines;
    const replaceLines = block.replace.split('\n').length;
    const searchLines = block.search.split('\n').length;

    // RED FLAG 1 — oversized rewrite
    // Only fire when file ≥ 200 lines AND replace covers > 70% of it.
    if (fileLines >= 200 && replaceLines > 0) {
      const replaceRatio = replaceLines / fileLines;
      if (replaceRatio > 0.7) {
        return {
          ok: false,
          status: 'oversized-rewrite',
          message:
            `Coder is rewriting ${Math.round(replaceRatio * 100)}% of ${block.filePath} ` +
            `(${fileLines} lines). Per surgical editing rules, this must be broken into ` +
            `targeted SEARCH/REPLACE blocks touching only the changed lines.`,
          suggestion: 'retry-with-surgical-prompt',
          offendingBlock: block,
        };
      }
    }

    // RED FLAG 2 — SEARCH anchor too short to be unique
    // Single-line SEARCH in a file with > 20 lines is likely to match multiple places.
    if (searchLines < 2 && fileLines > 20 && block.search.trim().length > 0) {
      return {
        ok: false,
        status: 'non-unique-anchor',
        message:
          `SEARCH for ${block.filePath} has only ${searchLines} line — ` +
          `not unique enough in a ${fileLines}-line file. ` +
          `Include 3-5 lines of surrounding context.`,
        suggestion: 'retry-with-more-context',
        offendingBlock: block,
      };
    }
  }

  return { ok: true, status: 'ok' };
}

/**
 * Build the re-prompt instruction to inject when validateDiffSize returns ok=false.
 * Orchestrator appends this to the next Coder call context.
 */
export function buildSurgicalRetryPrompt(result: ValidationResult): string {
  if (result.ok) return '';

  if (result.status === 'oversized-rewrite') {
    return (
      `IMPORTANT — Your last diff was rejected by the size validator.\n` +
      `Reason: ${result.message}\n` +
      `Fix: Break your changes into multiple small SEARCH/REPLACE blocks, each touching ` +
      `only the specific lines that need to change. Never replace > 70% of a large file.`
    );
  }

  if (result.status === 'non-unique-anchor') {
    return (
      `IMPORTANT — Your last diff was rejected by the size validator.\n` +
      `Reason: ${result.message}\n` +
      `Fix: Expand your SEARCH block to include 3-5 lines of context above AND below ` +
      `the change so it uniquely identifies the location in the file.`
    );
  }

  return `IMPORTANT — Diff validation failed: ${result.message}`;
}
