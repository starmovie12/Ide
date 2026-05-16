/**
 * Repo Blueprint type definitions — Phase 5 §1.2
 *
 * v6 additions over Phase 4 types:
 *   - BlueprintFile: bytes, scss/html/py language support, 'enum' SymbolEntry type
 *   - RepoBlueprint: staleAfter, buildStats (cost tracking), Map→Record kept for Dexie compat
 *   - SymbolEntry: 'enum' added to type union
 *   - Conventions: packageManager, hasTests fields
 *   - RepoBlueprint.progress: label field added for streaming status UI (§1.2 step 4)
 */

export type FileLanguage =
  | 'tsx'
  | 'ts'
  | 'jsx'
  | 'js'
  | 'css'
  | 'scss'
  | 'json'
  | 'md'
  | 'html'
  | 'py'
  | 'other';

export type FileSize = 'small' | 'medium' | 'large' | 'xlarge';
// < 50 lines = small, 50-200 = medium, 200-500 = large, 500+ = xlarge

export type FileRole =
  | 'component'
  | 'hook'
  | 'util'
  | 'store'
  | 'type'
  | 'config'
  | 'test'
  | 'route'
  | 'other';

export interface BlueprintFile {
  path: string;
  /** Line count — used by sizeValidator to enforce surgical edits */
  lines: number;
  /** Byte count — used to skip files > 500KB in Phase A */
  bytes: number;
  language: FileLanguage;
  /** 1-3 sentence AI-generated summary (or regex-derived placeholder) */
  summary: string;
  /** Named exports: function/component/class/const names exported from this file */
  exports: string[];
  /** Resolved import statements: { from: '@/lib/foo', what: ['useFoo', 'FooType'] } */
  imports: { from: string; what: string[] }[];
  size: FileSize;
  role: FileRole;
  /** SHA-1 of raw file content — used to skip re-summarization on unchanged files */
  contentHash: string;
}

export interface DependencyGraph {
  /** file path → list of file paths that import it */
  importedBy: Record<string, string[]>;
  /** file path → list of file paths it imports */
  imports: Record<string, string[]>;
  /** symbol name → where it is used (file + line) */
  symbolUsage: Record<string, { file: string; line: number }[]>;
}

export interface SymbolEntry {
  definedIn: string;
  definedAtLine: number;
  usedIn: { file: string; line: number }[];
  type: 'component' | 'function' | 'class' | 'const' | 'type' | 'interface' | 'enum';
}

export type SymbolIndex = Record<string, SymbolEntry>;

export interface RepoConventions {
  framework: 'react' | 'next' | 'vue' | 'svelte' | 'plain' | 'other';
  styling: 'tailwind' | 'css-modules' | 'styled-components' | 'emotion' | 'plain';
  typescript: boolean;
  routing: 'wouter' | 'next-app' | 'next-pages' | 'react-router' | 'svelte-kit' | 'none';
  stateManagement: 'zustand' | 'redux' | 'context' | 'jotai' | 'none';
  testingFramework: 'vitest' | 'jest' | 'playwright' | 'none';
  packageManager: 'pnpm' | 'npm' | 'yarn' | 'bun';
  hasTypeScript: boolean;
  hasTests: boolean;
}

export interface BlueprintBuildStats {
  /** Total files walked in Phase A */
  totalFiles: number;
  /** Files that received AI summarization in Phase B */
  summarized: number;
  /** Files skipped (gitignore, size cap, binary) */
  skipped: number;
  /** Files served from contentHash cache (no re-summarization needed) */
  cachedHits: number;
  /** Approximate token count consumed during Phase B summarization */
  summaryTokens: number;
  /** Wall-clock ms for the full build */
  durationMs: number;
}

export type BlueprintProgressPhase =
  | 'A-indexing'
  | 'B-summarizing'
  | 'C-conventions'
  | 'D-rules'
  | 'done';

export interface RepoBlueprint {
  /** Dexie auto-incremented id */
  id?: number;
  chatId: string;
  repoUrl: string;
  repoOwner: string;
  repoName: string;
  /** Branch HEAD SHA at build time — used for cache invalidation */
  ref: string;
  buildAt: number;
  /**
   * Unix timestamp after which the blueprint is considered stale.
   * Default: buildAt + 7 days (§1.2 storage/invalidation).
   */
  staleAfter: number;
  files: BlueprintFile[];
  graph: DependencyGraph;
  /** path → AI-generated summary string */
  summaries: Record<string, string>;
  symbols: SymbolIndex;
  conventions: RepoConventions;
  /** Learned project-specific rules extracted by conventions sniffer (Phase D) */
  rules: string[];
  status: 'building' | 'ready' | 'error' | 'stale';
  error?: string;
  /**
   * Live progress for the streaming build status UI (§1.2 user flow step 4).
   * Matches PRD copy: "Indexed 47/151 files... · Summarized 12 files... · Built dep graph..."
   */
  progress?: {
    /** Which pipeline phase is running */
    phase: BlueprintProgressPhase;
    done: number;
    total: number;
    /** Human-readable status label e.g. "Summarized 12/47 files…" */
    label: string;
  };
  /** Cost + performance telemetry (§1.2 buildStats) */
  buildStats?: BlueprintBuildStats;
}

/** What the Blueprint Selector returns for a given prompt (§1.2 selectContextForPrompt) */
export interface BlueprintSelection {
  /** Ranked, deduplicated relevant files (up to ~25) */
  files: BlueprintFile[];
  /** path → summary for files in the selection */
  relevantSummaries: Record<string, string>;
  /** symbols that appear in the user prompt, with their definition + usage */
  relevantSymbols: SymbolIndex;
  rules: string[];
  conventions: RepoConventions;
  /** Compact ASCII file-tree summary of the full repo (no content) */
  fullFileTreeSummary: string;
}
