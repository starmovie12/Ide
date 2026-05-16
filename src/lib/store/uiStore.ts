import { create } from 'zustand';

interface UIState {
  sidebarOpen: boolean;
  activeTab: 'chat' | 'files' | 'preview' | 'settings';
  filePanelOpen: boolean;
  thinkingPanelOpen: boolean;
  agentLibraryOpen: boolean;

  // Edit agent panel
  editingAgentId: string | null;
  editingAgentChatId: string | null; // null = editing template, non-null = editing chat instance

  openSidebar: () => void;
  closeSidebar: () => void;
  toggleSidebar: () => void;
  setActiveTab: (tab: UIState['activeTab']) => void;
  toggleFilePanel: () => void;
  setThinkingPanelOpen: (open: boolean) => void;
  setAgentLibraryOpen: (open: boolean) => void;
  openEditAgent: (agentId: string, chatId?: string | null) => void;
  closeEditAgent: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: false,
  activeTab: 'chat',
  filePanelOpen: true,
  thinkingPanelOpen: false,
  agentLibraryOpen: false,
  editingAgentId: null,
  editingAgentChatId: null,

  openSidebar: () => set({ sidebarOpen: true }),
  closeSidebar: () => set({ sidebarOpen: false }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setActiveTab: (tab) => set({ activeTab: tab }),
  toggleFilePanel: () => set((state) => ({ filePanelOpen: !state.filePanelOpen })),
  setThinkingPanelOpen: (open) => set({ thinkingPanelOpen: open }),
  setAgentLibraryOpen: (open) => set({ agentLibraryOpen: open }),
  openEditAgent: (agentId, chatId = null) =>
    set({ editingAgentId: agentId, editingAgentChatId: chatId }),
  closeEditAgent: () => set({ editingAgentId: null, editingAgentChatId: null }),
}));
