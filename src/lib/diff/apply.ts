/**
 * Diff applier — applies Search/Replace blocks to file content
 */

import { type DiffBlock } from './parser';
import { fuzzyReplace } from './fuzzyMatch';

export interface ApplyResult {
  success: boolean;
  content: string;
  error?: string;
  usedFuzzy?: boolean;
}

/**
 * Apply a single diff block to file content.
 * Falls back to fuzzy matching if exact match fails.
 */
export function applyDiffBlock(originalContent: string, block: DiffBlock): ApplyResult {
  const search = block.searchContent.trim();
  const replace = block.replaceContent;

  // 1. Try exact match
  if (originalContent.includes(search)) {
    return {
      success: true,
      content: originalContent.replace(search, replace),
    };
  }

  // 2. Try with normalized whitespace
  const normalizedOriginal = normalizeWhitespace(originalContent);
  const normalizedSearch = normalizeWhitespace(search);

  if (normalizedOriginal.includes(normalizedSearch)) {
    const idx = normalizedOriginal.indexOf(normalizedSearch);
    const content = originalContent.slice(0, idx) + replace + originalContent.slice(idx + search.length);
    return { success: true, content };
  }

  // 3. Fuzzy match fallback
  const fuzzyResult = fuzzyReplace(originalContent, search, replace);
  if (fuzzyResult.success) {
    return { ...fuzzyResult, usedFuzzy: true };
  }

  return {
    success: false,
    content: originalContent,
    error: `Could not find search block in file. The code may have already changed.`,
  };
}

/**
 * Apply multiple diff blocks sequentially to a file.
 */
export function applyAllDiffBlocks(
  originalContent: string,
  blocks: DiffBlock[]
): { content: string; results: ApplyResult[] } {
  let content = originalContent;
  const results: ApplyResult[] = [];

  for (const block of blocks) {
    const result = applyDiffBlock(content, block);
    results.push(result);
    if (result.success) {
      content = result.content;
    }
  }

  return { content, results };
}

function normalizeWhitespace(str: string): string {
  return str.replace(/\r\n/g, '\n').replace(/\t/g, '  ').trim();
}
