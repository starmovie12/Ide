import JSZip from 'jszip';

export interface ImportedFile {
  path: string;
  content: string;
  language: string;
}

function detectLanguage(filename: string): string {
  if (filename.endsWith('.tsx')) return 'typescript';
  if (filename.endsWith('.ts')) return 'typescript';
  if (filename.endsWith('.jsx')) return 'javascript';
  if (filename.endsWith('.js')) return 'javascript';
  if (filename.endsWith('.css') || filename.endsWith('.scss')) return 'css';
  if (filename.endsWith('.json')) return 'json';
  if (filename.endsWith('.md') || filename.endsWith('.mdx')) return 'markdown';
  if (filename.endsWith('.html')) return 'html';
  if (filename.endsWith('.py')) return 'python';
  if (filename.endsWith('.rs')) return 'rust';
  if (filename.endsWith('.go')) return 'go';
  return 'plaintext';
}

const SKIP_PATTERNS = [
  'node_modules/',
  '.git/',
  'dist/',
  '.next/',
  'build/',
  '.DS_Store',
  'pnpm-lock.yaml',
  'package-lock.json',
  'yarn.lock',
];

function shouldSkip(path: string): boolean {
  return SKIP_PATTERNS.some((p) => path.includes(p));
}

export async function importFromZip(file: File): Promise<ImportedFile[]> {
  const zip = await JSZip.loadAsync(file);
  const results: ImportedFile[] = [];

  const promises: Promise<void>[] = [];

  zip.forEach((relativePath, zipEntry) => {
    if (zipEntry.dir) return;
    if (shouldSkip(relativePath)) return;

    const strippedPath = relativePath.replace(/^[^/]+\//, '');
    if (!strippedPath) return;

    promises.push(
      zipEntry.async('string').then((content) => {
        results.push({
          path: strippedPath,
          content,
          language: detectLanguage(strippedPath),
        });
      })
    );
  });

  await Promise.all(promises);
  results.sort((a, b) => a.path.localeCompare(b.path));
  return results;
}
