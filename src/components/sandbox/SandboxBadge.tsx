/**
 * SandboxBadge — Phase 5 §4.1
 * Small header badge showing the current sandbox mode.
 * Click → tooltip explaining why this mode is active.
 */

import { useState } from 'react';
import { Package, Cloud, AlertTriangle, X } from 'lucide-react';
import type { SandboxMode } from '@/lib/sandbox/types';

interface SandboxBadgeProps {
  mode: SandboxMode | 'skip' | null;
}

const MODE_CONFIG = {
  webcontainer: {
    icon: <Package size={11} />,
    label: '📦 WebContainer',
    color: 'var(--color-success)',
    description:
      'Local WebContainer sandbox is active. TypeScript, Biome lint, and Vitest run in your browser — no internet needed after first install.',
  },
  'cloud-mode': {
    icon: <Cloud size={11} />,
    label: '🌐 Cloud verify',
    color: 'var(--color-info)',
    description:
      "Your browser doesn't support local sandboxes (mobile / Firefox / no SharedArrayBuffer). Code verification happens via your GitHub CI / Vercel build instead. Slower, but works everywhere.",
  },
  skip: {
    icon: <AlertTriangle size={11} />,
    label: '⚠️ Skip verify',
    color: 'var(--color-warning)',
    description:
      'No CI detected on your repo and local sandbox is unavailable. The PR will open unverified — please review the changes manually before merging.',
  },
};

export function SandboxBadge({ mode }: SandboxBadgeProps) {
  const [open, setOpen] = useState(false);

  if (!mode) return null;

  const cfg = MODE_CONFIG[mode];
  if (!cfg) return null;

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`Sandbox mode: ${cfg.label}. Click for details.`}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-full)',
          color: cfg.color,
          padding: '3px 9px',
          fontSize: 11,
          fontWeight: 500,
          cursor: 'pointer',
        }}
      >
        {cfg.icon}
        <span>{cfg.label}</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Sandbox mode explanation"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            zIndex: 600,
            width: 280,
            background: 'var(--bg-surface-elevated)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-card)',
            boxShadow: 'var(--shadow-dropdown)',
            padding: '12px 14px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', flex: 1, lineHeight: 1.5 }}>
              {cfg.description}
            </p>
            <button
              onClick={() => setOpen(false)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-tertiary)',
                cursor: 'pointer',
                padding: 2,
                flexShrink: 0,
              }}
              aria-label="Close tooltip"
            >
              <X size={12} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
