import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface ExpandablePromptProps {
  content: string;
  collapseAt?: number;
}

/**
 * ExpandablePrompt — shows truncated text with "Read more / Show less" toggle.
 * Used inside UserMessage for long prompts.
 */
export function ExpandablePrompt({ content, collapseAt = 280 }: ExpandablePromptProps) {
  const isLong = content.length > collapseAt;
  const [expanded, setExpanded] = useState(!isLong);

  const displayText = isLong && !expanded ? content.slice(0, collapseAt) + '…' : content;

  return (
    <>
      <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{displayText}</span>
      {isLong && (
        <button
          onClick={() => setExpanded((p) => !p)}
          aria-label={expanded ? 'Show less text' : 'Read more text'}
          aria-expanded={expanded}
          className="flex items-center gap-1 mt-2 transition-colors hover:text-[var(--color-primary)]"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            marginTop: 8,
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
    </>
  );
}
