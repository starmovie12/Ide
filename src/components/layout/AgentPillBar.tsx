import { Plus } from 'lucide-react';
import { useRef } from 'react';
import { AgentPill, AGENT_COLORS } from '@/components/agent/AgentPill';
import { useAgentStore } from '@/lib/store/agentStore';
import { useChatStore } from '@/lib/store/chatStore';
import { useUIStore } from '@/lib/store/uiStore';
import { deepClone } from '@/lib/utils/deepClone';

interface AgentPillBarProps {
  onAddAgent?: () => void;
}

export function AgentPillBar({ onAddAgent }: AgentPillBarProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { activeChatId } = useChatStore();
  const {
    chatAgents,
    removeChatAgent,
    addAgentToChat,
    templateAgents,
  } = useAgentStore();
  const { openEditAgent } = useUIStore();

  const agents = activeChatId ? (chatAgents[activeChatId] ?? []) : [];

  const handleScroll = (e: React.WheelEvent<HTMLDivElement>) => {
    if (scrollRef.current) {
      e.preventDefault();
      scrollRef.current.scrollLeft += e.deltaY;
    }
  };

  const handleDuplicate = (agentId: string) => {
    if (!activeChatId) return;
    const agent = agents.find((a) => a.id === agentId);
    if (!agent) return;
    const clone = { ...deepClone(agent), id: crypto.randomUUID(), name: `${agent.name} (copy)` };
    addAgentToChat(activeChatId, clone);
  };

  return (
    <div
      style={{
        height: 'var(--pill-bar-h)',
        background: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border-default)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 12px',
        gap: 8,
        flexShrink: 0,
        position: 'relative',
      }}
    >
      {/* Scrollable pill container */}
      <div
        ref={scrollRef}
        onWheel={handleScroll}
        data-testid="agent-pill-bar"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          overflowX: 'auto',
          scrollbarWidth: 'none',
          flex: 1,
          scrollSnapType: 'x mandatory',
          paddingBottom: 1, // prevent clip on focus ring
        }}
      >
        {agents.length === 0 && (
          <span
            style={{
              fontSize: 12,
              color: 'var(--text-quaternary)',
              fontFamily: 'var(--font-body)',
              whiteSpace: 'nowrap',
              paddingLeft: 4,
            }}
          >
            No agents — add from library
          </span>
        )}

        {agents.map((agent, idx) => (
          <div key={agent.id} style={{ scrollSnapAlign: 'start', flexShrink: 0 }}>
            <AgentPill
              agent={{
                ...agent,
                colorIndex: idx % AGENT_COLORS.length,
              }}
              onClick={() => openEditAgent(agent.id, activeChatId)}
              onEdit={() => openEditAgent(agent.id, activeChatId)}
              onDuplicate={() => handleDuplicate(agent.id)}
              onRemove={() => activeChatId && removeChatAgent(activeChatId, agent.id)}
            />
          </div>
        ))}

        {/* Add button */}
        <button
          data-testid="button-add-agent-pill"
          onClick={onAddAgent}
          className="flex items-center gap-1.5 rounded-full transition-colors hover:bg-[var(--bg-surface-elevated)] whitespace-nowrap flex-shrink-0"
          style={{
            height: 34,
            padding: '0 14px',
            border: '1px dashed var(--border-strong)',
            background: 'none',
            color: 'var(--text-tertiary)',
            cursor: 'pointer',
            fontSize: 12,
            fontFamily: 'var(--font-body)',
            scrollSnapAlign: 'start',
          }}
        >
          <Plus size={12} />
          Add Agent
        </button>
      </div>

      {/* Template quick-add hint when no agents */}
      {agents.length === 0 && templateAgents.length > 0 && (
        <span
          style={{
            fontSize: 11,
            color: 'var(--text-quaternary)',
            fontFamily: 'var(--font-body)',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          {templateAgents.length} in library
        </span>
      )}
    </div>
  );
}
