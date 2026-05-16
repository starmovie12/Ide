import { create } from 'zustand';
import { applyAllDiffBlocks } from '@/lib/diff/apply';
import { useEditorStore } from '@/lib/store/editorStore';
import { useHistoryStore } from '@/lib/store/historyStore';

export interface PendingDiff {
  id: string;
  filePath: string;
  searchContent: string;
  replaceContent: string;
  agentName: string;
  acceptedAt: number | null;
  addedAt: number;
}

export interface DiffState {
  pendingDiffs: PendingDiff[];
  reviewIndex: number | null;

  addDiff: (diff: Omit<PendingDiff, 'id' | 'addedAt'>) => void;
  removeDiff: (id: string) => void;
  clearDiffs: () => void;

  acceptDiff: (id: string) => void;
  rejectDiff: (id: string) => void;
  acceptAllForFile: (filePath: string) => void;
  rejectAllForFile: (filePath: string) => void;
  acceptAll: () => void;
  rejectAll: () => void;

  setReviewIndex: (idx: number | null) => void;
  stepReview: (direction: 1 | -1) => void;
}

function applyAndSave(diffs: PendingDiff[]) {
  if (diffs.length === 0) return;
  const editorStore = useEditorStore.getState();
  const historyStore = useHistoryStore.getState();

  const snapshot: Record<string, string> = { ...editorStore.fileContents };

  const byFile = new Map<string, PendingDiff[]>();
  for (const d of diffs) {
    const arr = byFile.get(d.filePath) ?? [];
    arr.push(d);
    byFile.set(d.filePath, arr);
  }

  byFile.forEach((blocks, filePath) => {
    const fileEntry = editorStore.files.find(
      (f) => f.path === filePath || f.id === filePath
    );
    const original = fileEntry
      ? (editorStore.fileContents[fileEntry.id] ?? fileEntry.content)
      : '';

    const diffBlocks = blocks.map((b) => ({
      filePath: b.filePath,
      searchContent: b.searchContent,
      replaceContent: b.replaceContent,
      raw: b.searchContent,
    }));

    const { content } = applyAllDiffBlocks(original, diffBlocks);

    if (fileEntry) {
      editorStore.updateFileContent(fileEntry.id, content);
    } else {
      const id = editorStore.createFile(filePath, content);
      void id;
    }
  });

  historyStore.addSnapshot({
    description: `Applied ${diffs.length} diff${diffs.length !== 1 ? 's' : ''} from agents`,
    files: snapshot,
  });
}

export const useDiffStore = create<DiffState>()((set, get) => ({
  pendingDiffs: [],
  reviewIndex: null,

  addDiff: (diff) =>
    set((state) => ({
      pendingDiffs: [
        ...state.pendingDiffs,
        { ...diff, id: crypto.randomUUID(), addedAt: Date.now() },
      ],
    })),

  removeDiff: (id) =>
    set((state) => ({
      pendingDiffs: state.pendingDiffs.filter((d) => d.id !== id),
    })),

  clearDiffs: () => set({ pendingDiffs: [], reviewIndex: null }),

  acceptDiff: (id) => {
    const { pendingDiffs } = get();
    const diff = pendingDiffs.find((d) => d.id === id);
    if (!diff) return;
    applyAndSave([diff]);
    set((state) => ({
      pendingDiffs: state.pendingDiffs.filter((d) => d.id !== id),
    }));
  },

  rejectDiff: (id) =>
    set((state) => ({
      pendingDiffs: state.pendingDiffs.filter((d) => d.id !== id),
    })),

  acceptAllForFile: (filePath) => {
    const { pendingDiffs } = get();
    const forFile = pendingDiffs.filter((d) => d.filePath === filePath);
    applyAndSave(forFile);
    set((state) => ({
      pendingDiffs: state.pendingDiffs.filter((d) => d.filePath !== filePath),
    }));
  },

  rejectAllForFile: (filePath) =>
    set((state) => ({
      pendingDiffs: state.pendingDiffs.filter((d) => d.filePath !== filePath),
    })),

  acceptAll: () => {
    const { pendingDiffs } = get();
    applyAndSave(pendingDiffs);
    set({ pendingDiffs: [], reviewIndex: null });
  },

  rejectAll: () => set({ pendingDiffs: [], reviewIndex: null }),

  setReviewIndex: (idx) => set({ reviewIndex: idx }),

  stepReview: (direction) =>
    set((state) => {
      if (state.pendingDiffs.length === 0) return { reviewIndex: null };
      const current = state.reviewIndex ?? 0;
      const next = Math.max(0, Math.min(state.pendingDiffs.length - 1, current + direction));
      return { reviewIndex: next };
    }),
}));
