/**
 * ForgeChatStream — Part 4 §1.7
 *
 * The middle column of Focus Forge — the chat itself. Renders turns
 * minimally: User message → Ustaad bubble. No agent transitions, no
 * Manager→Coder→Reviewer animations, no "API call N of M".
 *
 * Phase 5.10.B note: The actual UstaadBubble (Part 3 §10) is not yet
 * in the codebase. For now this stream renders the existing
 * `ChatMessage`s from chatStore using a minimal style. When Phase 5.10.H
 * lands and wires the Continuum orchestrator, this file should swap in
 * the proper UstaadBubble component without changing the parent layout.
 */

import { useEffect, useRef } from 'react';
import { useChatStore, type ChatMessage } from '@/lib/store/chatStore';
import { UserMessageMinimal } from './UserMessageMinimal';
import { EmptyStateHint } from './EmptyStateHint';

export function ForgeChatStream() {
  const activeChatId = useChatStore((s) => s.activeChatId);
  const messages = useChatStore((s) =>
    activeChatId ? s.messagesByChat[activeChatId] ?? [] : [],
  );
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const lastMessageId = messages[messages.length - 1]?.id;

  // Auto-scroll to bottom on new message. Smooth on small jumps;
  // we don't fight the user if they've scrolled up to read earlier turns.
  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const nearBottom = node.scrollHeight - node.scrollTop - node.clientHeight < 200;
    if (nearBottom) {
      node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' });
    }
  }, [lastMessageId]);

  if (messages.length === 0) {
    return (
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <EmptyStateHint />
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: '12px 16px 8px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
      role="log"
      aria-live="polite"
      aria-label="Focus Forge conversation"
    >
      {messages.map((m) => (
        <MessageRow key={m.id} message={m} />
      ))}
    </div>
  );
}

/* ─── per-message renderer ──────────────────────────────────────────── */

function MessageRow({ message }: { message: ChatMessage }) {
  if (message.role === 'user') {
    return (
      <UserMessageMinimal timestamp={message.timestamp}>{message.content}</UserMessageMinimal>
    );
  }

  // System and agent (Ustaad) — render as a single left-aligned bubble.
  // Phase 5.10.H will replace this with proper UstaadBubble + FileTheater
  // artifact references. For now we render plain content so the shell is
  // not blocked on orchestrator delivery.
  const isStreaming = message.isStreaming === true;
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'flex-start',
        padding: '6px 0',
      }}
    >
      <div
        style={{
          maxWidth: '92%',
          padding: '10px 14px',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle, rgba(255,255,255,0.06))',
          borderRadius: 18,
          borderBottomLeftRadius: 6,
          color: 'var(--text-primary)',
          fontSize: 14,
          lineHeight: '20px',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--color-primary)',
            marginBottom: 6,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span aria-hidden="true">🪶</span>
          <span>Ustaad</span>
          {isStreaming && (
            <span
              aria-label="streaming"
              style={{
                width: 6,
                height: 6,
                borderRadius: 999,
                background: 'var(--color-primary)',
                animation: 'forge-pulse 1500ms cubic-bezier(0.2, 0, 0, 1) infinite',
              }}
            />
          )}
        </div>
        <div>{message.content || (isStreaming ? '…' : '')}</div>
      </div>
    </div>
  );
}
