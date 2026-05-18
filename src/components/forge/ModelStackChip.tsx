/**
 * ModelStackChip — Part 4 §3.1
 *
 * The top-bar chip that summarizes the user's active Mind Stack.
 * Tapping opens the ModelStackSheet for detailed picking.
 *
 * Three visual modes:
 *   1 mind  →  "🧠 Gemini 3 Flash ▾"
 *   2 minds →  "🧠🧠 Gemini + Claude ▾"
 *   3 minds →  "🧠🧠🧠 Tri-stack ▾"
 *
 * Width capped so the chip doesn't push the top bar into overflow on 380px.
 * Full stack name accessible via aria-label and title.
 */

import { ChevronDown } from 'lucide-react';
import { useModelStackStore } from '@/lib/store/modelStackStore';
import { lookupModel, type Mind } from '@/lib/forge/modelGroups';

interface ModelStackChipProps {
  onClick: () => void;
}

/** Compact label for desktop: "Gemini + Claude" (use first words of each display name). */
function compactStackLabel(stack: Mind[]): string {
  if (stack.length === 0) return '—';
  if (stack.length === 1) {
    const m = lookupModel(stack[0]);
    return m ? m.display : 'Solo';
  }
  // Multi-mind: pull first word of each provider's display, joined by +
  const tokens = stack.map((mind) => {
    const m = lookupModel(mind);
    if (!m) return '?';
    // First whitespace-separated word ("Gemini", "DeepSeek", "Claude")
    return m.display.split(/\s+/)[0];
  });
  return tokens.join(' + ');
}

/** Even shorter label for very narrow viewports: "Tri" / "Duo" / "Solo" */
function ultraCompactLabel(stack: Mind[]): string {
  if (stack.length === 3) return 'Tri';
  if (stack.length === 2) return 'Duo';
  return 'Solo';
}

export function ModelStackChip({ onClick }: ModelStackChipProps) {
  const activeStack = useModelStackStore((s) => s.activeStack);
  const mindCount = useModelStackStore((s) => s.mindCount);

  const compact = compactStackLabel(activeStack);
  const ultra = ultraCompactLabel(activeStack);
  const brains = '🧠'.repeat(mindCount);

  const fullLabel = activeStack
    .map((m) => lookupModel(m)?.display ?? `${m.provider}/${m.model}`)
    .join(', ');

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Mind stack: ${fullLabel}. Tap to change.`}
      title={fullLabel}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        height: 32,
        padding: '0 10px 0 8px',
        borderRadius: 999,
        border: '1px solid var(--border-subtle, rgba(255,255,255,0.08))',
        background: 'var(--bg-surface-elevated)',
        color: 'var(--text-primary)',
        fontSize: 12,
        fontWeight: 500,
        cursor: 'pointer',
        transition: 'background 150ms cubic-bezier(0.2, 0, 0, 1)',
        maxWidth: 240,
        overflow: 'hidden',
      }}
    >
      <span aria-hidden="true" style={{ fontSize: 11, lineHeight: 1 }}>
        {brains}
      </span>
      <span
        style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          minWidth: 0,
        }}
      >
        {/* Show compact on roomy screens; CSS would do this better but we keep */}
        {/* the component framework-agnostic — the parent top bar handles overflow */}
        {/* by max-width-clipping anyway. */}
        <span className="forge-chip-compact">{compact}</span>
        <span className="forge-chip-ultra" style={{ display: 'none' }}>
          {ultra}
        </span>
      </span>
      <ChevronDown size={12} aria-hidden="true" style={{ flexShrink: 0 }} />
    </button>
  );
}
