import type { Octokit } from '@octokit/rest';
import type {
  RepoBlueprint,
  BlueprintFile,
  DependencyGraph,
  SymbolIndex,
  RepoConventions,
  FileLanguage,
  FileSize,
  FileRole,
} from './types';
import { callGemini } from '@/lib/ai/gemini';
import { BLUEPRINT_MODEL } from '@/lib/ai/constants';

function simpleHash(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return h.toString(36);
}

function detectLanguage(path: string): FileLanguage {
  if (path.endsWith('.tsx')) return 'tsx';
  if (path.endsWith('.ts')) return 'ts';
  if (path.endsWith('.jsx')) return 'jsx';
  if (path.endsWith('.js')) return 'js';
  if (path.endsWith('.css') || path.endsWith('.scss')) return 'css';
  if (path.endsWith('.json')) return 'json';
  if (path.endsWith('.md') || path.endsWith('.mdx')) return 'md';
  return 'other';
}

function detectSize(lines: number): FileSize {
  if (lines < 50) return 'small';
  if (lines < 200) return 'medium';
  if (lines < 500) return 'large';
  return 'xlarge';
}

function detectRole(path: string): FileRole {
  const lower = path.toLowerCase();
  if (lower.includes('/hooks/') || lower.includes('/hook/')) return 'hook';
  if (lower.includes('/store/') || lower.includes('/stores/') || lower.includes('store.ts') || lower.includes('store.tsx')) return 'store';
  if (lower.includes('/types/') || lower.includes('/type/') || lower.endsWith('.types.ts') || lower.endsWith('.d.ts')) return 'type';
  if (lower.includes('/utils/') || lower.includes('/util/') || lower.includes('/lib/')) return 'util';
  if (lower.includes('/config') || lower.endsWith('config.ts') || lower.endsWith('config.js')) return 'config';
  if (lower.includes('.test.') || lower.includes('.spec.') || lower.includes('/__tests__/')) return 'test';
  if (lower.includes('/components/') || lower.endsWith('.tsx') || lower.endsWith('.jsx')) return 'component';
  return 'other';
}

function parseImports(content: string): { from: string; what: string[] }[] {
  const importRegex = /import\s+(?:\{([^}]*)\}|(\w+))\s+from\s+['"]([^'"]+)['"]/g;
  const results: { from: string; what: string[] }[] = [];
  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(content)) !== null) {
    const named = match[1] ? match[1].split(',').map((s) => s.trim().replace(/\s+as\s+\w+/, '').trim()).filter(Boolean) : [];
    const defaultImp = match[2] ? [match[2]] : [];
    results.push({ from: match[3], what: [...named, ...defaultImp] });
  }
  return results;
}

function parseExports(content: string): string[] {
  const exportRegex = /export\s+(?:default\s+)?(?:function|class|const|let|var|interface|type|enum)\s+(\w+)/g;
  const results: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = exportRegex.exec(content)) !== null) {
    results.push(match[1]);
  }
  return [...new Set(results)];
}

async function summarizeFileBatch(
  files: { path: string; content: string }[],
  apiKey: string
): Promise<Record<string, string>> {
  const prompt = `For each file below, write a 1-2 sentence summary of what it does. Be specific. Return JSON: {"path/to/file.ts": "summary", ...}

${files.map((f) => `=== ${f.path} ===\n${f.content.slice(0, 1500)}`).join('\n\n')}`;

  try {
    const response = await callGemini(
      { apiKey, model: BLUEPRINT_MODEL, temperature: 0.1, maxOutputTokens: 2048 },
      [{ role: 'user', parts: [{ text: prompt }] }]
    );
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch {
    // silently fail — summaries are best-effort
  }

  const fallback: Record<string, string> = {};
  for (const f of files) {
    fallback[f.path] = `File at ${f.path}`;
  }
  return fallback;
}

async function detectConventions(
  packageJson: string,
  sampleFiles: { path: string; content: string }[],
  apiKey: string
): Promise<RepoConventions> {
  const prompt = `Analyze this project and return JSON with these exact fields:
{
  "framework": "react" | "next" | "vue" | "svelte" | "plain" | "other",
  "styling": "tailwind" | "css-modules" | "styled-components" | "plain",
  "typescript": true | false,
  "routing": "wouter" | "next-app" | "react-router" | "none",
  "stateManagement": "zustand" | "redux" | "context" | "none",
  "testingFramework": "vitest" | "jest" | "none"
}

package.json:
${packageJson.slice(0, 2000)}

Sample files:
${sampleFiles.slice(0, 3).map((f) => `--- ${f.path} ---\n${f.content.slice(0, 800)}`).join('\n\n')}`;

  try {
    const response = await callGemini(
      { apiKey, model: BLUEPRINT_MODEL, temperature: 0.1, maxOutputTokens: 512 },
      [{ role: 'user', parts: [{ text: prompt }] }]
    );
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch {
    // ignore
  }

  const hasTailwind = packageJson.includes('tailwindcss');
  const hasTs = packageJson.includes('typescript');
  return {
    framework: 'react',
    styling: hasTailwind ? 'tailwind' : 'plain',
    typescript: hasTs,
    routing: packageJson.includes('wouter') ? 'wouter' : packageJson.includes('react-router') ? 'react-router' : 'none',
    stateManagement: packageJson.includes('zustand') ? 'zustand' : packageJson.includes('redux') ? 'redux' : 'none',
    testingFramework: packageJson.includes('vitest') ? 'vitest' : packageJson.includes('jest') ? 'jest' : 'none',
  };
}

async function extractRules(
  conventions: RepoConventions,
  sampleFiles: { path: string; content: string }[],
  apiKey: string
): Promise<string[]> {
  const prompt = `Based on this project's code patterns, list 5-10 specific rules that all new code MUST follow.
Be concrete, not generic. E.g. "Use Tailwind classes only, no inline styles" not "Use consistent styling".

Framework: ${conventions.framework}, Styling: ${conventions.styling}, TypeScript: ${conventions.typescript}

Code samples:
${sampleFiles.slice(0, 3).map((f) => `--- ${f.path} ---\n${f.content.slice(0, 600)}`).join('\n\n')}

Return JSON array of strings: ["rule 1", "rule 2", ...]`;

  try {
    const response = await callGemini(
      { apiKey, model: BLUEPRINT_MODEL, temperature: 0.1, maxOutputTokens: 512 },
      [{ role: 'user', parts: [{ text: prompt }] }]
    );
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch {
    // ignore
  }

  return [
    `Use ${conventions.typescript ? 'TypeScript strict mode' : 'JavaScript'}`,
    `Use ${conventions.styling} for styling`,
    `Follow ${conventions.framework} conventions`,
  ];
}

export interface BuildBlueprintOptions {
  octokit: Octokit;
  owner: string;
  repo: string;
  ref: string;
  chatId: string;
  apiKey: string;
  onProgress: (phase: string, done: number, total: number) => void;
  signal?: AbortSignal;
}

export async function buildBlueprint(opts: BuildBlueprintOptions): Promise<RepoBlueprint> {
  const { octokit, owner, repo, ref, chatId, apiKey, onProgress, signal } = opts;

  const repoUrl = `https://github.com/${owner}/${repo}`;
  const id = crypto.randomUUID();

  onProgress('Fetching file tree…', 0, 1);

  const treeRes = await octokit.git.getTree({
    owner,
    repo,
    tree_sha: ref,
    recursive: '1',
  });

  const allItems = treeRes.data.tree.filter(
    (item) =>
      item.type === 'blob' &&
      item.path &&
      !item.path.includes('node_modules') &&
      !item.path.includes('.git') &&
      !item.path.includes('dist/') &&
      !item.path.includes('.next/') &&
      item.size != null &&
      item.size < 200_000
  );

  const codeItems = allItems.filter((item) => {
    const lang = detectLanguage(item.path!);
    return ['ts', 'tsx', 'js', 'jsx', 'css', 'json', 'md'].includes(lang) && item.path !== 'package-lock.json' && item.path !== 'pnpm-lock.yaml';
  });

  const total = codeItems.length;
  onProgress('Reading files…', 0, total);

  const fileContents: Array<{ path: string; content: string; sha: string }> = [];
  const BATCH = 10;

  for (let i = 0; i < codeItems.length; i += BATCH) {
    if (signal?.aborted) throw new Error('Aborted');
    const batch = codeItems.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      batch.map((item) =>
        octokit.git.getBlob({ owner, repo, file_sha: item.sha! }).then((r) => ({
          path: item.path!,
          sha: item.sha!,
          content: Buffer.from(r.data.content, 'base64').toString('utf-8'),
        }))
      )
    );
    for (const r of results) {
      if (r.status === 'fulfilled') fileContents.push(r.value);
    }
    onProgress('Reading files…', Math.min(i + BATCH, total), total);
  }

  onProgress('Indexing dependencies…', 0, 1);

  const blueprintFiles: BlueprintFile[] = fileContents.map((f) => {
    const lines = f.content.split('\n').length;
    const lang = detectLanguage(f.path);
    const imps = ['ts', 'tsx', 'js', 'jsx'].includes(lang) ? parseImports(f.content) : [];
    const exps = ['ts', 'tsx', 'js', 'jsx'].includes(lang) ? parseExports(f.content) : [];
    return {
      path: f.path,
      lines,
      language: lang,
      summary: '',
      exports: exps,
      imports: imps,
      size: detectSize(lines),
      role: detectRole(f.path),
      contentHash: simpleHash(f.content),
    };
  });

  const graph: DependencyGraph = { importedBy: {}, imports: {}, symbolUsage: {} };
  for (const file of blueprintFiles) {
    graph.imports[file.path] = [];
    for (const imp of file.imports) {
      if (imp.from.startsWith('.')) {
        graph.imports[file.path].push(imp.from);
        if (!graph.importedBy[imp.from]) graph.importedBy[imp.from] = [];
        graph.importedBy[imp.from].push(file.path);
      }
    }
  }

  const symbols: SymbolIndex = {};
  for (const file of blueprintFiles) {
    for (const exp of file.exports) {
      if (!symbols[exp]) {
        symbols[exp] = {
          definedIn: file.path,
          definedAtLine: 1,
          usedIn: [],
          type: 'function',
        };
      }
    }
    for (const imp of file.imports) {
      for (const what of imp.what) {
        if (symbols[what]) {
          symbols[what].usedIn.push({ file: file.path, line: 1 });
        }
      }
    }
  }

  onProgress('Summarizing files (AI)…', 0, fileContents.length);

  const summaryBatchSize = 8;
  const summaries: Record<string, string> = {};

  for (let i = 0; i < fileContents.length; i += summaryBatchSize) {
    if (signal?.aborted) throw new Error('Aborted');
    const batch = fileContents.slice(i, i + summaryBatchSize);
    const batchSummaries = await summarizeFileBatch(batch, apiKey);
    Object.assign(summaries, batchSummaries);
    for (const file of blueprintFiles) {
      if (summaries[file.path]) file.summary = summaries[file.path];
    }
    onProgress('Summarizing files (AI)…', Math.min(i + summaryBatchSize, fileContents.length), fileContents.length);
  }

  onProgress('Detecting conventions…', 0, 1);

  const packageJsonFile = fileContents.find((f) => f.path === 'package.json');
  const sampleCodeFiles = fileContents.filter((f) => ['tsx', 'ts'].includes(detectLanguage(f.path))).slice(0, 5);

  const conventions = await detectConventions(
    packageJsonFile?.content ?? '{}',
    sampleCodeFiles,
    apiKey
  );

  onProgress('Extracting rules…', 0, 1);
  const rules = await extractRules(conventions, sampleCodeFiles, apiKey);

  onProgress('Done', 1, 1);

  return {
    id,
    chatId,
    repoUrl,
    repoOwner: owner,
    repoName: repo,
    ref,
    buildAt: Date.now(),
    files: blueprintFiles,
    graph,
    summaries,
    symbols,
    conventions,
    rules,
    status: 'ready',
  };
}
