/**
 * ForgeStatusBar — Part 4 §6.3
 *
 * Small, unobtrusive bar above the composer that surfaces orchestrator
 * progress: which operation we're on, how many minds are working,
 * estimated time remaining.
 *
 * Stays subtle — this is the ONLY place in Focus Forge where "3 minds"
 * appears, and only as a count, not as a process explanation. Per Part 4
 * §6.3 the user sees "🧠×3 · Operation 14 of ~30 · Round 2/3 · ETA 1m 20s"
 * without ever seeing the individual model names or transitions.
 *
 * For Phase 5.10.B the bar is wired to local placeholder state. When the
 * orchestrator (Phase 5.10.H) lands, it should expose a `forgeProgressStore`
 * that this component subscribes to. Today we render nothing when there's
 * no active operation, so the bar collapses to zero height.
 */

import { useModelStackStore } from '@/lib/store/modelStackStore';

interface ForgeStatusBarProps {
  /** Optional: current op index (1-based). When undefined, status bar hides. */
  currentOp?: number;
  /** Optional: rough total ops (orchestrator estimates this from brain tape). */
  totalOps?: number;
  /** Optional: which round of Duo/Trio Mind we're in (1, 2, 3). */
  round?: 1 | 2 | 3;
  /** Optional: ETA seconds remaining. */
  etaSec?: number;
}

export function ForgeStatusBar({ currentOp, totalOps, round, etaSec }: ForgeStatusBarProps) {
  const mindCount = useModelStackStore((s) => s.mindCount);
  const active = currentOp !== undefined;

  // Render nothing when idle so the bar has zero footprint at rest.
  if (!active) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '6px 16px',
        minHeight: 28,
        background: 'var(--bg-surface-sunken)',
        borderTop: '1px solid var(--border-subtle, rgba(255,255,255,0.04))',
        fontSize: 11,
        color: 'var(--text-tertiary)',
        fontFamily: 'var(--font-mono, monospace)',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      <span aria-hidden="true">{'🧠'.repeat(mindCount)}</span>
      {currentOp !== undefined && (
        <span>
          Op {currentOp}
          {totalOps !== undefined ? ` of ~${totalOps}` : ''}
        </span>
      )}
      {round !== undefined && <span>· Round {round}/3</span>}
      {etaSec !== undefined && <span>· ETA {formatEta(etaSec)}</span>}
    </div>
  );
}

function formatEta(sec: number): string {
  if (sec < 60) return `${Math.round(sec)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec - m * 60);
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}
