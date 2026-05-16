/**
 * Fuzzy diff matching — fallback when exact Search/Replace fails.
 * Uses a line-by-line similarity approach inspired by diff-match-patch.
 */

import { type ApplyResult } from './apply';

/**
 * Attempt to fuzzy-match `search` in `original` and replace with `replace`.
 * Returns success=false if similarity is below threshold.
 */
export function fuzzyReplace(
  original: string,
  search: string,
  replace: string,
  threshold = 0.75
): ApplyResult {
  const originalLines = original.split('\n');
  const searchLines = search.trim().split('\n');

  if (searchLines.length === 0) {
    return { success: false, content: original, error: 'Empty search block' };
  }

  let bestScore = 0;
  let bestStart = -1;

  // Sliding window over original lines
  for (let i = 0; i <= originalLines.length - searchLines.length; i++) {
    const window = originalLines.slice(i, i + searchLines.length);
    const score = similarity(window, searchLines);
    if (score > bestScore) {
      bestScore = score;
      bestStart = i;
    }
  }

  if (bestScore < threshold || bestStart === -1) {
    return {
      success: false,
      content: original,
      error: `Best match score ${(bestScore * 100).toFixed(0)}% is below ${threshold * 100}% threshold.`,
    };
  }

  const replaceLines = replace.split('\n');
  const resultLines = [
    ...originalLines.slice(0, bestStart),
    ...replaceLines,
    ...originalLines.slice(bestStart + searchLines.length),
  ];

  return { success: true, content: resultLines.join('\n') };
}

/** Levenshtein-based line similarity (0–1) */
function similarity(a: string[], b: string[]): number {
  const matched = a.filter((line, i) => {
    const bLine = b[i] ?? '';
    return normalizedSim(line, bLine) > 0.8;
  });
  return matched.length / Math.max(a.length, b.length);
}

function normalizedSim(a: string, b: string): number {
  const la = a.trim().toLowerCase();
  const lb = b.trim().toLowerCase();
  if (la === lb) return 1;
  if (!la || !lb) return 0;
  const maxLen = Math.max(la.length, lb.length);
  const dist = levenshtein(la, lb);
  return 1 - dist / maxLen;
}

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[a.length][b.length];
}
