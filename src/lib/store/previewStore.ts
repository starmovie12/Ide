import { create } from 'zustand';

export type ViewMode = 'desktop' | 'mobile';

export interface PreviewState {
  url: string | null;
  isLoading: boolean;
  error: string | null;
  viewMode: ViewMode;
  refreshKey: number;
  setUrl: (url: string | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setViewMode: (mode: ViewMode) => void;
  refresh: () => void;
}

export const usePreviewStore = create<PreviewState>()((set) => ({
  url: null,
  isLoading: false,
  error: null,
  viewMode: 'desktop',
  refreshKey: 0,
  setUrl: (url) => set({ url }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  setViewMode: (viewMode) => set({ viewMode }),
  refresh: () => set((state) => ({ refreshKey: state.refreshKey + 1 })),
}));
