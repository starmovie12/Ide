import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useEditorStore } from './editorStore';

export interface VersionSnapshot {
  id: string;
  chatId?: string;
  files: Record<string, string>;
  description: string;
  timestamp: number;
  agentId?: string;
}

export interface HistoryState {
  snapshots: VersionSnapshot[];
  addSnapshot: (snapshot: Omit<VersionSnapshot, 'id' | 'timestamp'>) => void;
  restoreSnapshot: (id: string) => void;
  clearHistory: () => void;
}

const MAX_SNAPSHOTS = 20;

export const useHistoryStore = create<HistoryState>()(
  persist(
    (set, get) => ({
      snapshots: [],
      addSnapshot: (snapshot) =>
        set((state) => {
          const next = [
            ...state.snapshots,
            { ...snapshot, id: crypto.randomUUID(), timestamp: Date.now() },
          ];
          if (next.length > MAX_SNAPSHOTS) next.splice(0, next.length - MAX_SNAPSHOTS);
          return { snapshots: next };
        }),
      restoreSnapshot: (id) => {
        const snapshot = get().snapshots.find((s) => s.id === id);
        if (!snapshot) return;
        const editorStore = useEditorStore.getState();
        for (const file of editorStore.files) {
          const content = snapshot.files[file.id];
          if (content !== undefined) {
            editorStore.updateFileContent(file.id, content);
          }
        }
      },
      clearHistory: () => set({ snapshots: [] }),
    }),
    { name: 'history-storage' }
  )
);
