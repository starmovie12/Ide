/**
 * Error Parser — Phase 5 §4.2
 * Parses tsc / biome / vitest / vite / cloud-build output into structured ParsedError[].
 * Used by the Auto-Heal loop and the sandbox runners.
 */

import type { ParsedError } from '@/lib/sandbox/types';

type ErrorSource = ParsedError['source'];

/**
 * Parse raw terminal output into structured ParsedError[].
 * Tries multiple formats in priority order.
 */
export function parseErrorOutput(
  output: string,
  defaultSource: ErrorSource = 'unknown'
): ParsedError[] {
  const errors: ParsedError[] = [];
  const lines = output.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // ── TypeScript: src/file.ts(10,5): error TS2345: ...
    const tsMatch = line.match(/^([^(]+)\((\d+),(\d+)\):\s+(error|warning)\s+TS\d+:\s+(.+)$/);
    if (tsMatch) {
      errors.push({
        file: tsMatch[1].trim(),
        line: parseInt(tsMatch[2], 10),
        col: parseInt(tsMatch[3], 10),
        severity: tsMatch[4] === 'error' ? 'error' : 'warning',
        message: tsMatch[5].trim(),
        source: 'tsc',
      });
      continue;
    }

    // ── Vite / esbuild: src/file.ts:10:5: error: ...
    const viteMatch = line.match(/^([^:]+):(\d+):(\d+):\s+(error|warning):\s+(.+)$/);
    if (viteMatch) {
      errors.push({
        file: viteMatch[1].trim(),
        line: parseInt(viteMatch[2], 10),
        col: parseInt(viteMatch[3], 10),
        severity: viteMatch[4] === 'error' ? 'error' : 'warning',
        message: viteMatch[5].trim(),
        source: 'vite',
      });
      continue;
    }

    // ── Biome: path/to/file.ts:10:5 ━━ lint/... ───
    const biomeMatch = line.match(/^([^:]+):(\d+):(\d+)\s+━+/);
    if (biomeMatch && i + 1 < lines.length) {
      const msgLine = lines[i + 1].trim();
      errors.push({
        file: biomeMatch[1].trim(),
        line: parseInt(biomeMatch[2], 10),
        col: parseInt(biomeMatch[3], 10),
        severity: 'error',
        message: msgLine,
        source: 'biome',
      });
      continue;
    }

    // ── Vitest FAIL line: FAIL src/file.test.ts > test name
    const vitestFailMatch = line.match(/^FAIL\s+(.+\.test\.\w+)/);
    if (vitestFailMatch) {
      errors.push({
        file: vitestFailMatch[1].trim(),
        severity: 'error',
        message: line.trim(),
        source: 'vitest',
      });
      continue;
    }

    // ── Generic "error:" line (cloud build logs, runtime)
    const genericMatch = line.match(/\berror\b[:\s]+(.+)/i);
    if (genericMatch && !line.includes('//') && line.length < 300) {
      errors.push({
        severity: 'error',
        message: genericMatch[1].trim().slice(0, 200),
        source: defaultSource,
      });
    }
  }

  return deduplicateErrors(errors);
}

/**
 * Deduplicate errors by (file, line, message).
 */
function deduplicateErrors(errors: ParsedError[]): ParsedError[] {
  const seen = new Set<string>();
  return errors.filter((e) => {
    const key = `${e.file ?? ''}:${e.line ?? ''}:${e.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Build a concise error summary for injection into the Debugger agent context.
 * Max 2000 chars to stay within token budget.
 */
export function formatErrorsForDebugger(errors: ParsedError[], recentDiffFiles: string[]): string {
  if (errors.length === 0) return 'No structured errors found.';

  const lines: string[] = [`${errors.length} error(s) detected:\n`];

  for (const e of errors.slice(0, 20)) {
    const loc = e.file ? `${e.file}${e.line ? `:${e.line}` : ''}` : 'unknown location';
    lines.push(`[${e.source}] ${loc} — ${e.message}`);
  }

  if (errors.length > 20) {
    lines.push(`... and ${errors.length - 20} more`);
  }

  if (recentDiffFiles.length > 0) {
    lines.push(`\nFiles touched by recent diffs: ${recentDiffFiles.join(', ')}`);
  }

  return lines.join('\n').slice(0, 2000);
}

/**
 * Filter errors to only those referencing files in a given set.
 * Helps focus the Debugger on files the diffs actually touched.
 */
export function filterErrorsByFiles(
  errors: ParsedError[],
  files: string[]
): ParsedError[] {
  if (files.length === 0) return errors;
  return errors.filter((e) => !e.file || files.some((f) => e.file!.includes(f)));
}
