import { importFromZip } from './zipImport';
import { useEditorStore } from '@/lib/store/editorStore';

export async function handleZipImport(file: File): Promise<{ count: number }> {
  const files = await importFromZip(file);

  const { createFile, getFileByPath } = useEditorStore.getState();

  let count = 0;
  for (const f of files) {
    const existing = getFileByPath(f.path);
    if (existing) {
      useEditorStore.getState().updateFileContent(existing.id, f.content);
    } else {
      createFile(f.path, f.content);
    }
    count++;
  }

  return { count };
}
