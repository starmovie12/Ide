/**
 * ForgeTopBar — Part 4 §1.4
 *
 * The Focus Forge top bar. Strictly minimal — only:
 *   - sidebar toggle (mobile, opens chat list)
 *   - "Focus Forge" wordmark
 *   - Repo selector chip
 *   - Quick stack switcher (1 / 2 / 3 pills)
 *   - Model stack chip (detail)
 *   - Settings cog
 *
 * Notably ABSENT vs legacy Header.tsx:
 *   - Agent pills, blueprint progress, sandbox indicator
 *   - Avatar (Constitutional Law 30 — avatar lives only in bottom nav)
 *
 * Height: 44px (Apple HIG tappable). Safe-area inset top respected.
 */

import { Menu, Settings as SettingsIcon } from 'lucide-react';
import { useState } from 'react';
import { ForgeBrand } from './ForgeBrand';
import { ModelStackChip } from './ModelStackChip';
import { ModelStackSheet } from './ModelStackSheet';
import { QuickStackSwitcher } from './QuickStackSwitcher';
import { RepoSelectorChip } from './RepoSelectorChip';

interface ForgeTopBarProps {
  onOpenSidebar?: () => void;
  onOpenSettings?: () => void;
  onOpenRepoPicker?: () => void;
}

export function ForgeTopBar({
  onOpenSidebar,
  onOpenSettings,
  onOpenRepoPicker,
}: ForgeTopBarProps) {
  const [stackSheetOpen, setStackSheetOpen] = useState(false);

  return (
    <>
      <header
        role="banner"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          height: 44,
          padding: '0 10px',
          paddingTop: 'env(safe-area-inset-top, 0)',
          background: 'var(--bg-surface-elevated)',
          borderBottom: '1px solid var(--border-subtle, rgba(255,255,255,0.06))',
          position: 'sticky',
          top: 0,
          zIndex: 'var(--z-sticky, 200)',
          backdropFilter: 'blur(20px) saturate(180%)',
          // WebKit prefix on its own line — keeps TS-style happy.
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        }}
      >
        <button
          type="button"
          onClick={() => onOpenSidebar?.()}
          aria-label="Open chat list"
          title="Chats"
          style={{
            width: 36,
            height: 36,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'transparent',
            border: 'none',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            borderRadius: 8,
            flexShrink: 0,
          }}
        >
          <Menu size={18} aria-hidden="true" />
        </button>

        <ForgeBrand />

        <span style={{ flex: 1 }} />

        <RepoSelectorChip onClick={() => onOpenRepoPicker?.()} />
        <div className="forge-quickswitch-wrap" style={{ display: 'inline-flex' }}>
          <QuickStackSwitcher />
        </div>
        <ModelStackChip onClick={() => setStackSheetOpen(true)} />

        <button
          type="button"
          onClick={() => onOpenSettings?.()}
          aria-label="Settings"
          title="Settings"
          style={{
            width: 36,
            height: 36,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'transparent',
            border: 'none',
            color: 'var(--text-tertiary)',
            cursor: 'pointer',
            borderRadius: 8,
            flexShrink: 0,
          }}
        >
          <SettingsIcon size={16} aria-hidden="true" />
        </button>
      </header>

      <ModelStackSheet open={stackSheetOpen} onOpenChange={setStackSheetOpen} />
    </>
  );
}
