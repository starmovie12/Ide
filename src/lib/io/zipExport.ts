import JSZip from 'jszip';
import type { FileEntry } from '@/lib/store/editorStore';

export async function exportAsZip(files: FileEntry[], repoName = 'project'): Promise<void> {
  const zip = new JSZip();
  const folder = zip.folder(repoName)!;

  for (const file of files) {
    folder.file(file.path, file.content);
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${repoName}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}
