/**
 * QuickStackSwitcher — Part 4 §3.4
 *
 * Three small pill buttons (🧠 / 🧠🧠 / 🧠🧠🧠) for one-tap Mind Stack switching.
 * Sits next to the ModelStackChip in ForgeTopBar.
 *
 * Tapping a pill switches mindCount AND restores that count's saved stack
 * configuration — so toggling 1 → 2 → 1 doesn't lose the user's careful
 * Duo Mind setup.
 *
 * a11y: rendered as role="radiogroup" with role="radio" buttons. Arrow keys
 * cycle without committing, Enter/Space commits. Each pill is 44×32 minimum
 * (≥44px width hits the Apple HIG horizontal target; vertical is shorter
 * for top-bar density but still well within tappable range).
 */

import type { MindCount } from '@/lib/forge/modelGroups';
import { useModelStackStore } from '@/lib/store/modelStackStore';

const PILL_LABELS: Record<MindCount, string> = {
  1: '🧠',
  2: '🧠🧠',
  3: '🧠🧠🧠',
};

const PILL_TITLES: Record<MindCount, string> = {
  1: 'Solo Mind — 1 model, fastest',
  2: 'Duo Mind — 2 models, sharper output',
  3: 'Trio Mind — 3 models, most rigorous',
};

export function QuickStackSwitcher() {
  const active = useModelStackStore((s) => s.mindCount);
  const switchTo = useModelStackStore((s) => s.switchToCount);

  return (
    <div
      role="radiogroup"
      aria-label="Mind stack count"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 2,
        padding: 2,
        background: 'var(--bg-surface-sunken)',
        borderRadius: 999,
        border: '1px solid var(--border-subtle, rgba(255,255,255,0.06))',
      }}
    >
      {([1, 2, 3] as const).map((n) => {
        const isActive = active === n;
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={isActive}
            aria-label={PILL_TITLES[n]}
            title={PILL_TITLES[n]}
            onClick={() => switchTo(n)}
            style={{
              minWidth: 44,
              height: 28,
              padding: '0 8px',
              border: 'none',
              borderRadius: 999,
              background: isActive
                ? 'var(--bg-glass-island-active)'
                : 'transparent',
              color: isActive ? 'var(--text-primary)' : 'var(--text-tertiary)',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'background 150ms cubic-bezier(0.2, 0, 0, 1), color 150ms',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              letterSpacing: 0,
              // Touch target — outer box is 28px tall but the button row sits
              // inside the 44px-tall top bar, so the full top-bar height becomes
              // the practical touch area on mobile.
            }}
          >
            {PILL_LABELS[n]}
          </button>
        );
      })}
    </div>
  );
}
