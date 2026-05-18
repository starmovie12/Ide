/**
 * BrainPromptSlot — Part 4 §4.1
 *
 * Collapsible section above the prompt textarea where the user pastes
 * their Brain Prompt (project rules, voice, style guide). Default state
 * is collapsed — most prompts don't need to expand it. Tapping the
 * header expands the multi-line editor with a token counter.
 *
 * Token cap enforcement lives in `brainPromptValidator.ts`. This component
 * is a controlled wrapper around `useBrainPrompt()` from `brainPromptStore`.
 *
 * a11y:
 *   - header is a button with aria-expanded
 *   - editor is a labelled textarea
 *   - counter announces percentage to screen readers via aria-live="polite"
 *     when crossing the 80% threshold (only — silence under that to avoid spam)
 */

import { useId, useState } from 'react';
import { ChevronDown, ChevronUp, Brain } from 'lucide-react';
import { useBrainPrompt, useBrainPromptStore } from '@/lib/store/brainPromptStore';
import {
  MAX_BRAIN_PROMPT_TOKENS,
  statusFor,
  validateBrainPrompt,
} from '@/lib/forge/brainPromptValidator';

export function BrainPromptSlot() {
  const [expanded, setExpanded] = useState(false);
  const [value, setValue] = useBrainPrompt();
  const saveAsDefault = useBrainPromptStore((s) => s.saveAsDefault);

  const result = validateBrainPrompt(value);
  const status = statusFor(result);
  const editorId = useId();
  const counterId = useId();

  return (
    <div
      style={{
        background: 'var(--bg-surface-sunken)',
        border: '1px solid var(--border-subtle, rgba(255,255,255,0.06))',
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        aria-controls={editorId}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          minHeight: 36,
          padding: '8px 12px',
          background: 'transparent',
          border: 'none',
          color: 'var(--text-secondary)',
          fontSize: 12,
          fontWeight: 500,
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <Brain size={13} aria-hidden="true" />
        <span style={{ flex: 1 }}>Brain Prompt</span>
        {value.trim().length > 0 && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              padding: '2px 6px',
              borderRadius: 999,
              background: 'var(--bg-glass-island-active)',
              color: 'var(--color-primary)',
              letterSpacing: '0.02em',
            }}
            aria-hidden="true"
          >
            {result.tokens} tok
          </span>
        )}
        {expanded ? (
          <ChevronUp size={14} aria-hidden="true" />
        ) : (
          <ChevronDown size={14} aria-hidden="true" />
        )}
      </button>

      {expanded && (
        <div
          id={editorId}
          style={{
            padding: '0 12px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={
              "<project_context>\n  CROWD WORLD app. Next.js 15, Tailwind, Firebase.\n  Design tokens: Deep Navy bg, Electric Blue accent.\n  Floating Glass Island nav. Credits-only economy.\n</project_context>\n\n<coding_rules>\n  - TypeScript strict\n  - Design tokens only — no hex codes\n  - No solid blue bg (10% opacity max)\n</coding_rules>"
            }
            aria-describedby={counterId}
            aria-invalid={status === 'over'}
            spellCheck={false}
            style={{
              width: '100%',
              minHeight: 140,
              maxHeight: 280,
              resize: 'vertical',
              background: 'var(--bg-surface)',
              color: 'var(--text-primary)',
              border: '1px solid',
              borderColor:
                status === 'over'
                  ? 'var(--color-destructive)'
                  : status === 'warning'
                    ? 'var(--color-warning)'
                    : 'var(--border-subtle, rgba(255,255,255,0.08))',
              borderRadius: 10,
              padding: 10,
              fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
              fontSize: 12,
              lineHeight: '17px',
              outline: 'none',
              transition: 'border-color 150ms cubic-bezier(0.2, 0, 0, 1)',
            }}
          />

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 11,
            }}
          >
            <span
              id={counterId}
              aria-live={status !== 'healthy' ? 'polite' : 'off'}
              style={{
                color:
                  status === 'over'
                    ? 'var(--color-destructive)'
                    : status === 'warning'
                      ? 'var(--color-warning)'
                      : 'var(--text-tertiary)',
                fontVariantNumeric: 'tabular-nums',
                fontFamily: 'var(--font-mono, monospace)',
              }}
            >
              {result.tokens} / {MAX_BRAIN_PROMPT_TOKENS} tokens
              {status === 'over' && ' — over cap'}
            </span>
            <span style={{ flex: 1 }} />
            <button
              type="button"
              onClick={() => setValue('')}
              disabled={value.length === 0}
              style={{
                minHeight: 28,
                padding: '0 10px',
                background: 'transparent',
                border: '1px solid var(--border-subtle, rgba(255,255,255,0.08))',
                borderRadius: 8,
                color: 'var(--text-tertiary)',
                fontSize: 11,
                fontWeight: 500,
                cursor: value.length === 0 ? 'not-allowed' : 'pointer',
                opacity: value.length === 0 ? 0.5 : 1,
              }}
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => saveAsDefault(value)}
              disabled={status === 'over' || value.trim().length === 0}
              style={{
                minHeight: 28,
                padding: '0 10px',
                background:
                  status === 'over' ? 'transparent' : 'var(--color-primary-subtle)',
                border: '1px solid',
                borderColor:
                  status === 'over'
                    ? 'var(--border-subtle, rgba(255,255,255,0.08))'
                    : 'var(--color-primary)',
                borderRadius: 8,
                color:
                  status === 'over' ? 'var(--text-disabled, var(--text-tertiary))' : 'var(--color-primary)',
                fontSize: 11,
                fontWeight: 600,
                cursor:
                  status === 'over' || value.trim().length === 0 ? 'not-allowed' : 'pointer',
                opacity: status === 'over' || value.trim().length === 0 ? 0.55 : 1,
              }}
            >
              Save as default
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
