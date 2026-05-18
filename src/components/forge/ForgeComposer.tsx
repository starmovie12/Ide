/**
 * ForgeComposer — Part 4 §1.5
 *
 * The sticky-bottom composer for Focus Forge. STRICTLY minimal:
 *   - Collapsible Brain Prompt slot above the textarea
 *   - Plain prompt textarea (auto-grows)
 *   - Attach button (single image for v1)
 *   - Cloud Run toggle (24/7 background execution)
 *   - Send button
 *
 * Notably ABSENT (vs legacy `ChatFooter.tsx`):
 *   - Agent multi-select chip
 *   - Send mode picker (pipeline / broadcast / all-agents)
 *   - Routing picker
 *   - Sub-agent delegation chips
 *
 * For Phase 5.10.B delivery the Send button collects the request and
 * surfaces it through the `onSend` prop. Phase 5.10.H wires this to the
 * Continuum + Duo Mind orchestrator. Until then, callers can stub the
 * handler — the composer UI works end-to-end without the orchestrator.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Paperclip, SendHorizonal } from 'lucide-react';
import { BrainPromptSlot } from './BrainPromptSlot';
import { CloudRunToggle } from './CloudRunToggle';
import { useBlueprintStore } from '@/lib/store/blueprintStore';
import { useChatStore } from '@/lib/store/chatStore';
import { useModelStackStore } from '@/lib/store/modelStackStore';
import { useBrainPromptStore } from '@/lib/store/brainPromptStore';
import type { Mind } from '@/lib/forge/modelGroups';

export interface ForgeSendRequest {
  prompt: string;
  brainPrompt: string;
  mindStack: Mind[];
  cloudRun: boolean;
  attachment: File | null;
}

interface ForgeComposerProps {
  onSend: (req: ForgeSendRequest) => void;
}

const MIN_TEXTAREA_HEIGHT = 44;
const MAX_TEXTAREA_HEIGHT = 220;

export function ForgeComposer({ onSend }: ForgeComposerProps) {
  const [prompt, setPrompt] = useState('');
  const [cloudRun, setCloudRun] = useState(false);
  const [attachment, setAttachment] = useState<File | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const activeChatId = useChatStore((s) => s.activeChatId);
  const repoConnection = useBlueprintStore((s) =>
    activeChatId ? s.repoConnections[activeChatId] ?? null : null,
  );
  const mindStack = useModelStackStore((s) => s.activeStack);
  const getBrainPrompt = useBrainPromptStore((s) => s.getForChat);

  const canSend = prompt.trim().length > 0 && mindStack.length > 0;

  /* ─── auto-grow textarea ─────────────────────────────────────────── */
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    const next = Math.min(Math.max(ta.scrollHeight, MIN_TEXTAREA_HEIGHT), MAX_TEXTAREA_HEIGHT);
    ta.style.height = `${next}px`;
  }, [prompt]);

  const handleSend = useCallback(() => {
    if (!canSend) return;
    const brain = getBrainPrompt(activeChatId);
    onSend({
      prompt: prompt.trim(),
      brainPrompt: brain,
      mindStack: mindStack.map((m) => ({ ...m })),
      cloudRun,
      attachment,
    });
    // Reset prompt + attachment, retain Brain Prompt (it's per-chat / per-default)
    setPrompt('');
    setAttachment(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [canSend, getBrainPrompt, activeChatId, onSend, prompt, mindStack, cloudRun, attachment]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Enter sends; Shift+Enter inserts a newline (standard chat UX).
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleAttach = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setAttachment(file);
  }, []);

  // For Phase 5.10.A delivery, we treat CloudRunToggle as "enabled" — actual
  // PWA-install detection lands in Phase 5.10.J. The toggle persists user intent
  // so when 5.10.J ships, the value is already there.
  const cloudRunEnabled = true;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: '10px 14px calc(10px + env(safe-area-inset-bottom, 0))',
        background: 'var(--bg-surface-elevated)',
        borderTop: '1px solid var(--border-subtle, rgba(255,255,255,0.06))',
      }}
    >
      <BrainPromptSlot />

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          padding: 10,
          background: 'var(--bg-surface-sunken)',
          border: '1px solid var(--border-subtle, rgba(255,255,255,0.06))',
          borderRadius: 14,
        }}
      >
        {attachment && (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 10px',
              background: 'var(--bg-glass-island-active)',
              borderRadius: 999,
              fontSize: 11,
              color: 'var(--color-primary)',
              alignSelf: 'flex-start',
              maxWidth: '100%',
            }}
          >
            <Paperclip size={11} aria-hidden="true" />
            <span
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: 200,
              }}
            >
              {attachment.name}
            </span>
            <button
              type="button"
              onClick={() => setAttachment(null)}
              aria-label="Remove attachment"
              style={{
                marginLeft: 4,
                width: 18,
                height: 18,
                background: 'transparent',
                border: 'none',
                color: 'var(--color-primary)',
                cursor: 'pointer',
                lineHeight: 1,
                fontSize: 14,
              }}
            >
              ×
            </button>
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            repoConnection
              ? `Apna kaam likho... e.g., 'src/pages/Home.tsx me model picker chip add karo'`
              : 'Connect a repo to start, then describe what you want to build...'
          }
          rows={1}
          aria-label="Prompt"
          style={{
            width: '100%',
            minHeight: MIN_TEXTAREA_HEIGHT,
            maxHeight: MAX_TEXTAREA_HEIGHT,
            resize: 'none',
            background: 'transparent',
            color: 'var(--text-primary)',
            border: 'none',
            outline: 'none',
            fontSize: 14,
            lineHeight: '20px',
            fontFamily: 'inherit',
            padding: 0,
          }}
        />

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Attach an image"
            title="Attach an image"
            style={{
              width: 36,
              height: 36,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'transparent',
              border: '1px solid var(--border-subtle, rgba(255,255,255,0.08))',
              borderRadius: 999,
              color: 'var(--text-tertiary)',
              cursor: 'pointer',
            }}
          >
            <Paperclip size={14} aria-hidden="true" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleAttach}
            style={{ display: 'none' }}
            aria-hidden="true"
          />

          <span style={{ flex: 1 }} />

          <CloudRunToggle
            active={cloudRun}
            onChange={setCloudRun}
            enabled={cloudRunEnabled}
          />

          <button
            type="button"
            onClick={handleSend}
            disabled={!canSend}
            aria-label="Send prompt"
            title={canSend ? 'Send (Enter)' : 'Type a prompt to enable Send'}
            style={{
              minWidth: 44,
              minHeight: 36,
              padding: '0 12px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              background: canSend ? 'var(--color-primary)' : 'var(--bg-surface)',
              color: canSend
                ? 'var(--text-on-primary, #fff)'
                : 'var(--text-disabled, var(--text-tertiary))',
              border: '1px solid',
              borderColor: canSend
                ? 'var(--color-primary)'
                : 'var(--border-subtle, rgba(255,255,255,0.08))',
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 600,
              cursor: canSend ? 'pointer' : 'not-allowed',
              opacity: canSend ? 1 : 0.6,
              transition: 'background 150ms cubic-bezier(0.2, 0, 0, 1)',
            }}
          >
            <SendHorizonal size={13} aria-hidden="true" />
            <span>Send</span>
          </button>
        </div>
      </div>
    </div>
  );
}
