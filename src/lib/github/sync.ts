/**
 * GitHub Repo Sync — Phase 5 §4.6
 * Fetches all code files from a GitHub repo into the editor file state.
 * Called after OAuth or PAT auth to populate the workspace.
 */

import type { Octokit } from '@octokit/rest';

export interface SyncedFile {
  path: string;
  content: string;
  sha: string;
  language: string;
  size: number;
}

export interface SyncProgress {
  phase: string;
  done: number;
  total: number;
}

const CODE_EXTENSIONS = new Set([
  'ts', 'tsx', 'js', 'jsx', 'css', 'scss', 'json', 'md', 'mdx',
  'html', 'py', 'rs', 'go', 'sh', 'yml', 'yaml', 'toml', 'sql',
  'graphql', 'xml', 'txt', 'env', 'gitignore',
]);

const SKIP_PATHS = [
  'node_modules',
  '.git',
  'dist/',
  '.next/',
  'build/',
  '.turbo/',
  'coverage/',
  'pnpm-lock.yaml',
  'package-lock.json',
  'yarn.lock',
];

function shouldSkip(path: string): boolean {
  return SKIP_PATHS.some((s) => path.includes(s));
}

function getExtension(path: string): string {
  return path.split('.').pop()?.toLowerCase() ?? '';
}

function extensionToLanguage(ext: string): string {
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescriptreact',
    js: 'javascript', jsx: 'javascriptreact',
    css: 'css', scss: 'scss',
    json: 'json', md: 'markdown', mdx: 'markdown',
    html: 'html', py: 'python', rs: 'rust',
    go: 'go', sh: 'shell', yml: 'yaml', yaml: 'yaml',
    toml: 'toml', sql: 'sql', graphql: 'graphql',
  };
  return map[ext] ?? 'plaintext';
}

export interface SyncRepoOptions {
  octokit: Octokit;
  owner: string;
  repo: string;
  ref: string;
  /** Max file size in bytes — default 200KB */
  maxFileSizeBytes?: number;
  onProgress: (p: SyncProgress) => void;
  signal?: AbortSignal;
}

/**
 * Sync all code files from a GitHub repo to an array of SyncedFile.
 * Caller writes these into editorStore and Dexie files table.
 */
export async function syncRepo(opts: SyncRepoOptions): Promise<SyncedFile[]> {
  const { octokit, owner, repo, ref, onProgress, signal } = opts;
  const maxSize = opts.maxFileSizeBytes ?? 200_000;

  onProgress({ phase: 'Fetching file tree…', done: 0, total: 1 });

  const treeRes = await octokit.git.getTree({
    owner,
    repo,
    tree_sha: ref,
    recursive: '1',
  });

  const blobs = treeRes.data.tree.filter(
    (item) =>
      item.type === 'blob' &&
      item.path &&
      !shouldSkip(item.path) &&
      CODE_EXTENSIONS.has(getExtension(item.path!)) &&
      (item.size ?? 0) < maxSize
  );

  const total = blobs.length;
  onProgress({ phase: 'Fetching files…', done: 0, total });

  const files: SyncedFile[] = [];
  const BATCH = 10;

  for (let i = 0; i < blobs.length; i += BATCH) {
    if (signal?.aborted) throw new Error('Sync aborted');
    const batch = blobs.slice(i, i + BATCH);

    const results = await Promise.allSettled(
      batch.map(async (item) => {
        const blobRes = await octokit.git.getBlob({
          owner,
          repo,
          file_sha: item.sha!,
        });
        const content = decodeBase64(blobRes.data.content);
        const ext = getExtension(item.path!);
        return {
          path: item.path!,
          content,
          sha: item.sha!,
          language: extensionToLanguage(ext),
          size: item.size ?? content.length,
        } satisfies SyncedFile;
      })
    );

    for (const r of results) {
      if (r.status === 'fulfilled') files.push(r.value);
    }

    onProgress({ phase: 'Fetching files…', done: Math.min(i + BATCH, total), total });
  }

  onProgress({ phase: 'Done', done: total, total });
  return files;
}

function decodeBase64(b64: string): string {
  // GitHub API returns base64 with newlines
  const clean = b64.replace(/\n/g, '');
  try {
    return decodeURIComponent(escape(atob(clean)));
  } catch {
    return atob(clean);
  }
}
