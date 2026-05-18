/**
 * ModelStackSheet — Part 4 §3.1
 *
 * Bottom-sheet (mobile) / popover (desktop) where the user composes a
 * Mind Stack. Built on top of vaul's Drawer (already in package.json).
 *
 * UI flow:
 *   1. Three tabs: Solo / Duo / Trio
 *   2. Each tab shows N model dropdowns + (for Duo) synthesis bias selector
 *   3. Real-time quota indicators per provider (placeholder dots for now —
 *      Phase 5.10.C wires actual quota from apiKeyStore)
 *   4. "Apply" commits the stack and closes the sheet
 *   5. "Save as default" persists this arrangement as the saved stack for
 *      that mind count (restored by QuickStackSwitcher)
 */

import { useEffect, useState } from 'react';
import { Drawer } from 'vaul';
import { Check, X } from 'lucide-react';
import {
  FORGE_MODEL_GROUPS,
  ALL_FORGE_MODELS,
  type Mind,
  type MindCount,
  type ProviderId,
} from '@/lib/forge/modelGroups';
import { useModelStackStore, type SynthesisBias } from '@/lib/store/modelStackStore';

interface ModelStackSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ModelStackSheet({ open, onOpenChange }: ModelStackSheetProps) {
  const activeStack = useModelStackStore((s) => s.activeStack);
  const mindCount = useModelStackStore((s) => s.mindCount);
  const synthesisBias = useModelStackStore((s) => s.synthesisBias);
  const setStack = useModelStackStore((s) => s.setStack);
  const setSavedStack = useModelStackStore((s) => s.setSavedStack);
  const setSynthesisBias = useModelStackStore((s) => s.setSynthesisBias);

  // Local working copy of the stack — only commits to store on "Apply".
  // This prevents jitter if the user tweaks then cancels.
  const [draftCount, setDraftCount] = useState<MindCount>(mindCount);
  const [draftStack, setDraftStack] = useState<Mind[]>(activeStack);
  const [draftBias, setDraftBias] = useState<SynthesisBias>(synthesisBias);

  // Re-sync draft from store every time sheet opens.
  useEffect(() => {
    if (open) {
      setDraftCount(mindCount);
      setDraftStack(activeStack.map((m) => ({ ...m })));
      setDraftBias(synthesisBias);
    }
  }, [open, mindCount, activeStack, synthesisBias]);

  function setDraftMind(index: number, mind: Mind) {
    setDraftStack((prev) => {
      const next = prev.map((m) => ({ ...m }));
      next[index] = mind;
      return next;
    });
  }

  function changeDraftCount(n: MindCount) {
    setDraftCount(n);
    // Trim or pad draft stack to match the new count. We keep existing picks
    // where possible so user doesn't lose their Gemini selection when going
    // 1→2→3.
    setDraftStack((prev) => {
      const cur = prev.map((m) => ({ ...m }));
      if (cur.length === n) return cur;
      if (cur.length > n) return cur.slice(0, n);
      // pad — fall back to first available model per provider
      while (cur.length < n) {
        const used = new Set(cur.map((m) => m.provider));
        const next = ALL_FORGE_MODELS.find((m) => !used.has(m.provider));
        if (next) {
          cur.push({ provider: next.provider, model: next.id });
        } else {
          // Re-use Gemini if every provider is already used
          cur.push({ provider: 'gemini', model: 'gemini-3-flash-preview' });
        }
      }
      return cur;
    });
  }

  function apply() {
    setStack(draftStack);
    if (draftCount === 2) setSynthesisBias(draftBias);
    onOpenChange(false);
  }

  function saveAsDefault() {
    setSavedStack(draftCount, draftStack);
    apply();
  }

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay
          style={{
            position: 'fixed',
            inset: 0,
            background: 'var(--overlay-scrim, rgba(0,0,0,0.55))',
            zIndex: 'var(--z-modal, 400)',
          }}
        />
        <Drawer.Content
          aria-labelledby="model-stack-sheet-title"
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 'var(--z-modal, 400)',
            background: 'var(--bg-surface-elevated)',
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            border: '1px solid var(--border-subtle, rgba(255,255,255,0.06))',
            borderBottom: 'none',
            maxHeight: '85vh',
            display: 'flex',
            flexDirection: 'column',
            paddingBottom: 'env(safe-area-inset-bottom, 0)',
          }}
        >
          {/* drag handle */}
          <div
            style={{
              width: 36,
              height: 4,
              background: 'var(--text-tertiary)',
              opacity: 0.4,
              borderRadius: 2,
              margin: '8px auto 0',
            }}
            aria-hidden="true"
          />

          <header
            style={{
              padding: '16px 20px 12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Drawer.Title asChild>
              <h2
                id="model-stack-sheet-title"
                style={{
                  margin: 0,
                  fontSize: 17,
                  fontWeight: 700,
                  fontFamily: 'var(--font-display, "Syne", sans-serif)',
                  color: 'var(--text-primary)',
                }}
              >
                Pick your Mind Stack
              </h2>
            </Drawer.Title>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label="Close mind stack picker"
              style={{
                width: 44,
                height: 44,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: 'none',
                background: 'transparent',
                color: 'var(--text-tertiary)',
                cursor: 'pointer',
                borderRadius: 999,
              }}
            >
              <X size={18} />
            </button>
          </header>

          <div
            style={{
              padding: '0 20px',
              overflowY: 'auto',
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
          >
            {/* count selector */}
            <CountTabs value={draftCount} onChange={changeDraftCount} />

            {/* per-mind dropdowns */}
            <section
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
              aria-label="Models in this stack"
            >
              {draftStack.map((mind, idx) => (
                <MindRow
                  key={idx}
                  index={idx}
                  mind={mind}
                  onChange={(m) => setDraftMind(idx, m)}
                />
              ))}
            </section>

            {/* synthesis bias — only for Duo */}
            {draftCount === 2 && (
              <SynthesisBiasPicker value={draftBias} onChange={setDraftBias} />
            )}

            {/* cost note */}
            {draftCount === 3 && (
              <p
                style={{
                  margin: 0,
                  padding: 10,
                  fontSize: 12,
                  color: 'var(--color-warning)',
                  background: 'var(--color-warning-subtle)',
                  borderRadius: 8,
                  border: '1px solid var(--color-warning-subtle)',
                }}
                role="note"
              >
                ⚠ Trio Mind uses ~5× the tokens of Solo. Use it for high-stakes refactors.
              </p>
            )}
          </div>

          <footer
            style={{
              display: 'flex',
              gap: 8,
              padding: '12px 20px 16px',
              borderTop: '1px solid var(--border-subtle, rgba(255,255,255,0.06))',
              background: 'var(--bg-surface-elevated)',
            }}
          >
            <button
              type="button"
              onClick={saveAsDefault}
              style={{
                flex: 1,
                minHeight: 44,
                padding: '0 14px',
                background: 'transparent',
                border: '1px solid var(--border-subtle, rgba(255,255,255,0.10))',
                color: 'var(--text-secondary)',
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Save as default
            </button>
            <button
              type="button"
              onClick={apply}
              style={{
                flex: 1,
                minHeight: 44,
                padding: '0 14px',
                background: 'var(--color-primary)',
                border: '1px solid var(--color-primary)',
                color: 'var(--text-on-primary, #fff)',
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              <Check size={14} aria-hidden="true" />
              Apply
            </button>
          </footer>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

/* ─── sub-components ─────────────────────────────────────────────────── */

function CountTabs({
  value,
  onChange,
}: {
  value: MindCount;
  onChange: (n: MindCount) => void;
}) {
  const labels: Record<MindCount, { brains: string; name: string; sub: string }> = {
    1: { brains: '🧠', name: 'Solo', sub: '1 model — fastest' },
    2: { brains: '🧠🧠', name: 'Duo', sub: '2 models — sharper' },
    3: { brains: '🧠🧠🧠', name: 'Trio', sub: '3 models — rigorous' },
  };

  return (
    <div
      role="radiogroup"
      aria-label="Number of minds"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 8,
      }}
    >
      {([1, 2, 3] as const).map((n) => {
        const active = value === n;
        const l = labels[n];
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(n)}
            style={{
              minHeight: 64,
              padding: 8,
              border: '1px solid',
              borderColor: active ? 'var(--color-primary)' : 'var(--border-subtle, rgba(255,255,255,0.08))',
              background: active ? 'var(--bg-glass-island-active)' : 'var(--bg-surface)',
              borderRadius: 12,
              cursor: 'pointer',
              color: 'var(--text-primary)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
              transition: 'background 150ms cubic-bezier(0.2, 0, 0, 1)',
            }}
          >
            <span style={{ fontSize: 13, lineHeight: 1 }}>{l.brains}</span>
            <span style={{ fontSize: 12, fontWeight: 600 }}>{l.name}</span>
            <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{l.sub}</span>
          </button>
        );
      })}
    </div>
  );
}

function MindRow({
  index,
  mind,
  onChange,
}: {
  index: number;
  mind: Mind;
  onChange: (m: Mind) => void;
}) {
  // Build flat list of (provider, model) options for the select.
  const options = ALL_FORGE_MODELS;
  const selectedValue = `${mind.provider}::${mind.model}`;
  const letter = String.fromCharCode(65 + index); // A, B, C

  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: 10,
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle, rgba(255,255,255,0.06))',
        borderRadius: 10,
      }}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: 'var(--text-tertiary)',
          width: 24,
          textAlign: 'center',
          flexShrink: 0,
        }}
        aria-hidden="true"
      >
        Mind {letter}
      </span>
      <select
        value={selectedValue}
        onChange={(e) => {
          const [provider, model] = e.target.value.split('::') as [ProviderId, string];
          onChange({ provider, model });
        }}
        aria-label={`Mind ${letter} model`}
        style={{
          flex: 1,
          minHeight: 36,
          padding: '0 8px',
          background: 'var(--bg-surface-elevated)',
          color: 'var(--text-primary)',
          border: '1px solid var(--border-subtle, rgba(255,255,255,0.08))',
          borderRadius: 8,
          fontSize: 13,
          fontFamily: 'inherit',
          minWidth: 0,
        }}
      >
        {Object.entries(FORGE_MODEL_GROUPS).map(([providerKey, models]) => (
          <optgroup key={providerKey} label={providerKey}>
            {models.map((m) => (
              <option key={m.id} value={`${m.provider}::${m.id}`}>
                {m.display} {m.tier !== 'free' ? `· ${m.tier}` : ''}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}

function SynthesisBiasPicker({
  value,
  onChange,
}: {
  value: SynthesisBias;
  onChange: (b: SynthesisBias) => void;
}) {
  const opts: ReadonlyArray<{ key: SynthesisBias; label: string }> = [
    { key: 'auto', label: 'Auto' },
    { key: 'coding', label: 'Coding' },
    { key: 'prose', label: 'Prose' },
  ];
  return (
    <section
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: 10,
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle, rgba(255,255,255,0.06))',
        borderRadius: 10,
      }}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--text-tertiary)',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}
      >
        Synthesis bias
      </span>
      <div role="radiogroup" aria-label="Synthesis bias" style={{ display: 'flex', gap: 6 }}>
        {opts.map((o) => {
          const active = value === o.key;
          return (
            <button
              key={o.key}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(o.key)}
              style={{
                flex: 1,
                minHeight: 36,
                padding: '0 10px',
                background: active ? 'var(--bg-glass-island-active)' : 'transparent',
                border: '1px solid',
                borderColor: active ? 'var(--color-primary)' : 'var(--border-subtle, rgba(255,255,255,0.08))',
                borderRadius: 8,
                color: 'var(--text-primary)',
                fontSize: 12,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}
