import { useState } from 'react';
import { Header } from '@/components/layout/Header';
import { Sidebar } from '@/components/layout/Sidebar';
import { SidebarOverlay } from '@/components/layout/SidebarOverlay';
import { AgentPillBar } from '@/components/layout/AgentPillBar';
import { ChatArea } from '@/components/layout/ChatArea';
import { ChatFooter } from '@/components/layout/ChatFooter';
import { FileExplorer } from '@/components/layout/FileExplorer';
import { GlassIsland } from '@/components/layout/GlassIsland';
import { AgentLibraryModal } from '@/components/agent/AgentLibraryModal';
import { CreateAgentView } from '@/components/agent/CreateAgentView';
import { EditAgentView } from '@/components/agent/EditAgentView';
import { RightPanel } from '@/components/layout/RightPanel';
import { useUIStore } from '@/lib/store/uiStore';

export default function Home() {
  const [createOpen, setCreateOpen] = useState(false);
  const {
    agentLibraryOpen,
    setAgentLibraryOpen,
    editingAgentId,
    editingAgentChatId,
    closeEditAgent,
  } = useUIStore();

  return (
    <div
      style={{
        background: 'var(--bg-base)',
        color: 'var(--text-primary)',
        height: '100vh',
        display: 'flex',
        overflow: 'hidden',
        fontFamily: 'var(--font-body)',
      }}
    >
      <Sidebar />
      <SidebarOverlay />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        <Header onAddAgent={() => setAgentLibraryOpen(true)} />
        <AgentPillBar onAddAgent={() => setAgentLibraryOpen(true)} />

        <main style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          <FileExplorer />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
            <ChatArea />
            <ChatFooter />
          </div>
          <RightPanel />
        </main>
      </div>

      <GlassIsland />

      {/* Modals / views */}
      <AgentLibraryModal
        open={agentLibraryOpen}
        onClose={() => setAgentLibraryOpen(false)}
        onCreateNew={() => { setAgentLibraryOpen(false); setCreateOpen(true); }}
      />
      <CreateAgentView
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />
      {editingAgentId && (
        <EditAgentView
          open={!!editingAgentId}
          onClose={closeEditAgent}
          agentId={editingAgentId}
          chatId={editingAgentChatId}
        />
      )}
    </div>
  );
}
