/**
 * Structural diff fallback — heuristic AST-style matching.
 * Used when exact text search fails; matches by function/class signature
 * and replaces the entire block.
 */

export interface AstMatchResult {
  success: boolean;
  content: string;
  error?: string;
}

/**
 * Attempt structural replacement by signature matching.
 * Extracts the leading declaration keyword from the search block,
 * finds the matching line in the original source, then replaces
 * the entire brace-delimited block.
 */
export function astFallback(
  original: string,
  search: string,
  replace: string
): AstMatchResult {
  const origLines = original.split('\n');
  const searchLines = search.trim().split('\n');

  const searchSignature = extractSignature(searchLines);
  if (!searchSignature) {
    return { success: false, content: original, error: 'Could not extract AST signature.' };
  }

  for (let i = 0; i < origLines.length; i++) {
    if (signatureMatches(origLines[i], searchSignature)) {
      let blockEnd = findBlockEnd(origLines, i);
      if (blockEnd === -1) blockEnd = i + searchLines.length;

      const resultLines = [
        ...origLines.slice(0, i),
        ...replace.split('\n'),
        ...origLines.slice(blockEnd + 1),
      ];
      return { success: true, content: resultLines.join('\n') };
    }
  }

  return { success: false, content: original, error: 'No structural match found.' };
}

function extractSignature(lines: string[]): string | null {
  for (const line of lines) {
    const trimmed = line.trim();
    if (
      trimmed.startsWith('function ') ||
      trimmed.startsWith('const ') ||
      trimmed.startsWith('class ') ||
      trimmed.startsWith('export ') ||
      trimmed.startsWith('async ') ||
      trimmed.startsWith('def ') ||
      trimmed.startsWith('fn ')
    ) {
      return trimmed.split('(')[0].split('{')[0].trim();
    }
  }
  return null;
}

function signatureMatches(line: string, signature: string): boolean {
  const trimmed = line.trim();
  return trimmed.includes(signature.replace(/^(export\s+)?(async\s+)?/, '').trim());
}

function findBlockEnd(lines: string[], start: number): number {
  let depth = 0;
  for (let i = start; i < lines.length; i++) {
    depth += (lines[i].match(/\{/g) ?? []).length;
    depth -= (lines[i].match(/\}/g) ?? []).length;
    if (i > start && depth <= 0) return i;
  }
  return -1;
}
