import { X, Search, Plus, Settings, MessageSquare, Trash2 } from 'lucide-react';
import { Link } from 'wouter';
import { useUIStore } from '@/lib/store/uiStore';
import { useChatStore } from '@/lib/store/chatStore';
import { cn } from '@/lib/utils/cn';

function groupChatsByDate(chats: Array<{ id: string; title: string; updatedAt: number }>) {
  const now = Date.now();
  const oneDayMs = 86_400_000;
  const groups: Record<string, typeof chats> = {
    Today: [],
    Yesterday: [],
    'Last 7 Days': [],
    Older: [],
  };

  for (const chat of chats) {
    const diff = now - chat.updatedAt;
    if (diff < oneDayMs) {
      groups['Today'].push(chat);
    } else if (diff < 2 * oneDayMs) {
      groups['Yesterday'].push(chat);
    } else if (diff < 7 * oneDayMs) {
      groups['Last 7 Days'].push(chat);
    } else {
      groups['Older'].push(chat);
    }
  }

  return groups;
}

export function Sidebar() {
  const { sidebarOpen, closeSidebar } = useUIStore();
  const { chats, activeChatId, createChat, switchChat, deleteChat } = useChatStore();

  const sortedChats = [...chats].sort((a, b) => b.updatedAt - a.updatedAt);
  const grouped = groupChatsByDate(sortedChats);

  const handleNewChat = () => {
    createChat('New Chat');
    closeSidebar();
  };

  const handleChatClick = (id: string) => {
    switchChat(id);
    closeSidebar();
  };

  return (
    <aside
      data-open={sidebarOpen}
      style={{
        position: 'fixed',
        top: 0,
        bottom: 0,
        left: 0,
        width: 'min(var(--sidebar-w), 85vw)',
        background: 'var(--bg-surface)',
        borderRight: '1px solid var(--border-default)',
        zIndex: 'var(--z-dropdown)',
        display: 'flex',
        flexDirection: 'column',
        padding: '10px',
        transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 320ms cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      {/* Logo row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '6px 6px 16px',
          borderBottom: '1px solid var(--border-subtle)',
          marginBottom: 10,
        }}
      >
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            background: 'var(--color-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            boxShadow: '0 0 12px rgba(124, 106, 247, 0.4)',
          }}
        >
          <span style={{ fontSize: 14 }}>★</span>
        </div>
        <span
          style={{
            flex: 1,
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: 14,
            color: 'var(--text-primary)',
          }}
        >
          AI Agent Studio
        </span>
        <button
          data-testid="button-close-sidebar"
          onClick={closeSidebar}
          className="flex items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-surface-elevated)]"
          style={{
            width: 32,
            height: 32,
            border: 'none',
            background: 'none',
            color: 'var(--text-tertiary)',
            cursor: 'pointer',
          }}
          aria-label="Close sidebar"
        >
          <X size={16} />
        </button>
      </div>

      {/* New Chat */}
      <button
        data-testid="button-new-chat"
        onClick={handleNewChat}
        className="flex items-center justify-center gap-2 rounded-lg transition-colors duration-150 hover:bg-[var(--bg-surface-elevated)]"
        style={{
          width: '100%',
          height: 38,
          border: '1px dashed var(--border-strong)',
          background: 'none',
          color: 'var(--text-secondary)',
          cursor: 'pointer',
          fontSize: 13,
          fontFamily: 'var(--font-body)',
          marginBottom: 10,
        }}
      >
        <Plus size={14} />
        New Chat
      </button>

      {/* Chat list or empty state */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {chats.length === 0 ? (
          <EmptyState onNewChat={handleNewChat} />
        ) : (
          Object.entries(grouped).map(([label, groupChats]) =>
            groupChats.length > 0 ? (
              <ChatSection
                key={label}
                label={label}
                chats={groupChats}
                activeChatId={activeChatId}
                onChatClick={handleChatClick}
                onDelete={deleteChat}
              />
            ) : null
          )
        )}
      </div>

      {/* Footer */}
      <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 10, marginTop: 8 }}>
        <Link
          href="/settings"
          onClick={closeSidebar}
          className={cn(
            'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors duration-150',
            'hover:bg-[var(--bg-surface-elevated)]'
          )}
          style={{
            color: 'var(--text-secondary)',
            textDecoration: 'none',
            fontFamily: 'var(--font-body)',
          }}
          data-testid="link-settings"
        >
          <Settings size={16} />
          Settings
        </Link>
      </div>
    </aside>
  );
}

function EmptyState({ onNewChat }: { onNewChat: () => void }) {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        padding: '24px 12px',
        textAlign: 'center',
      }}
    >
      <MessageSquare size={28} style={{ color: 'var(--text-quaternary)' }} />
      <div>
        <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>
          No chats yet
        </p>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--text-quaternary)', fontFamily: 'var(--font-body)' }}>
          Create a new chat to start
        </p>
      </div>
      <button
        onClick={onNewChat}
        style={{
          padding: '6px 14px',
          background: 'var(--color-primary-subtle)',
          border: '1px solid var(--border-accent)',
          borderRadius: 'var(--radius-base)',
          fontSize: 12,
          color: 'var(--color-primary)',
          cursor: 'pointer',
          fontFamily: 'var(--font-body)',
        }}
      >
        + New Chat
      </button>
    </div>
  );
}

function ChatSection({
  label,
  chats,
  activeChatId,
  onChatClick,
  onDelete,
}: {
  label: string;
  chats: Array<{ id: string; title: string; updatedAt: number }>;
  activeChatId: string | null;
  onChatClick: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div style={{ marginBottom: 8 }}>
      <p
        style={{
          fontSize: 10,
          fontFamily: 'var(--font-display)',
          fontWeight: 700,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: 'var(--text-quaternary)',
          padding: '0 8px',
          marginBottom: 4,
          marginTop: 0,
        }}
      >
        {label}
      </p>
      {chats.map((chat) => (
        <ChatItem
          key={chat.id}
          chat={chat}
          isActive={chat.id === activeChatId}
          onClick={() => onChatClick(chat.id)}
          onDelete={() => onDelete(chat.id)}
        />
      ))}
    </div>
  );
}

function ChatItem({
  chat,
  isActive,
  onClick,
  onDelete,
}: {
  chat: { id: string; title: string };
  isActive: boolean;
  onClick: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className="group flex items-center gap-1 rounded-lg transition-colors duration-150 hover:bg-[var(--bg-surface-elevated)]"
      style={{
        background: isActive ? 'var(--bg-surface-elevated)' : 'none',
        borderLeft: isActive ? '2px solid var(--color-primary)' : '2px solid transparent',
      }}
    >
      <button
        data-testid={`chat-item-${chat.id}`}
        onClick={onClick}
        className="flex items-center gap-2.5 flex-1 py-2 px-3 text-left min-w-0"
        style={{
          border: 'none',
          background: 'none',
          cursor: 'pointer',
          color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
          fontSize: 13,
          fontFamily: 'var(--font-body)',
          padding: '7px 8px',
          minWidth: 0,
        }}
      >
        <MessageSquare size={13} style={{ color: 'var(--text-quaternary)', flexShrink: 0 }} />
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
          }}
        >
          {chat.title}
        </span>
      </button>

      <button
        onClick={(e) => {
          e.stopPropagation();
          if (confirm(`Delete "${chat.title}"?`)) onDelete();
        }}
        className="opacity-0 group-hover:opacity-100 flex items-center justify-center rounded transition-colors hover:bg-[var(--color-destructive-subtle)] mr-1 flex-shrink-0"
        style={{
          width: 26,
          height: 26,
          border: 'none',
          background: 'none',
          cursor: 'pointer',
          color: 'var(--text-quaternary)',
          transition: 'opacity 150ms, color 150ms',
        }}
        aria-label={`Delete ${chat.title}`}
      >
        <Trash2 size={11} />
      </button>
    </div>
  );
}
