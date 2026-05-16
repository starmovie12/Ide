/**
 * Aider-style Search/Replace diff parser — v6 (Bug #B5 fix)
 *
 * Bug #B5: parser now correctly handles multi-file responses.
 *   - File path annotation is tracked per-block, not just per-response.
 *   - Exported as both parseDiffBlocks() and parseAllBlocks() (§1.3 references both).
 *
 * Supports multiple file path annotation styles:
 *   1. // file: path/to/file.ext
 *   2. # file: path/to/file.ext
 *   3. Bare path line:  path/to/file.ext  (no prefix)
 *   4. Markdown code fence:  ```typescript path/to/file.ts
 *   5. Bold:  **path/to/file.ts**
 */

export interface DiffBlock {
  filePath: string;
  searchContent: string;
  replaceContent: string;
  raw: string;
}

/** Alias used in §1.3 sizeValidator and §1.4 impact analyzer */
export interface SearchReplaceBlock {
  filePath: string;
  search: string;
  replace: string;
}

const SEARCH_MARKER = '<<<<<<< SEARCH';
const SEP_MARKER = '=======';
const REPLACE_MARKER = '>>>>>>> REPLACE';

/**
 * Parse all diff blocks from an agent response string.
 * Bug #B5 fix: every block tracks its own filePath from the nearest annotation.
 * lastKnownFilePath carries over only when NO new annotation is found near a block.
 */
export function parseDiffBlocks(agentResponse: string): DiffBlock[] {
  const blocks: DiffBlock[] = [];
  const lines = agentResponse.split('\n');

  let lastKnownFilePath = 'unknown';
  let i = 0;

  while (i < lines.length) {
    const searchIdx = findLine(lines, SEARCH_MARKER, i);
    if (searchIdx === -1) break;

    const sepIdx = findLine(lines, SEP_MARKER, searchIdx + 1);
    if (sepIdx === -1) { i = searchIdx + 1; continue; }

    const replaceIdx = findLine(lines, REPLACE_MARKER, sepIdx + 1);
    if (replaceIdx === -1) { i = searchIdx + 1; continue; }

    // Look up to 8 lines above SEARCH for a file path annotation
    const foundPath = extractFilePath(lines, searchIdx);
    if (foundPath !== 'unknown') {
      lastKnownFilePath = foundPath;
    }

    const filePath = lastKnownFilePath;
    const searchContent = lines.slice(searchIdx + 1, sepIdx).join('\n');
    const replaceContent = lines.slice(sepIdx + 1, replaceIdx).join('\n');
    const raw = lines.slice(Math.max(0, searchIdx - 1), replaceIdx + 1).join('\n');

    blocks.push({ filePath, searchContent, replaceContent, raw });
    i = replaceIdx + 1;
  }

  return blocks;
}

/**
 * parseAllBlocks — alias for parseDiffBlocks in SearchReplaceBlock shape.
 * Used by sizeValidator (§1.3) and impact analyzer (§1.4).
 */
export function parseAllBlocks(rawText: string): SearchReplaceBlock[] {
  return parseDiffBlocks(rawText).map((b) => ({
    filePath: b.filePath,
    search: b.searchContent,
    replace: b.replaceContent,
  }));
}

function findLine(lines: string[], marker: string, startIdx: number): number {
  for (let j = startIdx; j < lines.length; j++) {
    const trimmed = lines[j].trim();
    if (trimmed === marker || trimmed.startsWith(marker)) return j;
  }
  return -1;
}

// Matches bare file paths: relative path with a known source extension
const BARE_PATH_RE =
  /^(?:\.\/)? (?:\.\.\/)*(?:[\w.-]+\/)*[\w.-]+\.(?:ts|tsx|js|jsx|css|scss|json|md|mdx|html|py|rs|go|sh|yml|yaml|toml|sql|graphql|xml|txt|env)$/;

function extractFilePath(lines: string[], searchIdx: number): string {
  for (let j = searchIdx - 1; j >= Math.max(0, searchIdx - 8); j--) {
    const line = lines[j].trim();
    if (!line) continue;

    // Style 1 & 2: // file: or # file:
    const commentMatch = line.match(/^(?:\/\/|#)\s*file:\s*(.+)$/i);
    if (commentMatch) return commentMatch[1].trim();

    // Style 3: Markdown code fence  ```ts path/to/file.ts
    const fenceMatch = line.match(/^```[\w-]*\s+([\w/.-]+\.\w+)\s*$/);
    if (fenceMatch) return fenceMatch[1].trim();

    // Style 4: Bare path  (strip leading spaces from regex — remove the space after ^)
    const bareTest = line.replace(/^(?:\.\/)?/, '');
    if (/^(?:\.\.\/)*(?:[\w.-]+\/)*[\w.-]+\.(?:ts|tsx|js|jsx|css|scss|json|md|mdx|html|py|rs|go|sh|yml|yaml|toml|sql|graphql|xml|txt|env)$/.test(bareTest)) {
      return bareTest;
    }

    // Style 5: Bold **path/to/file.ts** or italic _path/to/file.ts_
    const boldMatch = line.match(/^\*\*(.+\.\w+)\*\*:?$/) || line.match(/^_(.+\.\w+)_:?$/);
    if (boldMatch) {
      const candidate = boldMatch[1].trim();
      if (/[\w/.-]+\.\w+/.test(candidate)) return candidate;
    }
  }

  return 'unknown';
}

/** Check if a response contains any diff blocks */
export function hasDiffBlocks(response: string): boolean {
  return response.includes(SEARCH_MARKER) && response.includes(REPLACE_MARKER);
}

/** Count how many blocks are in a response */
export function countDiffBlocks(response: string): number {
  return parseDiffBlocks(response).length;
}
