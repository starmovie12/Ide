/**
 * useEditor — convenience hook over editorStore
 */

import { useEditorStore } from '@/lib/store/editorStore';
import { useCallback } from 'react';

export function useEditor() {
  const {
    files,
    openFiles,
    activeFileId,
    fileContents,
    createFile,
    deleteFile,
    renameFile,
    moveFile,
    getFileById,
    getFileByPath,
    openFile,
    closeFile,
    setActiveFile,
    updateFileContent,
    markFileSaved,
    setLanguage,
  } = useEditorStore();

  const activeFile = openFiles.find((f) => f.id === activeFileId) ?? null;
  const activeContent = activeFileId ? (fileContents[activeFileId] ?? '') : '';

  const saveFile = useCallback(
    (id: string) => {
      markFileSaved(id);
    },
    [markFileSaved]
  );

  const openFileByPath = useCallback(
    (path: string) => {
      const entry = files.find((f) => f.path === path);
      if (!entry) return;
      openFile({ id: entry.id, path: entry.path, language: entry.language }, entry.content);
    },
    [files, openFile]
  );

  return {
    files,
    openFiles,
    activeFileId,
    activeFile,
    activeContent,
    fileContents,
    createFile,
    deleteFile,
    renameFile,
    moveFile,
    getFileById,
    getFileByPath,
    openFile,
    openFileByPath,
    closeFile,
    setActiveFile,
    updateFileContent,
    markFileSaved,
    setLanguage,
    saveFile,
  };
}
