/**
 * Aider-style Search/Replace diff parser — Phase 5 (Bug #B5 fix)
 *
 * Supports multiple file path annotation styles:
 *   1. // file: path/to/file.ext
 *   2. # file: path/to/file.ext
 *   3. Bare path line:  path/to/file.ext  (no prefix, just the path)
 *   4. Markdown code fence:  ```typescript path/to/file.ts
 *
 * Multiple blocks for the same file are correctly grouped.
 * Last seen file path sticks until a new annotation replaces it.
 */

export interface DiffBlock {
  filePath: string;
  searchContent: string;
  replaceContent: string;
  raw: string;
}

const SEARCH_MARKER = '<<<<<<< SEARCH';
const SEP_MARKER = '=======';
const REPLACE_MARKER = '>>>>>>> REPLACE';

/** Parse all diff blocks from an agent response string */
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

    // Extract file path from nearby annotation (look up to 8 lines above SEARCH)
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

function findLine(lines: string[], marker: string, startIdx: number): number {
  for (let j = startIdx; j < lines.length; j++) {
    if (lines[j].trim() === marker || lines[j].trim().startsWith(marker)) return j;
  }
  return -1;
}

// Matches bare file paths: any line that looks like a relative file path
const BARE_PATH_RE = /^(?:\.\/|\.\.\/)?(?:[\w.-]+\/)*[\w.-]+\.(?:ts|tsx|js|jsx|css|scss|json|md|mdx|html|py|rs|go|sh|yml|yaml|toml|sql|graphql|xml|txt|env)$/;

function extractFilePath(lines: string[], searchIdx: number): string {
  for (let j = searchIdx - 1; j >= Math.max(0, searchIdx - 8); j--) {
    const line = lines[j].trim();
    if (!line) continue;

    // Style 1 & 2: // file: or # file:
    const commentMatch = line.match(/^(?:\/\/|#)\s*file:\s*(.+)$/i);
    if (commentMatch) return commentMatch[1].trim();

    // Style 3: Markdown code fence with path  ```ts path/to/file.ts
    const fenceMatch = line.match(/^```[\w-]*\s+([\w/.-]+\.\w+)\s*$/);
    if (fenceMatch) return fenceMatch[1].trim();

    // Style 4: Bare path on its own line (e.g., "src/components/Foo.tsx")
    if (BARE_PATH_RE.test(line)) return line;

    // Style 5: Bold or italic path **path/to/file.ts** or _path/to/file.ts_
    const boldMatch = line.match(/^\*\*(.+\.\w+)\*\*:?$/) || line.match(/^_(.+\.\w+)_:?$/);
    if (boldMatch) {
      const candidate = boldMatch[1].trim();
      if (BARE_PATH_RE.test(candidate)) return candidate;
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
