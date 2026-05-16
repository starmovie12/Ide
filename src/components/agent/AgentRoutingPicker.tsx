import { ChevronDown, GitBranch } from 'lucide-react';

interface RoutingAgent {
  id: string;
  name: string;
  emoji: string;
}

interface AgentRoutingPickerProps {
  value: string | null;
  onChange: (agentId: string | null) => void;
  agents: RoutingAgent[];
  currentAgentId?: string;
}

export function AgentRoutingPicker({ value, onChange, agents, currentAgentId }: AgentRoutingPickerProps) {
  const available = agents.filter((a) => a.id !== currentAgentId);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <GitBranch size={13} style={{ color: 'var(--text-quaternary)' }} />
        <label
          style={{
            fontSize: 11,
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--text-quaternary)',
          }}
        >
          Send Output To
        </label>
      </div>

      <div style={{ position: 'relative' }}>
        <select
          data-testid="agent-routing-picker"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value || null)}
          style={{
            width: '100%',
            background: 'var(--bg-surface-sunken)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-base)',
            padding: '0 36px 0 12px',
            height: 42,
            fontSize: 14,
            color: value ? 'var(--text-primary)' : 'var(--text-quaternary)',
            fontFamily: 'var(--font-body)',
            outline: 'none',
            appearance: 'none',
            cursor: 'pointer',
          }}
        >
          <option value="">— No routing (end of chain) —</option>
          {available.map((agent) => (
            <option key={agent.id} value={agent.id} style={{ background: 'var(--bg-surface-overlay)' }}>
              {agent.emoji} {agent.name}
            </option>
          ))}
        </select>
        <ChevronDown
          size={16}
          style={{
            position: 'absolute',
            right: 12,
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--text-tertiary)',
            pointerEvents: 'none',
          }}
        />
      </div>

      <p style={{ fontSize: 12, color: 'var(--text-quaternary)', marginTop: 6, fontFamily: 'var(--font-body)' }}>
        This agent's output will be automatically sent to the selected agent.
      </p>
    </div>
  );
}
