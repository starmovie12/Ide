import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Settings {
  // Agent defaults
  defaultAgentIds: string[];
  defaultModel: string;

  // Behaviour
  streamingEnabled: boolean;
  autoResume: boolean;
  sendOnEnter: boolean;
  showThinkingPanel: boolean;

  // Appearance
  theme: 'dark';
  fontSize: 'sm' | 'md' | 'lg';
  reducedMotion: boolean;
  compactMode: boolean;
  codeFont: 'jetbrains' | 'fira' | 'mono';
}

export interface SettingsState {
  settings: Settings;
  updateSettings: (updates: Partial<Settings>) => void;
  resetSettings: () => void;
}

const DEFAULT_SETTINGS: Settings = {
  defaultAgentIds: [],
  defaultModel: 'gemini-2.5-flash',
  streamingEnabled: true,
  autoResume: true,
  sendOnEnter: true,
  showThinkingPanel: true,
  theme: 'dark',
  fontSize: 'md',
  reducedMotion: false,
  compactMode: false,
  codeFont: 'jetbrains',
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      settings: { ...DEFAULT_SETTINGS },

      updateSettings: (updates) =>
        set((state) => ({ settings: { ...state.settings, ...updates } })),

      resetSettings: () =>
        set({ settings: { ...DEFAULT_SETTINGS } }),
    }),
    { name: 'settings-storage' }
  )
);
