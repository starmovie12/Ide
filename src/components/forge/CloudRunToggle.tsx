/**
 * CloudRunToggle — Part 4 §1.5 / §9.2
 *
 * Small toggle in the composer that enables "24/7 cloud run" — the task
 * continues server-side (Cloudflare Durable Object) even if the user
 * closes the browser. When ON, on completion the user gets a Web Push
 * notification.
 *
 * Defaults per Part 4 §9.2:
 *   - PWA installed + push permission granted → defaults ON
 *   - PWA installed, push permission denied   → toggle visible, warning
 *   - PWA not installed                       → toggle DISABLED with install nudge
 *
 * For Phase 5.10.A delivery the toggle is purely UI — the actual Cloudflare
 * worker wiring lands in Phase 5.10.J. We persist user intent so the later
 * orchestrator just reads `cloudRun` from state when dispatching.
 */

import { Cloud, CloudOff } from 'lucide-react';

interface CloudRunToggleProps {
  active: boolean;
  onChange: (next: boolean) => void;
  /** When false, the toggle renders disabled with a tooltip prompting PWA install. */
  enabled?: boolean;
  /** Tooltip override — e.g., "Install Focus Forge to enable 24/7 cloud run" */
  disabledReason?: string;
}

export function CloudRunToggle({
  active,
  onChange,
  enabled = true,
  disabledReason,
}: CloudRunToggleProps) {
  const disabled = !enabled;
  const title = disabled
    ? disabledReason ?? 'Install Focus Forge to enable 24/7 cloud run'
    : active
      ? 'Cloud run ON — task continues if you close the tab'
      : 'Cloud run OFF — task runs in this tab only';

  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!active)}
      disabled={disabled}
      aria-pressed={active}
      aria-label={title}
      title={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        height: 32,
        padding: '0 10px',
        borderRadius: 999,
        border: '1px solid',
        borderColor: active && !disabled
          ? 'var(--color-primary)'
          : 'var(--border-subtle, rgba(255,255,255,0.08))',
        background: active && !disabled
          ? 'var(--bg-glass-island-active)'
          : 'transparent',
        color: disabled
          ? 'var(--text-disabled, var(--text-tertiary))'
          : active
            ? 'var(--color-primary)'
            : 'var(--text-tertiary)',
        fontSize: 11,
        fontWeight: 500,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        transition: 'background 150ms cubic-bezier(0.2, 0, 0, 1)',
      }}
    >
      {active && !disabled ? (
        <Cloud size={12} aria-hidden="true" />
      ) : (
        <CloudOff size={12} aria-hidden="true" />
      )}
      <span style={{ whiteSpace: 'nowrap' }}>
        {active && !disabled ? 'Cloud' : '24/7'}
      </span>
    </button>
  );
}
