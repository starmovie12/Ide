export type FileLanguage = 'tsx' | 'ts' | 'jsx' | 'js' | 'css' | 'json' | 'md' | 'other';
export type FileSize = 'small' | 'medium' | 'large' | 'xlarge';
export type FileRole = 'component' | 'hook' | 'util' | 'store' | 'type' | 'config' | 'test' | 'other';

export interface BlueprintFile {
  path: string;
  lines: number;
  language: FileLanguage;
  summary: string;
  exports: string[];
  imports: { from: string; what: string[] }[];
  size: FileSize;
  role: FileRole;
  contentHash: string;
}

export interface DependencyGraph {
  importedBy: Record<string, string[]>;
  imports: Record<string, string[]>;
  symbolUsage: Record<string, { file: string; line: number }[]>;
}

export interface SymbolEntry {
  definedIn: string;
  definedAtLine: number;
  usedIn: { file: string; line: number }[];
  type: 'component' | 'function' | 'class' | 'const' | 'type' | 'interface';
}

export type SymbolIndex = Record<string, SymbolEntry>;

export interface RepoConventions {
  framework: 'react' | 'next' | 'vue' | 'svelte' | 'plain' | 'other';
  styling: 'tailwind' | 'css-modules' | 'styled-components' | 'plain';
  typescript: boolean;
  routing: 'wouter' | 'next-app' | 'react-router' | 'none';
  stateManagement: 'zustand' | 'redux' | 'context' | 'none';
  testingFramework: 'vitest' | 'jest' | 'none';
}

export interface RepoBlueprint {
  id: string;
  chatId: string;
  repoUrl: string;
  repoOwner: string;
  repoName: string;
  ref: string;
  buildAt: number;
  files: BlueprintFile[];
  graph: DependencyGraph;
  summaries: Record<string, string>;
  symbols: SymbolIndex;
  conventions: RepoConventions;
  rules: string[];
  status: 'building' | 'ready' | 'error';
  error?: string;
  progress?: { phase: string; done: number; total: number };
}

export interface BlueprintSelection {
  files: BlueprintFile[];
  relevantSummaries: Record<string, string>;
  relevantSymbols: SymbolIndex;
  rules: string[];
  conventions: RepoConventions;
}
