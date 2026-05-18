/**
 * EmptyStateHint — Part 4 §1.7
 *
 * What the user sees the FIRST time they open Focus Forge — a clean,
 * un-cluttered hint about what this tool does and how to start.
 *
 * Deliberately understated. No marketing copy, no feature checklist —
 * the entire point of Focus Forge is that the UI is quiet.
 */

import { useChatStore } from '@/lib/store/chatStore';
import { useBlueprintStore } from '@/lib/store/blueprintStore';

export function EmptyStateHint() {
  const activeChatId = useChatStore((s) => s.activeChatId);
  const hasRepo = useBlueprintStore((s) =>
    activeChatId ? Boolean(s.repoConnections[activeChatId]) : false,
  );

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 20px',
        minHeight: 280,
      }}
      role="region"
      aria-label="Focus Forge empty state"
    >
      <div
        style={{
          maxWidth: 420,
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <div
          aria-hidden="true"
          style={{
            fontSize: 32,
            lineHeight: 1,
            marginBottom: 4,
            opacity: 0.55,
          }}
        >
          🪶
        </div>
        <h1
          style={{
            margin: 0,
            fontSize: 20,
            fontWeight: 700,
            fontFamily: 'var(--font-display, "Syne", sans-serif)',
            color: 'var(--text-primary)',
            lineHeight: '24px',
          }}
        >
          One chat. One Ustaad.
        </h1>
        <p
          style={{
            margin: 0,
            fontSize: 13,
            lineHeight: '20px',
            color: 'var(--text-tertiary)',
          }}
        >
          {hasRepo
            ? 'Describe what to build or change. Code streams into the file panel as it\u2019s written.'
            : 'Connect a repo from the top bar, then describe what to build. Code streams into the file panel as it\u2019s written.'}
        </p>
      </div>
    </div>
  );
}
