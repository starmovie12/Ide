import { useMemo } from 'react';
import { GitMerge } from 'lucide-react';
import { StreamingCursor } from './StreamingCursor';
import { hasDiffBlocks, countDiffBlocks } from '@/lib/diff/parser';
import { useDiffStore } from '@/lib/store/diffStore';

const AGENT_COLORS = [
  'var(--text-agent-1)',
  'var(--text-agent-2)',
  'var(--text-agent-3)',
  'var(--text-agent-4)',
  'var(--text-agent-5)',
];

interface AgentMessageProps {
  agentName: string;
  agentEmoji: string;
  agentColorIndex?: number;
  content: string;
  isStreaming?: boolean;
  timestamp?: number;
  hasDiff?: boolean;
  onViewDiff?: () => void;
}

export function AgentMessage({
  agentName,
  agentEmoji,
  agentColorIndex = 0,
  content,
  isStreaming = false,
  timestamp,
  hasDiff: hasDiffProp = false,
  onViewDiff,
}: AgentMessageProps) {
  const color = AGENT_COLORS[agentColorIndex % AGENT_COLORS.length];
  const { pendingDiffs } = useDiffStore();

  const containsDiffBlocks = useMemo(() => !isStreaming && hasDiffBlocks(content), [content, isStreaming]);
  const diffCount = useMemo(() => (containsDiffBlocks ? countDiffBlocks(content) : 0), [content, containsDiffBlocks]);

  const hasStagedDiffs = pendingDiffs.some((d) => d.agentName === agentName);
  const showDiffBadge = hasDiffProp || containsDiffBlocks || hasStagedDiffs;

  const renderedContent = useMemo(() => {
    if (isStreaming) return content;
    return renderContent(content);
  }, [content, isStreaming]);

  return (
    <div
      data-testid="agent-message"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        maxWidth: '90%',
        animation: 'agent-enter 200ms var(--ease-glass)',
      }}
    >
      {/* Agent header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: color,
            boxShadow: `0 0 6px ${color}`,
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontSize: 12,
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            color,
            letterSpacing: '0.02em',
          }}
        >
          {agentEmoji} {agentName}
        </span>
        {isStreaming && (
          <span style={{ fontSize: 10, color: 'var(--text-quaternary)', fontFamily: 'var(--font-body)' }}>
            typing…
          </span>
        )}
        {!isStreaming && containsDiffBlocks && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
              fontSize: 10,
              fontFamily: 'var(--font-body)',
              color: 'var(--color-success)',
              background: 'var(--bg-diff-add, #0d1f12)',
              border: '1px solid var(--border-diff-add, #2a4a30)',
              borderRadius: 4,
              padding: '1px 5px',
            }}
          >
            <GitMerge size={9} />
            {diffCount} diff{diffCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Message bubble */}
      <div
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-xs) var(--radius-lg) var(--radius-lg) var(--radius-lg)',
          padding: '12px 14px',
          fontSize: 14,
          color: 'var(--text-ai)',
          fontFamily: 'var(--font-body)',
          lineHeight: 1.65,
          wordBreak: 'break-word',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {isStreaming ? (
          <span style={{ whiteSpace: 'pre-wrap' }}>{content}</span>
        ) : (
          <div
            className="agent-message-content"
            style={{ whiteSpace: 'pre-wrap' }}
            dangerouslySetInnerHTML={{ __html: renderedContent }}
          />
        )}
        {isStreaming && <StreamingCursor />}

        {showDiffBadge && !isStreaming && (
          <button
            onClick={onViewDiff}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              marginTop: 12,
              padding: '5px 12px',
              borderRadius: 6,
              border: '1px solid var(--border-diff-add, #2a4a30)',
              background: 'var(--bg-diff-add, #0d1f12)',
              color: 'var(--color-success)',
              fontSize: 12,
              fontFamily: 'var(--font-body)',
              fontWeight: 600,
              cursor: 'pointer',
              width: '100%',
              justifyContent: 'center',
            }}
            className="hover:brightness-125 transition-all"
          >
            <GitMerge size={13} />
            View diff in editor →
          </button>
        )}
      </div>

      {/* Timestamp */}
      {timestamp && !isStreaming && (
        <span style={{ fontSize: 11, color: 'var(--text-quaternary)', fontFamily: 'var(--font-numeric)' }}>
          {new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      )}
    </div>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderContent(content: string): string {
  const lines = content.split('\n');
  const result: string[] = [];
  let inCode = false;
  let codeLang = '';
  let codeLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fenceMatch = line.match(/^```(\w*)$/);

    if (fenceMatch && !inCode) {
      inCode = true;
      codeLang = fenceMatch[1] || 'plaintext';
      codeLines = [];
      continue;
    }

    if (line.trim() === '```' && inCode) {
      inCode = false;
      result.push(
        `<pre style="background:var(--bg-surface-sunken);border:1px solid var(--border-subtle);border-radius:6px;padding:10px 12px;overflow-x:auto;margin:8px 0;font-family:var(--font-mono);font-size:12px;line-height:1.5;"><code class="lang-${escapeHtml(codeLang)}">${escapeHtml(codeLines.join('\n'))}</code></pre>`
      );
      codeLines = [];
      codeLang = '';
      continue;
    }

    if (inCode) {
      codeLines.push(line);
      continue;
    }

    if (line.trim() === '<<<<<<< SEARCH' || line.trim().startsWith('<<<<<<< SEARCH')) {
      result.push(
        `<div style="background:var(--bg-diff-remove,#1f0d0d);border-left:3px solid var(--color-destructive);padding:2px 8px;font-family:var(--font-mono);font-size:11px;color:var(--color-destructive)">${escapeHtml(line)}</div>`
      );
      continue;
    }
    if (line.trim() === '=======' && !inCode) {
      result.push(
        `<div style="background:var(--bg-surface-sunken);border-left:3px solid var(--text-quaternary);padding:2px 8px;font-family:var(--font-mono);font-size:11px;color:var(--text-quaternary)">${escapeHtml(line)}</div>`
      );
      continue;
    }
    if (line.trim() === '>>>>>>> REPLACE') {
      result.push(
        `<div style="background:var(--bg-diff-add,#0d1f12);border-left:3px solid var(--color-success);padding:2px 8px;font-family:var(--font-mono);font-size:11px;color:var(--color-success)">${escapeHtml(line)}</div>`
      );
      continue;
    }

    let rendered = escapeHtml(line);
    rendered = rendered.replace(/`([^`]+)`/g, '<code style="background:var(--bg-surface-sunken);border-radius:3px;padding:1px 4px;font-family:var(--font-mono);font-size:12px;">$1</code>');
    rendered = rendered.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    rendered = rendered.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    if (/^#{1,3}\s/.test(line)) {
      const level = line.match(/^(#{1,3})/)?.[1].length ?? 1;
      const text = rendered.replace(/^#{1,3}\s/, '');
      const sizes = [16, 14, 13];
      result.push(
        `<div style="font-weight:700;font-size:${sizes[level - 1]}px;margin:10px 0 4px;font-family:var(--font-display)">${text}</div>`
      );
      continue;
    }

    if (/^[-*]\s/.test(line)) {
      result.push(`<div style="padding-left:14px;margin:1px 0">• ${rendered.replace(/^[-*]\s/, '')}</div>`);
      continue;
    }

    result.push(`<span>${rendered}</span>${i < lines.length - 1 ? '\n' : ''}`);
  }

  if (inCode && codeLines.length > 0) {
    result.push(
      `<pre style="background:var(--bg-surface-sunken);border:1px solid var(--border-subtle);border-radius:6px;padding:10px 12px;overflow-x:auto;margin:8px 0;font-family:var(--font-mono);font-size:12px;"><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`
    );
  }

  return result.join('');
}
