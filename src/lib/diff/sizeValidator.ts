import type { DiffBlock } from './parser';
import type { RepoBlueprint } from '@/lib/blueprint/types';

export type ValidationFailReason = 'oversized-rewrite' | 'non-unique-anchor';

export interface ValidationResult {
  ok: boolean;
  reason?: ValidationFailReason;
  message?: string;
  suggestion?: string;
}

export function validateDiffSize(
  blocks: DiffBlock[],
  blueprint: RepoBlueprint | null
): ValidationResult {
  if (!blueprint) return { ok: true };

  for (const block of blocks) {
    const file = blueprint.files.find((f) => f.path === block.filePath);
    if (!file) continue;

    const replaceLineCount = block.replaceContent ? block.replaceContent.split('\n').length : 0;
    const fileLineCount = file.lines;
    const searchLineCount = block.searchContent ? block.searchContent.split('\n').length : 0;

    if (fileLineCount > 200 && replaceLineCount / fileLineCount > 0.7) {
      return {
        ok: false,
        reason: 'oversized-rewrite',
        message: `Coder is rewriting ${Math.round((replaceLineCount / fileLineCount) * 100)}% of ${file.path} (${fileLineCount} lines). Should be surgical.`,
        suggestion: 'retry-with-surgical-prompt',
      };
    }

    if (searchLineCount < 2 && file.lines > 20 && block.searchContent.trim().length > 0) {
      return {
        ok: false,
        reason: 'non-unique-anchor',
        message: `SEARCH block for ${file.path} only has ${searchLineCount} line — not unique enough.`,
        suggestion: 'retry-with-more-context',
      };
    }
  }

  return { ok: true };
}
