import { useMemo, useState, useCallback } from 'react';
import { GitMerge, Copy, Check as CheckIcon } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { StreamingCursor } from './StreamingCursor';
import { hasDiffBlocks, countDiffBlocks } from '@/lib/diff/parser';
import { useDiffStore } from '@/lib/store/diffStore';

/**
 * v6.1 — proper Markdown rendering with syntax-highlighted code fences.
 *
 * Previously this component shipped a hand-rolled regex-based renderer that
 * was brittle (broke on nested inline code, tables, task lists, multi-line
 * fenced code with leading whitespace, etc.) and the resulting HTML was
 * injected via dangerouslySetInnerHTML — so any future change had to fight
 * both XSS escaping and the regex passes simultaneously.
 *
 * Now we use:
 *   - react-markdown — well-tested, sanitised by default (no innerHTML)
 *   - remark-gfm     — tables, strikethrough, task lists, autolinks, footnotes
 *   - react-syntax-highlighter (Prism) — code fences with proper colouring
 *
 * Diff blocks (`<<<<<<< SEARCH … ======= … >>>>>>> REPLACE`) are still
 * intercepted BEFORE Markdown so their distinctive 3-band colouring is
 * preserved — those tokens aren't fenced code and Markdown would otherwise
 * render them as plain text.
 *
 * While streaming the raw text is shown verbatim (incl. the cursor); only on
 * stream completion does the Markdown renderer run. This avoids re-parsing
 * the AST on every token and keeps streaming snappy.
 */

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

interface ContentSegment {
  kind: 'prose' | 'diff';
  text: string;
}

/**
 * Pull SEARCH/REPLACE diff blocks out of the message body so they can be
 * rendered with the dedicated three-colour styling. Anything outside a diff
 * block is returned as a 'prose' segment for ReactMarkdown.
 *
 * Matching is non-greedy and tolerant of trailing whitespace before the
 * REPLACE marker so we don't get tripped up by the variations Gemini
 * occasionally produces.
 */
function splitDiffsAndProse(content: string): ContentSegment[] {
  const segments: ContentSegment[] = [];
  const diffPattern = /<{7} SEARCH[\s\S]*?>{7} REPLACE/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = diffPattern.exec(content)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ kind: 'prose', text: content.slice(lastIndex, match.index) });
    }
    segments.push({ kind: 'diff', text: match[0] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) {
    segments.push({ kind: 'prose', text: content.slice(lastIndex) });
  }
  return segments;
}

function DiffSegment({ text }: { text: string }) {
  // Each diff block has three named bands. We split on the markers and
  // render each band with its corresponding colour bar. Anything before
  // the first marker (typically the file path) is rendered as a header.
  const searchIdx = text.indexOf('<<<<<<< SEARCH');
  const sepIdx = text.indexOf('=======', searchIdx);
  const replaceIdx = text.indexOf('>>>>>>> REPLACE', sepIdx);

  if (searchIdx === -1 || sepIdx === -1 || replaceIdx === -1) {
    // Malformed — fall back to monospace block so the user still sees it.
    return (
      <pre style={preFallbackStyle}>
        <code>{text}</code>
      </pre>
    );
  }

  const filePath = text.slice(0, searchIdx).trim();
  const searchBody = text.slice(searchIdx + '<<<<<<< SEARCH'.length, sepIdx).trim();
  const replaceBody = text
    .slice(sepIdx + '======='.length, replaceIdx)
    .replace(/^\n/, '')
    .replace(/\n$/, '');

  return (
    <div style={diffContainerStyle}>
      {filePath && (
        <div style={diffFilePathStyle}>
          {filePath}
        </div>
      )}
      <div style={diffBandRemoveStyle}>
        <span style={diffBandLabelStyle}>− SEARCH</span>
        <pre style={diffBandPreStyle}>{searchBody}</pre>
      </div>
      <div style={diffBandSeparatorStyle} />
      <div style={diffBandAddStyle}>
        <span style={diffBandLabelStyle}>+ REPLACE</span>
        <pre style={diffBandPreStyle}>{replaceBody}</pre>
      </div>
    </div>
  );
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

  const containsDiffBlocks = useMemo(
    () => !isStreaming && hasDiffBlocks(content),
    [content, isStreaming]
  );
  const diffCount = useMemo(
    () => (containsDiffBlocks ? countDiffBlocks(content) : 0),
    [content, containsDiffBlocks]
  );

  const hasStagedDiffs = pendingDiffs.some((d) => d.agentName === agentName);
  const showDiffBadge = hasDiffProp || containsDiffBlocks || hasStagedDiffs;

  const segments = useMemo<ContentSegment[]>(() => {
    if (isStreaming) return []; // streamed text rendered raw
    return splitDiffsAndProse(content);
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
          <span
            style={{
              fontSize: 10,
              color: 'var(--text-quaternary)',
              fontFamily: 'var(--font-body)',
            }}
          >
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
          borderRadius:
            'var(--radius-xs) var(--radius-lg) var(--radius-lg) var(--radius-lg)',
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
          <div className="agent-message-content">
            {segments.map((seg, i) =>
              seg.kind === 'diff' ? (
                <DiffSegment key={i} text={seg.text} />
              ) : (
                <ReactMarkdown
                  key={i}
                  remarkPlugins={[remarkGfm]}
                  components={markdownComponents}
                >
                  {seg.text}
                </ReactMarkdown>
              )
            )}
          </div>
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
        <span
          style={{
            fontSize: 11,
            color: 'var(--text-quaternary)',
            fontFamily: 'var(--font-numeric)',
          }}
        >
          {new Date(timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * ReactMarkdown component overrides — match the surrounding chat aesthetic
 * (Glass-Era tokens) and keep typography compact for chat density.
 * ───────────────────────────────────────────────────────────────────────── */

type MarkdownProps = React.HTMLAttributes<HTMLElement> & {
  children?: React.ReactNode;
};

type CodeProps = MarkdownProps & {
  inline?: boolean;
  className?: string;
};

/** Copy-to-clipboard button shown in the top-right corner of every fenced code block. */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Fallback for older browsers / http contexts
      const el = document.createElement('textarea');
      el.value = text;
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.focus();
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      title={copied ? 'Copied!' : 'Copy code'}
      aria-label={copied ? 'Copied!' : 'Copy code'}
      style={{
        position: 'absolute',
        top: 6,
        right: 6,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '3px 8px',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--border-subtle)',
        background: copied ? 'var(--color-success-subtle)' : 'var(--bg-surface-elevated)',
        color: copied ? 'var(--color-success)' : 'var(--text-tertiary)',
        fontSize: 11,
        fontFamily: 'var(--font-body)',
        fontWeight: 500,
        cursor: 'pointer',
        transition: 'all 150ms',
        zIndex: 1,
      }}
    >
      {copied ? <CheckIcon size={11} /> : <Copy size={11} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

/** Fenced code block with language label + copy button — strictly separated from prose. */
function CodeBlock({ language, code }: { language: string; code: string }) {
  return (
    <div
      style={{
        position: 'relative',
        margin: '10px 0',
        border: '1px solid var(--border-subtle)',
        borderRadius: 8,
        overflow: 'hidden',
        background: 'var(--bg-surface-sunken)',
      }}
    >
      {/* Language label bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '5px 10px',
          background: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontFamily: 'var(--font-mono)',
            fontWeight: 600,
            color: 'var(--text-quaternary)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          {language}
        </span>
        <CopyButton text={code} />
      </div>
      <SyntaxHighlighter
        style={oneDark}
        language={language}
        PreTag="div"
        customStyle={{
          background: 'transparent',
          border: 'none',
          borderRadius: 0,
          padding: '10px 12px',
          margin: 0,
          fontSize: 12,
          lineHeight: 1.5,
        }}
        codeTagProps={{ style: { fontFamily: 'var(--font-mono)' } }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}

const markdownComponents = {
  // Code: inline → tinted pill; fenced block → full CodeBlock with copy button
  code({ inline, className, children, ...props }: CodeProps) {
    const text = String(children ?? '').replace(/\n$/, '');
    const match = /language-(\w+)/.exec(className ?? '');

    if (inline || !match) {
      return (
        <code
          style={{
            background: 'var(--bg-surface-sunken)',
            borderRadius: 3,
            padding: '1px 4px',
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
          }}
          {...props}
        >
          {children}
        </code>
      );
    }

    return <CodeBlock language={match[1]} code={text} />;
  },

  p({ children }: MarkdownProps) {
    return <p style={{ margin: '4px 0' }}>{children}</p>;
  },

  ul({ children }: MarkdownProps) {
    return (
      <ul style={{ margin: '6px 0', paddingLeft: 20, listStyle: 'disc' }}>
        {children}
      </ul>
    );
  },

  ol({ children }: MarkdownProps) {
    return (
      <ol style={{ margin: '6px 0', paddingLeft: 20, listStyle: 'decimal' }}>
        {children}
      </ol>
    );
  },

  li({ children }: MarkdownProps) {
    return <li style={{ margin: '2px 0' }}>{children}</li>;
  },

  h1({ children }: MarkdownProps) {
    return (
      <h1
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 18,
          fontWeight: 700,
          margin: '12px 0 6px',
        }}
      >
        {children}
      </h1>
    );
  },

  h2({ children }: MarkdownProps) {
    return (
      <h2
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 16,
          fontWeight: 700,
          margin: '10px 0 5px',
        }}
      >
        {children}
      </h2>
    );
  },

  h3({ children }: MarkdownProps) {
    return (
      <h3
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 14,
          fontWeight: 700,
          margin: '8px 0 4px',
        }}
      >
        {children}
      </h3>
    );
  },

  // Tables (remark-gfm) — minimal but readable on a narrow chat column
  table({ children }: MarkdownProps) {
    return (
      <div style={{ overflowX: 'auto', margin: '8px 0' }}>
        <table
          style={{
            borderCollapse: 'collapse',
            fontSize: 13,
            width: '100%',
          }}
        >
          {children}
        </table>
      </div>
    );
  },

  th({ children }: MarkdownProps) {
    return (
      <th
        style={{
          textAlign: 'left',
          padding: '6px 8px',
          borderBottom: '1px solid var(--border-default)',
          fontWeight: 600,
          background: 'var(--bg-surface-sunken)',
        }}
      >
        {children}
      </th>
    );
  },

  td({ children }: MarkdownProps) {
    return (
      <td
        style={{
          padding: '6px 8px',
          borderBottom: '1px solid var(--border-subtle)',
          verticalAlign: 'top',
        }}
      >
        {children}
      </td>
    );
  },

  a({ children, href }: MarkdownProps & { href?: string }) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: 'var(--color-primary)', textDecoration: 'underline' }}
      >
        {children}
      </a>
    );
  },

  blockquote({ children }: MarkdownProps) {
    return (
      <blockquote
        style={{
          borderLeft: '3px solid var(--border-strong)',
          paddingLeft: 10,
          margin: '8px 0',
          color: 'var(--text-secondary)',
          fontStyle: 'italic',
        }}
      >
        {children}
      </blockquote>
    );
  },

  hr() {
    return (
      <hr
        style={{
          border: 'none',
          borderTop: '1px solid var(--border-subtle)',
          margin: '10px 0',
        }}
      />
    );
  },

  strong({ children }: MarkdownProps) {
    return <strong style={{ fontWeight: 700 }}>{children}</strong>;
  },

  em({ children }: MarkdownProps) {
    return <em style={{ fontStyle: 'italic' }}>{children}</em>;
  },
};

/* ─────────────────────────────────────────────────────────────────────────
 * Diff-band styles (kept local to avoid extra CSS file)
 * ───────────────────────────────────────────────────────────────────────── */

const diffContainerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 0,
  margin: '8px 0',
  border: '1px solid var(--border-default)',
  borderRadius: 6,
  overflow: 'hidden',
};

const diffFilePathStyle: React.CSSProperties = {
  padding: '5px 10px',
  background: 'var(--bg-surface-sunken)',
  borderBottom: '1px solid var(--border-subtle)',
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  color: 'var(--text-tertiary)',
};

const diffBandPreStyle: React.CSSProperties = {
  margin: 0,
  padding: '6px 10px 8px',
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  lineHeight: 1.55,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
};

const diffBandLabelStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '2px 8px',
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.04em',
};

const diffBandRemoveStyle: React.CSSProperties = {
  background: 'var(--bg-diff-remove, rgba(239,68,68,0.08))',
  borderLeft: '3px solid var(--color-destructive)',
  color: 'var(--color-destructive)',
};

const diffBandAddStyle: React.CSSProperties = {
  background: 'var(--bg-diff-add, rgba(16,185,129,0.08))',
  borderLeft: '3px solid var(--color-success)',
  color: 'var(--color-success)',
};

const diffBandSeparatorStyle: React.CSSProperties = {
  height: 1,
  background: 'var(--border-subtle)',
};

const preFallbackStyle: React.CSSProperties = {
  background: 'var(--bg-surface-sunken)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 6,
  padding: '10px 12px',
  overflowX: 'auto',
  margin: '8px 0',
  fontFamily: 'var(--font-mono)',
  fontSize: 12,
  lineHeight: 1.5,
};
