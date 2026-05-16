const AGENT_COLORS = [
  'var(--text-agent-1)',
  'var(--text-agent-2)',
  'var(--text-agent-3)',
  'var(--text-agent-4)',
  'var(--text-agent-5)',
];

interface ThinkingAgent {
  id: string;
  name: string;
  emoji: string;
  colorIndex: number;
  status: 'thinking' | 'writing' | 'reviewing' | 'done' | 'waiting';
}

interface AgentThinkingPanelProps {
  agents: ThinkingAgent[];
  activeAgentId?: string;
}

const STATUS_LABELS: Record<ThinkingAgent['status'], string> = {
  thinking: 'Thinking…',
  writing: 'Writing code…',
  reviewing: 'Reviewing…',
  done: 'Done ✅',
  waiting: 'Waiting',
};

const STATUS_COLORS: Record<ThinkingAgent['status'], string> = {
  thinking: 'var(--color-primary)',
  writing: 'var(--color-success)',
  reviewing: 'var(--color-accent)',
  done: 'var(--color-success)',
  waiting: 'var(--text-quaternary)',
};

export function AgentThinkingPanel({ agents, activeAgentId }: AgentThinkingPanelProps) {
  if (agents.length === 0) return null;

  return (
    <div
      data-testid="agent-thinking-panel"
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-card)',
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: 10,
          fontFamily: 'var(--font-display)',
          fontWeight: 700,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: 'var(--text-quaternary)',
        }}
      >
        Live Agent Arena
      </p>

      {agents.map((agent) => {
        const color = AGENT_COLORS[agent.colorIndex % AGENT_COLORS.length];
        const isActive = agent.id === activeAgentId;
        const statusColor = STATUS_COLORS[agent.status];

        return (
          <div
            key={agent.id}
            data-testid={`thinking-agent-${agent.id}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '6px 8px',
              borderRadius: 8,
              background: isActive ? 'var(--bg-agent-thinking)' : 'none',
              border: isActive ? '1px solid var(--border-accent)' : '1px solid transparent',
              transition: 'all var(--motion-base) var(--ease-standard)',
            }}
          >
            {/* Status dot */}
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: statusColor,
                  boxShadow: isActive ? `0 0 8px ${statusColor}` : 'none',
                }}
              />
              {(agent.status === 'thinking' || agent.status === 'writing' || agent.status === 'reviewing') && (
                <div
                  style={{
                    position: 'absolute',
                    inset: -2,
                    borderRadius: '50%',
                    background: statusColor,
                    opacity: 0.3,
                    animation: 'ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite',
                  }}
                />
              )}
            </div>

            {/* Emoji + Name */}
            <span style={{ fontSize: 14 }}>{agent.emoji}</span>
            <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500, flex: 1 }}>
              {agent.name}
            </span>

            {/* Status label */}
            <span style={{ fontSize: 11, color: statusColor, fontFamily: 'var(--font-body)' }}>
              {STATUS_LABELS[agent.status]}
            </span>

            {/* Thinking dots */}
            {(agent.status === 'thinking' || agent.status === 'writing') && (
              <div style={{ display: 'flex', gap: 3 }}>
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    style={{
                      width: 4,
                      height: 4,
                      borderRadius: '50%',
                      background: color,
                      animation: `thinking-pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
