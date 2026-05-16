import { useEffect, useRef, useState } from 'react';
import { Menu, Plus, Download, Pencil, Check, X, MoreVertical } from 'lucide-react';
import { useUIStore } from '@/lib/store/uiStore';
import { useChatStore } from '@/lib/store/chatStore';
import { useEditorStore } from '@/lib/store/editorStore';
import { exportAsZip } from '@/lib/io/zipExport';
import { cn } from '@/lib/utils/cn';

interface HeaderProps {
  onAddAgent?: () => void;
}

export function Header({ onAddAgent }: HeaderProps) {
  const { toggleSidebar } = useUIStore();
  const { activeChatId, chats, updateChatTitle } = useChatStore();
  const { files } = useEditorStore();

  const activeChat = chats.find((c) => c.id === activeChatId) ?? null;

  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Focus input when rename starts
  useEffect(() => {
    if (isRenaming) {
      renameInputRef.current?.select();
    }
  }, [isRenaming]);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  const startRename = () => {
    if (!activeChat) return;
    setRenameValue(activeChat.title);
    setIsRenaming(true);
  };

  const commitRename = () => {
    const trimmed = renameValue.trim();
    if (trimmed && activeChatId) {
      updateChatTitle(activeChatId, trimmed);
    }
    setIsRenaming(false);
  };

  const cancelRename = () => {
    setIsRenaming(false);
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') commitRename();
    if (e.key === 'Escape') cancelRename();
  };

  const handleExportZip = async () => {
    setMenuOpen(false);
    const repoName = activeChat?.title.slice(0, 40).replace(/\s+/g, '-').toLowerCase() || 'project';
    await exportAsZip(files, repoName);
  };

  return (
    <header
      style={{
        height: 'var(--header-h)',
        background: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border-default)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 12px',
        gap: '8px',
        flexShrink: 0,
        position: 'relative',
        zIndex: 10,
      }}
    >
      <button
        data-testid="button-toggle-sidebar"
        onClick={toggleSidebar}
        className={cn(
          'flex items-center justify-center rounded-lg transition-colors duration-150',
          'hover:bg-[var(--bg-surface-elevated)] active:scale-95'
        )}
        style={{
          width: 44,
          height: 44,
          color: 'var(--text-secondary)',
          border: 'none',
          background: 'none',
          cursor: 'pointer',
          flexShrink: 0,
        }}
        aria-label="Toggle sidebar"
      >
        <Menu size={20} />
      </button>

      {/* Title / rename area */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        {isRenaming ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, minWidth: 0 }}>
            <input
              ref={renameInputRef}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={handleRenameKeyDown}
              onBlur={commitRename}
              style={{
                flex: 1,
                minWidth: 0,
                maxWidth: 320,
                background: 'var(--bg-surface-sunken)',
                border: '1px solid var(--color-primary)',
                borderRadius: 'var(--radius-sm)',
                padding: '4px 10px',
                fontSize: 14,
                fontFamily: 'var(--font-display)',
                fontWeight: 600,
                color: 'var(--text-primary)',
                outline: 'none',
              }}
            />
            <button
              onClick={commitRename}
              style={{
                width: 28,
                height: 28,
                border: 'none',
                borderRadius: 6,
                background: 'var(--color-primary)',
                color: '#fff',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
              aria-label="Confirm rename"
            >
              <Check size={13} />
            </button>
            <button
              onClick={cancelRename}
              style={{
                width: 28,
                height: 28,
                border: '1px solid var(--border-default)',
                borderRadius: 6,
                background: 'none',
                color: 'var(--text-tertiary)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
              aria-label="Cancel rename"
            >
              <X size={13} />
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: 'var(--color-primary)',
                boxShadow: '0 0 8px var(--color-primary)',
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 700,
                fontSize: 15,
                color: 'var(--text-primary)',
                letterSpacing: '-0.01em',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: 260,
              }}
            >
              {activeChat?.title ?? 'AI Agent Studio'}
            </span>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {/* Rename */}
        {!isRenaming && (
          <button
            data-testid="button-rename"
            onClick={startRename}
            disabled={!activeChat}
            className="flex items-center justify-center rounded-lg transition-colors duration-150 hover:bg-[var(--bg-surface-elevated)] active:scale-95"
            style={{
              width: 36,
              height: 36,
              color: activeChat ? 'var(--text-tertiary)' : 'var(--text-quaternary)',
              border: 'none',
              background: 'none',
              cursor: activeChat ? 'pointer' : 'default',
              opacity: activeChat ? 1 : 0.4,
            }}
            aria-label="Rename chat"
          >
            <Pencil size={15} />
          </button>
        )}

        {/* Add Agent */}
        <button
          data-testid="button-add-agent"
          onClick={onAddAgent}
          className="flex items-center gap-1.5 rounded-lg font-semibold transition-all duration-150 active:scale-95"
          style={{
            background: 'var(--color-primary)',
            color: 'white',
            border: 'none',
            cursor: 'pointer',
            padding: '0 14px',
            height: 36,
            fontSize: 14,
            fontFamily: 'var(--font-body)',
          }}
        >
          <Plus size={16} />
          <span className="hidden sm:inline">Agent</span>
        </button>

        {/* More menu */}
        <div style={{ position: 'relative' }} ref={menuRef}>
          <button
            data-testid="button-more-menu"
            onClick={() => setMenuOpen((o) => !o)}
            className="flex items-center justify-center rounded-lg transition-colors duration-150 hover:bg-[var(--bg-surface-elevated)] active:scale-95"
            style={{
              width: 36,
              height: 36,
              color: 'var(--text-tertiary)',
              border: 'none',
              background: menuOpen ? 'var(--bg-surface-elevated)' : 'none',
              cursor: 'pointer',
            }}
            aria-label="More options"
            aria-expanded={menuOpen}
          >
            <MoreVertical size={16} />
          </button>

          {menuOpen && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 6px)',
                right: 0,
                minWidth: 180,
                background: 'var(--bg-surface-overlay)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-lg)',
                boxShadow: 'var(--shadow-overlay)',
                padding: '4px',
                zIndex: 100,
              }}
            >
              <button
                onClick={handleExportZip}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  width: '100%',
                  padding: '8px 12px',
                  border: 'none',
                  borderRadius: 'var(--radius-base)',
                  background: 'none',
                  color: 'var(--text-secondary)',
                  fontSize: 14,
                  fontFamily: 'var(--font-body)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background 120ms',
                }}
                className="hover:bg-[var(--bg-surface-elevated)]"
              >
                <Download size={14} style={{ color: 'var(--text-quaternary)', flexShrink: 0 }} />
                Export Files as ZIP
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
