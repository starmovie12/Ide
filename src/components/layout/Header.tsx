/**
 * Header — v6 Phase 5
 * §2.4: Quota health pill showing aggregate daily Flash usage across all keys.
 *       Color: green < 70%, amber 70–90%, red > 90%.
 *       Click → per-key breakdown tooltip.
 */

import { useEffect, useRef, useState } from 'react';
import { Menu, Plus, Download, Pencil, Check, X, MoreVertical, Zap } from 'lucide-react';
import { useUIStore } from '@/lib/store/uiStore';
import { useChatStore } from '@/lib/store/chatStore';
import { useEditorStore } from '@/lib/store/editorStore';
import { useAPIKeyStore } from '@/lib/store/apiKeyStore';
import { exportAsZip } from '@/lib/io/zipExport';
import { cn } from '@/lib/utils/cn';

/** Flash RPD cap per key — used to compute aggregate cap */
const FLASH_RPD_PER_KEY = 1500;

interface HeaderProps {
  onAddAgent?: () => void;
}

/**
 * §2.4 Quota Health Pill
 * Shows aggregate Flash daily usage across all keys.
 */
function QuotaPill() {
  const keys = useAPIKeyStore((s) => s.keys);
  const [expanded, setExpanded] = useState(false);
  const pillRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!expanded) return;
    function handle(e: MouseEvent) {
      if (pillRef.current && !pillRef.current.contains(e.target as Node)) {
        setExpanded(false);
      }
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [expanded]);

  if (keys.length === 0) return null;

  const activeKeys = keys.filter((k) => k.status !== 'dead');
  const totalCap = activeKeys.length * FLASH_RPD_PER_KEY;
  const totalUsed = activeKeys.reduce((sum, k) => sum + (k.dailyRequests ?? 0), 0);

  const pct = totalCap > 0 ? totalUsed / totalCap : 0;
  const pillColor =
    pct >= 0.9
      ? 'var(--color-destructive)'
      : pct >= 0.7
      ? 'var(--color-warning)'
      : 'var(--color-success)';

  const pillBg =
    pct >= 0.9
      ? 'var(--color-destructive-subtle)'
      : pct >= 0.7
      ? 'var(--color-warning-subtle)'
      : 'var(--color-success-subtle)';

  return (
    <div ref={pillRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setExpanded((o) => !o)}
        aria-label={`Quota: ${totalUsed} of ${totalCap} Flash calls used today`}
        title="API Quota — click for details"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          padding: '4px 8px',
          borderRadius: 'var(--radius-full)',
          border: `1px solid ${pillColor}`,
          background: pillBg,
          cursor: 'pointer',
          color: pillColor,
          fontSize: 11,
          fontFamily: 'var(--font-numeric)',
          fontWeight: 600,
          whiteSpace: 'nowrap',
          transition: 'all 150ms',
        }}
      >
        <Zap size={11} />
        {totalUsed.toLocaleString()} / {totalCap.toLocaleString()}
      </button>

      {/* §2.4 per-key breakdown dropdown */}
      {expanded && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            minWidth: 240,
            background: 'var(--bg-surface-overlay)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-overlay)',
            padding: '10px',
            zIndex: 200,
          }}
        >
          <p
            style={{
              margin: '0 0 8px',
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--text-quaternary)',
              fontFamily: 'var(--font-label)',
            }}
          >
            Daily Flash Usage
          </p>
          {activeKeys.map((k) => {
            const used = k.dailyRequests ?? 0;
            const kPct = Math.min(used / FLASH_RPD_PER_KEY, 1);
            const kColor =
              kPct >= 0.9
                ? 'var(--color-destructive)'
                : kPct >= 0.7
                ? 'var(--color-warning)'
                : 'var(--color-success)';
            return (
              <div key={k.id} style={{ marginBottom: 8 }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginBottom: 3,
                  }}
                >
                  <span
                    style={{
                      fontSize: 12,
                      color: 'var(--text-secondary)',
                      fontFamily: 'var(--font-body)',
                    }}
                  >
                    {k.label || `Key …${k.key.slice(-4)}`}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      color: kColor,
                      fontFamily: 'var(--font-numeric)',
                      fontWeight: 600,
                    }}
                  >
                    {used} / {FLASH_RPD_PER_KEY}
                  </span>
                </div>
                {/* Progress bar */}
                <div
                  style={{
                    height: 3,
                    background: 'var(--bg-surface-sunken)',
                    borderRadius: 2,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${Math.round(kPct * 100)}%`,
                      background: kColor,
                      borderRadius: 2,
                      transition: 'width 300ms',
                    }}
                  />
                </div>
              </div>
            );
          })}
          <p
            style={{
              margin: '6px 0 0',
              fontSize: 10,
              color: 'var(--text-quaternary)',
              fontFamily: 'var(--font-body)',
            }}
          >
            Resets at midnight US/Pacific · Add keys in Settings
          </p>
        </div>
      )}
    </div>
  );
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

      {/* §2.4 Quota health pill — rightmost before action buttons */}
      <QuotaPill />

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
