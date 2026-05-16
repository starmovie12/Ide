import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface FileEntry {
  id: string;
  path: string;
  content: string;
  language: string;
  updatedAt: number;
}

export interface EditorFile {
  id: string;
  path: string;
  language: string;
  isDirty: boolean;
}

export interface EditorState {
  files: FileEntry[];
  openFiles: EditorFile[];
  activeFileId: string | null;
  fileContents: Record<string, string>;

  createFile: (path: string, content?: string) => string;
  deleteFile: (id: string) => void;
  renameFile: (id: string, newPath: string) => void;
  moveFile: (id: string, newFolderPath: string) => void;
  getFileById: (id: string) => FileEntry | undefined;
  getFileByPath: (path: string) => FileEntry | undefined;

  openFile: (file: Omit<EditorFile, 'isDirty'>, content?: string) => void;
  closeFile: (id: string) => void;
  setActiveFile: (id: string) => void;
  updateFileContent: (id: string, content: string) => void;
  markFileSaved: (id: string) => void;
  setLanguage: (id: string, language: string) => void;
}

export function extToLanguage(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    css: 'css',
    scss: 'scss',
    html: 'html',
    json: 'json',
    md: 'markdown',
    py: 'python',
    rs: 'rust',
    go: 'go',
    sh: 'shell',
    yml: 'yaml',
    yaml: 'yaml',
    toml: 'ini',
    sql: 'sql',
    graphql: 'graphql',
    xml: 'xml',
  };
  return map[ext] ?? 'plaintext';
}

export const useEditorStore = create<EditorState>()(
  persist(
    (set, get) => ({
      files: [],
      openFiles: [],
      activeFileId: null,
      fileContents: {},

      createFile: (path, content = '') => {
        const id = crypto.randomUUID();
        const language = extToLanguage(path);
        const entry: FileEntry = { id, path, content, language, updatedAt: Date.now() };
        set((state) => ({ files: [...state.files, entry] }));
        get().openFile({ id, path, language }, content);
        return id;
      },

      deleteFile: (id) =>
        set((state) => {
          const remaining = state.openFiles.filter((f) => f.id !== id);
          const { [id]: _removed, ...contents } = state.fileContents;
          return {
            files: state.files.filter((f) => f.id !== id),
            openFiles: remaining,
            activeFileId:
              state.activeFileId === id
                ? (remaining[remaining.length - 1]?.id ?? null)
                : state.activeFileId,
            fileContents: contents,
          };
        }),

      renameFile: (id, newPath) =>
        set((state) => ({
          files: state.files.map((f) =>
            f.id === id ? { ...f, path: newPath, language: extToLanguage(newPath), updatedAt: Date.now() } : f
          ),
          openFiles: state.openFiles.map((f) =>
            f.id === id ? { ...f, path: newPath, language: extToLanguage(newPath) } : f
          ),
        })),

      moveFile: (id, newFolderPath) => {
        const file = get().files.find((f) => f.id === id);
        if (!file) return;
        const name = file.path.split('/').pop() ?? file.path;
        const newPath = newFolderPath ? `${newFolderPath}/${name}` : name;
        get().renameFile(id, newPath);
      },

      getFileById: (id) => get().files.find((f) => f.id === id),
      getFileByPath: (path) => get().files.find((f) => f.path === path),

      openFile: (file, content) =>
        set((state) => {
          const exists = state.openFiles.find((f) => f.id === file.id);
          const language = file.language || extToLanguage(file.path);
          const storedContent = content ?? state.files.find((f) => f.id === file.id)?.content ?? '';
          return {
            openFiles: exists
              ? state.openFiles
              : [...state.openFiles, { ...file, language, isDirty: false }],
            activeFileId: file.id,
            fileContents: exists
              ? state.fileContents
              : { ...state.fileContents, [file.id]: storedContent },
          };
        }),

      closeFile: (id) =>
        set((state) => {
          const remaining = state.openFiles.filter((f) => f.id !== id);
          const { [id]: _removed, ...contents } = state.fileContents;
          return {
            openFiles: remaining,
            activeFileId:
              state.activeFileId === id
                ? (remaining[remaining.length - 1]?.id ?? null)
                : state.activeFileId,
            fileContents: contents,
          };
        }),

      setActiveFile: (id) => set({ activeFileId: id }),

      updateFileContent: (id, content) =>
        set((state) => ({
          files: state.files.map((f) =>
            f.id === id ? { ...f, content, updatedAt: Date.now() } : f
          ),
          openFiles: state.openFiles.map((f) => (f.id === id ? { ...f, isDirty: true } : f)),
          fileContents: { ...state.fileContents, [id]: content },
        })),

      markFileSaved: (id) =>
        set((state) => ({
          openFiles: state.openFiles.map((f) => (f.id === id ? { ...f, isDirty: false } : f)),
        })),

      setLanguage: (id, language) =>
        set((state) => ({
          openFiles: state.openFiles.map((f) => (f.id === id ? { ...f, language } : f)),
        })),
    }),
    { name: 'editor-storage' }
  )
);
