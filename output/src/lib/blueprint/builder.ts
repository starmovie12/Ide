/**
 * Blueprint Builder — Phase 5 §1.2
 *
 * Full 4-phase pipeline:
 *   Phase A — Index (no AI): walk repo tree, parse imports/exports, build dep graph
 *   Phase B — Summarize (Flash, parallel-batched, content-hash cached)
 *   Phase C — Convention sniffer (1 Flash call — delegates to conventions.ts)
 *   Phase D — Rules extraction (1 Flash call — delegates to conventions.ts)
 *
 * v6 fixes applied:
 *   - bytes field populated on BlueprintFile (was missing from returned objects)
 *   - staleAfter set to buildAt + 7 days (§1.2 storage/invalidation)
 *   - buildStats computed and attached (§1.2 cost tracking)
 *   - Content-hash caching: files with unchanged hash skip re-summarization
 *   - onProgress now passes (phase, done, total, label) per updated BlueprintState
 *   - Phase labels match §1.2 PRD exactly: 'A-indexing' | 'B-summarizing' | etc.
 *   - Uses sniffConventions + extractRules from conventions.ts (not inline versions)
 *   - Parallel batch limit ≤ 4 concurrent Flash calls (§1.2 cost note)
 *   - Phase A skip-by-extension filter per §1.2
 */

import type { Octokit } from '@octokit/rest';
import type {
  RepoBlueprint,
  BlueprintFile,
  DependencyGraph,
  SymbolIndex,
  FileLanguage,
  FileSize,
  FileRole,
  BlueprintProgressPhase,
} from './types';
import { callGemini } from '@/lib/ai/gemini';
import { BLUEPRINT_MODEL } from '@/lib/ai/constants';
import { sniffConventions, extractRules } from './conventions';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Deterministic non-cryptographic hash for content-change detection */
function simpleHash(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return h.toString(36);
}

function detectLanguage(path: string): FileLanguage {
  if (path.endsWith('.tsx'))                          return 'tsx';
  if (path.endsWith('.ts'))                           return 'ts';
  if (path.endsWith('.jsx'))                          return 'jsx';
  if (path.endsWith('.js'))                           return 'js';
  if (path.endsWith('.css'))                          return 'css';
  if (path.endsWith('.scss'))                         return 'scss';
  if (path.endsWith('.json'))                         return 'json';
  if (path.endsWith('.md') || path.endsWith('.mdx'))  return 'md';
  if (path.endsWith('.html'))                         return 'html';
  if (path.endsWith('.py'))                           return 'py';
  return 'other';
}

function detectSize(lines: number): FileSize {
  if (lines < 50)   return 'small';
  if (lines < 200)  return 'medium';
  if (lines < 500)  return 'large';
  return 'xlarge';
}

function detectRole(path: string): FileRole {
  const lower = path.toLowerCase();
  if (lower.includes('/hooks/') || lower.endsWith('.hook.ts') || lower.endsWith('.hook.tsx')) return 'hook';
  if (lower.includes('/store/') || lower.includes('/stores/') || lower.includes('store.ts') || lower.includes('store.tsx')) return 'store';
  if (lower.includes('/types/') || lower.endsWith('.types.ts') || lower.endsWith('.d.ts')) return 'type';
  if (lower.includes('.test.') || lower.includes('.spec.') || lower.includes('/__tests__/')) return 'test';
  if (lower.includes('/config') || lower.endsWith('config.ts') || lower.endsWith('config.js')) return 'config';
  if (lower.includes('/pages/') || lower.includes('/routes/') || lower.includes('/app/')) return 'route';
  if (lower.includes('/utils/') || lower.includes('/util/') || lower.includes('/lib/')) return 'util';
  if (lower.includes('/components/') || lower.endsWith('.tsx') || lower.endsWith('.jsx')) return 'component';
  return 'other';
}

function parseImports(content: string): { from: string; what: string[] }[] {
  const importRegex = /import\s+(?:\{([^}]*)\}|(\w+))\s+from\s+['"]([^'"]+)['"]/g;
  const results: { from: string; what: string[] }[] = [];
  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(content)) !== null) {
    const named = match[1]
      ? match[1].split(',').map((s) => s.trim().replace(/\s+as\s+\w+/, '').trim()).filter(Boolean)
      : [];
    const defaultImp = match[2] ? [match[2]] : [];
    results.push({ from: match[3], what: [...named, ...defaultImp] });
  }
  return results;
}

function parseExports(content: string): string[] {
  const exportRegex =
    /export\s+(?:default\s+)?(?:async\s+)?(?:function|class|const|let|var|interface|type|enum)\s+(\w+)/g;
  const results: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = exportRegex.exec(content)) !== null) {
    results.push(match[1]);
  }
  // Also capture re-exports: export { Foo, Bar }
  const reExportRegex = /export\s+\{([^}]+)\}/g;
  while ((match = reExportRegex.exec(content)) !== null) {
    match[1].split(',').forEach((s) => {
      const name = s.trim().split(/\s+as\s+/)[0].trim();
      if (name) results.push(name);
    });
  }
  return [...new Set(results)];
}

/**
 * Summarize a batch of files via a single Flash call.
 * Returns a map of path → summary string.
 * Content-hash caching: pass existingSummaries to skip unchanged files.
 */
async function summarizeFileBatch(
  files: { path: string; content: string }[],
  apiKey: string,
): Promise<Record<string, string>> {
  const prompt =
    `For each file below, write a 1-2 sentence summary of what it does. Be specific about its role in the codebase.\n` +
    `Return ONLY valid JSON: {"path/to/file.ts": "summary text", ...}\n\n` +
    files.map((f) => `=== ${f.path} ===\n${f.content.slice(0, 1500)}`).join('\n\n');

  try {
    const response = await callGemini(
      { apiKey, model: BLUEPRINT_MODEL, temperature: 0.1, maxOutputTokens: 2048 },
      [{ role: 'user', parts: [{ text: prompt }] }],
    );
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as Record<string, string>;
    }
  } catch {
    // Best-effort — never block build on summarization failure
  }

  const fallback: Record<string, string> = {};
  for (const f of files) {
    fallback[f.path] = `${detectRole(f.path)} at ${f.path}`;
  }
  return fallback;
}

/** Run up to `limit` async tasks concurrently (p-limit equivalent, no extra dep) */
async function pLimit<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let idx = 0;

  async function worker(): Promise<void> {
    while (idx < tasks.length) {
      const i = idx++;
      results[i] = await tasks[i]();
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, worker);
  await Promise.all(workers);
  return results;
}

// ─── Extension allow-list for Phase A ────────────────────────────────────────

const SUMMARIZE_EXTENSIONS: FileLanguage[] = ['ts', 'tsx', 'js', 'jsx'];
const INDEX_EXTENSIONS: FileLanguage[] = ['ts', 'tsx', 'js', 'jsx', 'css', 'scss', 'json', 'md', 'html', 'py'];

/** Files that are always skipped (lock files, generated output, binaries) */
const SKIP_PATTERNS = [
  'node_modules/', '.git/', 'dist/', '.next/', 'build/', 'coverage/',
  'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lockb',
  '.min.js', '.min.css', '.d.ts.map',
];

function shouldSkip(path: string, bytes: number): boolean {
  if (bytes > 500_000) return true;  // > 500KB hard skip
  return SKIP_PATTERNS.some((p) => path.includes(p));
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface BuildBlueprintOptions {
  octokit: Octokit;
  owner: string;
  repo: string;
  /** Branch HEAD SHA */
  ref: string;
  chatId: string;
  apiKey: string;
  /**
   * Progress callback — invoked on each phase transition.
   * Matches BlueprintState.updateBlueprintProgress signature.
   */
  onProgress: (
    phase: BlueprintProgressPhase,
    done: number,
    total: number,
    label: string,
  ) => void;
  /**
   * Existing summaries from a prior build (same chatId, prior ref).
   * Files whose contentHash matches will skip re-summarization (cache hit).
   */
  existingSummaries?: Record<string, { summary: string; contentHash: string }>;
  signal?: AbortSignal;
}

/**
 * Build a full RepoBlueprint for the given repo/branch.
 *
 * Phase A: Index — walk tree, parse imports/exports, build dep graph + symbol index
 * Phase B: Summarize — batch Flash calls, content-hash cached
 * Phase C: Conventions — one Flash call via sniffConventions()
 * Phase D: Rules — one Flash call via extractRules()
 */
export async function buildBlueprint(opts: BuildBlueprintOptions): Promise<RepoBlueprint> {
  const { octokit, owner, repo, ref, chatId, apiKey, onProgress, existingSummaries = {}, signal } = opts;

  const buildStart = Date.now();
  const repoUrl = `https://github.com/${owner}/${repo}`;

  // ── Phase A: Index ──────────────────────────────────────────────────────────

  onProgress('A-indexing', 0, 1, 'Fetching file tree…');

  const treeRes = await octokit.git.getTree({
    owner,
    repo,
    tree_sha: ref,
    recursive: '1',
  });

  if (signal?.aborted) throw new Error('Aborted');

  const allItems = treeRes.data.tree.filter(
    (item) =>
      item.type === 'blob' &&
      item.path &&
      !shouldSkip(item.path, item.size ?? 0),
  );

  // Separate code files (to summarize) from index-only files
  const indexItems = allItems.filter((item) => {
    const lang = detectLanguage(item.path!);
    return INDEX_EXTENSIONS.includes(lang);
  });

  const skippedCount = allItems.length - indexItems.length;
  const total = indexItems.length;

  onProgress('A-indexing', 0, total, `Indexed 0/${total} files…`);

  // Fetch file contents in batches of 10 (parallel)
  const fileContents: Array<{ path: string; content: string; sha: string; bytes: number }> = [];
  const FETCH_BATCH = 10;

  for (let i = 0; i < indexItems.length; i += FETCH_BATCH) {
    if (signal?.aborted) throw new Error('Aborted');
    const batch = indexItems.slice(i, i + FETCH_BATCH);
    const results = await Promise.allSettled(
      batch.map((item) =>
        octokit.git
          .getBlob({ owner, repo, file_sha: item.sha! })
          .then((r) => ({
            path: item.path!,
            sha: item.sha!,
            bytes: item.size ?? 0,
            content: Buffer.from(r.data.content, 'base64').toString('utf-8'),
          })),
      ),
    );
    for (const r of results) {
      if (r.status === 'fulfilled') fileContents.push(r.value);
    }
    const done = Math.min(i + FETCH_BATCH, total);
    onProgress('A-indexing', done, total, `Indexed ${done}/${total} files…`);
  }

  if (signal?.aborted) throw new Error('Aborted');

  // Build BlueprintFile list
  const blueprintFiles: BlueprintFile[] = fileContents.map((f) => {
    const lines = f.content.split('\n').length;
    const lang = detectLanguage(f.path);
    const isCode = SUMMARIZE_EXTENSIONS.includes(lang as typeof SUMMARIZE_EXTENSIONS[number]);
    return {
      path: f.path,
      lines,
      bytes: f.bytes,                  // ← FIX: was missing from prior version
      language: lang,
      summary: '',                     // filled in Phase B
      exports: isCode ? parseExports(f.content) : [],
      imports: isCode ? parseImports(f.content) : [],
      size: detectSize(lines),
      role: detectRole(f.path),
      contentHash: simpleHash(f.content),
    };
  });

  // Build dependency graph
  const graph: DependencyGraph = { importedBy: {}, imports: {}, symbolUsage: {} };
  for (const file of blueprintFiles) {
    graph.imports[file.path] = [];
    for (const imp of file.imports) {
      // Only resolve local imports (not node_modules)
      if (imp.from.startsWith('.') || imp.from.startsWith('@/')) {
        const resolved = imp.from;
        graph.imports[file.path].push(resolved);
        if (!graph.importedBy[resolved]) graph.importedBy[resolved] = [];
        graph.importedBy[resolved].push(file.path);
      }
    }
  }

  // Build symbol index
  const symbols: SymbolIndex = {};
  for (const file of blueprintFiles) {
    for (const exp of file.exports) {
      if (!symbols[exp]) {
        symbols[exp] = {
          definedIn: file.path,
          definedAtLine: 1,
          usedIn: [],
          type: /^[A-Z]/.test(exp) ? 'component' : 'function',
        };
      }
    }
  }
  // Second pass: record usage
  for (const file of blueprintFiles) {
    for (const imp of file.imports) {
      for (const what of imp.what) {
        if (symbols[what]) {
          symbols[what].usedIn.push({ file: file.path, line: 1 });
        }
      }
    }
  }

  // ── Phase B: Summarize ──────────────────────────────────────────────────────

  const summarizable = fileContents.filter((f) => {
    const lang = detectLanguage(f.path);
    return SUMMARIZE_EXTENSIONS.includes(lang as typeof SUMMARIZE_EXTENSIONS[number]);
  });

  onProgress('B-summarizing', 0, summarizable.length, `Summarized 0/${summarizable.length} files…`);

  const summaries: Record<string, string> = {};
  let cachedHits = 0;
  let summaryTokensEstimate = 0;

  // Split into: cache-hit files vs needs-summarization files
  const needsSummarize: typeof summarizable = [];
  for (const f of summarizable) {
    const fileEntry = blueprintFiles.find((bf) => bf.path === f.path);
    const cached = existingSummaries[f.path];
    if (cached && fileEntry && cached.contentHash === fileEntry.contentHash) {
      summaries[f.path] = cached.summary;
      cachedHits++;
    } else {
      needsSummarize.push(f);
    }
  }

  // Batch remaining files — max 4 concurrent Flash calls (§1.2 RPM safety)
  const SUMMARY_BATCH = 8;  // files per call
  const CONCURRENT_LIMIT = 4;

  const batches: typeof summarizable[] = [];
  for (let i = 0; i < needsSummarize.length; i += SUMMARY_BATCH) {
    batches.push(needsSummarize.slice(i, i + SUMMARY_BATCH));
  }

  let summarizedSoFar = cachedHits;

  const batchTasks = batches.map((batch) => async () => {
    if (signal?.aborted) throw new Error('Aborted');
    const batchSummaries = await summarizeFileBatch(batch, apiKey);
    // Rough token estimate: ~500 input tokens per file, ~50 output tokens per summary
    summaryTokensEstimate += batch.length * 550;
    Object.assign(summaries, batchSummaries);
    summarizedSoFar += batch.length;
    onProgress(
      'B-summarizing',
      summarizedSoFar,
      summarizable.length,
      `Summarized ${summarizedSoFar}/${summarizable.length} files…`,
    );
  });

  await pLimit(batchTasks, CONCURRENT_LIMIT);

  // Attach summaries to BlueprintFiles
  for (const file of blueprintFiles) {
    if (summaries[file.path]) file.summary = summaries[file.path];
  }

  if (signal?.aborted) throw new Error('Aborted');

  // ── Phase C: Conventions ────────────────────────────────────────────────────

  onProgress('C-conventions', 0, 1, 'Detecting project conventions…');

  const packageJsonFile = fileContents.find((f) => f.path === 'package.json');
  const sampleCodeFiles = fileContents
    .filter((f) => SUMMARIZE_EXTENSIONS.includes(detectLanguage(f.path) as typeof SUMMARIZE_EXTENSIONS[number]))
    .slice(0, 5);

  // Build folder structure string for convention sniffer
  const folderStructure = blueprintFiles
    .map((f) => f.path)
    .slice(0, 100)
    .join('\n');

  const conventions = await sniffConventions(apiKey, {
    packageJsonContent: packageJsonFile?.content ?? '{}',
    sampleFiles: sampleCodeFiles,
    folderStructure,
  });

  onProgress('C-conventions', 1, 1, 'Conventions detected ✓');

  // ── Phase D: Rules ──────────────────────────────────────────────────────────

  onProgress('D-rules', 0, 1, 'Extracting project rules…');

  const rules = await extractRules(apiKey, {
    conventions,
    sampleFiles: sampleCodeFiles,
  });

  onProgress('D-rules', 1, 1, 'Rules extracted ✓');

  // ── Assemble blueprint ──────────────────────────────────────────────────────

  const buildAt = Date.now();
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

  onProgress('done', 1, 1, 'Blueprint ready ✓');

  return {
    chatId,
    repoUrl,
    repoOwner: owner,
    repoName: repo,
    ref,
    buildAt,
    staleAfter: buildAt + SEVEN_DAYS_MS,   // ← FIX: was missing from prior version
    files: blueprintFiles,
    graph,
    summaries,
    symbols,
    conventions,
    rules,
    status: 'ready',
    buildStats: {                           // ← FIX: was missing from prior version
      totalFiles: allItems.length,
      summarized: needsSummarize.length,
      skipped: skippedCount,
      cachedHits,
      summaryTokens: summaryTokensEstimate,
      durationMs: Date.now() - buildStart,
    },
  };
}

/**
 * Incremental update — re-index + re-summarize only changed/new/deleted files.
 * Called after a successful PR merge or after the editor modifies a file locally.
 * §1.2: "re-index + re-summarize ONLY changed file + recompute graph edges"
 */
export async function incrementalUpdateBlueprint(
  blueprint: RepoBlueprint,
  changedPaths: string[],
  newContents: Record<string, string | null>, // null = deleted
  apiKey: string,
): Promise<RepoBlueprint> {
  const updated: RepoBlueprint = { ...blueprint };
  const now = Date.now();

  // Remove deleted files
  const deletedPaths = new Set(
    changedPaths.filter((p) => newContents[p] === null),
  );
  updated.files = blueprint.files.filter((f) => !deletedPaths.has(f.path));

  // Re-index changed/new files
  for (const path of changedPaths) {
    const content = newContents[path];
    if (content === null) continue; // already removed above

    const lines = content.split('\n').length;
    const lang = detectLanguage(path);
    const isCode = SUMMARIZE_EXTENSIONS.includes(lang as typeof SUMMARIZE_EXTENSIONS[number]);
    const contentHash = simpleHash(content);

    // Check if content actually changed
    const existing = updated.files.find((f) => f.path === path);
    if (existing && existing.contentHash === contentHash) continue;

    const newFile: BlueprintFile = {
      path,
      lines,
      bytes: new TextEncoder().encode(content).length,
      language: lang,
      summary: existing?.summary ?? '',
      exports: isCode ? parseExports(content) : [],
      imports: isCode ? parseImports(content) : [],
      size: detectSize(lines),
      role: detectRole(path),
      contentHash,
    };

    // Summarize if it's a code file and content changed
    if (isCode && (!existing || existing.contentHash !== contentHash)) {
      const batchSummaries = await summarizeFileBatch([{ path, content }], apiKey);
      newFile.summary = batchSummaries[path] ?? newFile.summary;
    }

    // Replace or add
    const idx = updated.files.findIndex((f) => f.path === path);
    if (idx >= 0) {
      updated.files[idx] = newFile;
    } else {
      updated.files.push(newFile);
    }

    // Update summaries record
    updated.summaries = { ...updated.summaries, [path]: newFile.summary };
  }

  // Recompute graph edges only for affected files
  const affectedPaths = new Set(changedPaths);
  const newGraph: DependencyGraph = {
    importedBy: { ...blueprint.graph.importedBy },
    imports: { ...blueprint.graph.imports },
    symbolUsage: { ...blueprint.graph.symbolUsage },
  };

  for (const path of affectedPaths) {
    // Clear old edges for this file
    delete newGraph.imports[path];
    for (const [, consumers] of Object.entries(newGraph.importedBy)) {
      const idx = consumers.indexOf(path);
      if (idx >= 0) consumers.splice(idx, 1);
    }

    const content = newContents[path];
    if (!content) continue;

    const imps = parseImports(content);
    newGraph.imports[path] = [];
    for (const imp of imps) {
      if (imp.from.startsWith('.') || imp.from.startsWith('@/')) {
        newGraph.imports[path].push(imp.from);
        if (!newGraph.importedBy[imp.from]) newGraph.importedBy[imp.from] = [];
        if (!newGraph.importedBy[imp.from].includes(path)) {
          newGraph.importedBy[imp.from].push(path);
        }
      }
    }
  }

  updated.graph = newGraph;
  updated.buildAt = now;
  updated.staleAfter = now + 7 * 24 * 60 * 60 * 1000;

  return updated;
}
