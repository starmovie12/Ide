import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface UserMessageProps {
  content: string;
  timestamp?: number;
  attachments?: string[];
}

const COLLAPSE_THRESHOLD = 300;

export function UserMessage({ content, timestamp, attachments }: UserMessageProps) {
  const [expanded, setExpanded] = useState(content.length <= COLLAPSE_THRESHOLD);
  const isLong = content.length > COLLAPSE_THRESHOLD;

  const displayContent = isLong && !expanded
    ? content.slice(0, COLLAPSE_THRESHOLD) + '…'
    : content;

  return (
    <div
      data-testid="user-message"
      style={{
        display: 'flex',
        justifyContent: 'flex-end',
        animation: 'agent-enter 200ms var(--ease-glass)',
      }}
    >
      <div style={{ maxWidth: '80%', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {/* Attachments */}
        {attachments && attachments.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end' }}>
            {attachments.map((file, i) => (
              <div
                key={i}
                style={{
                  background: 'var(--bg-surface-elevated)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 8,
                  padding: '4px 10px',
                  fontSize: 12,
                  color: 'var(--text-secondary)',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                📎 {file}
              </div>
            ))}
          </div>
        )}

        {/* Message bubble */}
        <div
          style={{
            background: 'var(--color-primary-subtle)',
            border: '1px solid var(--border-accent)',
            borderRadius: 'var(--radius-lg) var(--radius-lg) var(--radius-xs) var(--radius-lg)',
            padding: '10px 14px',
            fontSize: 14,
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-body)',
            lineHeight: 1.6,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {displayContent}

          {isLong && (
            <button
              onClick={() => setExpanded((p) => !p)}
              className="flex items-center gap-1 mt-2 transition-colors hover:text-[var(--color-primary)]"
              style={{
                border: 'none',
                background: 'none',
                color: 'var(--text-tertiary)',
                fontSize: 12,
                cursor: 'pointer',
                fontFamily: 'var(--font-body)',
                padding: 0,
              }}
            >
              {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              {expanded ? 'Show less' : 'Read more'}
            </button>
          )}
        </div>

        {/* Timestamp */}
        {timestamp && (
          <span style={{ fontSize: 11, color: 'var(--text-quaternary)', textAlign: 'right', fontFamily: 'var(--font-numeric)' }}>
            {new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>
    </div>
  );
}
