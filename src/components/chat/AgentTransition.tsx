import { ArrowRight } from 'lucide-react';

interface AgentTransitionProps {
  fromAgent: { name: string; emoji: string };
  toAgent: { name: string; emoji: string };
  reason?: string;
}

export function AgentTransition({ fromAgent, toAgent, reason }: AgentTransitionProps) {
  return (
    <div
      data-testid="agent-transition"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 12px',
        borderRadius: 'var(--radius-full)',
        background: 'var(--bg-surface-elevated)',
        border: '1px solid var(--border-subtle)',
        alignSelf: 'center',
        animation: 'agent-enter 200ms var(--ease-glass)',
        flexWrap: 'wrap',
        justifyContent: 'center',
      }}
    >
      <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>
        {fromAgent.emoji} <strong style={{ color: 'var(--text-primary)' }}>{fromAgent.name}</strong>
      </span>
      <ArrowRight size={13} style={{ color: 'var(--text-quaternary)', flexShrink: 0 }} />
      <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>
        {toAgent.emoji} <strong style={{ color: 'var(--text-primary)' }}>{toAgent.name}</strong>
      </span>
      {reason && (
        <span style={{ fontSize: 11, color: 'var(--text-quaternary)', fontFamily: 'var(--font-body)' }}>
          · {reason}
        </span>
      )}
    </div>
  );
}
