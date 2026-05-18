/**
 * UserMessageMinimal — Part 4 §1.7
 *
 * Stripped-down user message bubble for Focus Forge. Replaces the legacy
 * `UserMessage.tsx` (which renders agent-routing affordances + reply chips
 * — irrelevant in single-Ustaad mode).
 *
 * Visual: right-aligned, subtle background, no avatar (user's identity
 * lives in the Glass Island bottom nav per Constitutional Law 30).
 *
 * Renders plain text only — no markdown for user input (user input is
 * intent, not content; we don't want their backticks to be treated as code).
 */

interface UserMessageMinimalProps {
  children: string;
  timestamp?: number;
}

export function UserMessageMinimal({ children, timestamp }: UserMessageMinimalProps) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'flex-end',
        padding: '4px 0',
      }}
    >
      <div
        style={{
          maxWidth: '85%',
          padding: '10px 14px',
          background: 'var(--bg-glass-island-active)',
          border: '1px solid var(--border-subtle, rgba(124,106,247,0.15))',
          borderRadius: 18,
          borderBottomRightRadius: 6,
          color: 'var(--text-primary)',
          fontSize: 14,
          lineHeight: '20px',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
        aria-label={timestamp ? `You at ${new Date(timestamp).toLocaleTimeString()}` : 'You'}
      >
        {children}
      </div>
    </div>
  );
}
