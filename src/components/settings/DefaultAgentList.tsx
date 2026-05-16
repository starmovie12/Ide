import { Plus, Trash2, GripVertical, Star, Edit2 } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useAgentStore, type Agent } from '@/lib/store/agentStore';
import { useUIStore } from '@/lib/store/uiStore';

const AGENT_COLORS = [
  'var(--text-agent-1)', 'var(--text-agent-2)', 'var(--text-agent-3)',
  'var(--text-agent-4)', 'var(--text-agent-5)',
];

const MODEL_SHORT: Record<string, string> = {
  'gemini-2.5-flash': '2.5 Flash', 'gemini-2.5-pro': '2.5 Pro',
  'gemini-2.0-flash': '2.0 Flash', 'gemini-1.5-flash': '1.5 Flash',
  'gemini-3-flash': '3 Flash', 'gemini-3.1-pro': '3.1 Pro',
};

interface DefaultAgentListProps {
  onAddAgent?: () => void;
}

export function DefaultAgentList({ onAddAgent }: DefaultAgentListProps) {
  const { templateAgents, deleteTemplate, reorderTemplates } = useAgentStore();
  const { openEditAgent } = useUIStore();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = templateAgents.map((a) => a.id);
    const oldIdx = ids.indexOf(active.id as string);
    const newIdx = ids.indexOf(over.id as string);
    if (oldIdx === -1 || newIdx === -1) return;
    const reordered = [...ids];
    reordered.splice(oldIdx, 1);
    reordered.splice(newIdx, 0, active.id as string);
    reorderTemplates(reordered);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div>
        <h2 style={{ margin: '0 0 4px', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20, color: 'var(--text-primary)' }}>
          Default Agents
        </h2>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', lineHeight: 1.5 }}>
          Your agent library. Drag to reorder. Agents marked as default are auto-loaded in new chats.
        </p>
      </div>

      {/* Agent list */}
      {templateAgents.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '40px 20px',
          border: '1px dashed var(--border-strong)', borderRadius: 'var(--radius-card)',
        }}>
          <Star size={32} style={{ color: 'var(--text-quaternary)', marginBottom: 12 }} />
          <p style={{ margin: '0 0 8px', fontSize: 14, color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>
            No agents in your library yet
          </p>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-quaternary)', fontFamily: 'var(--font-body)' }}>
            Create custom agents or add from the default collection.
          </p>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={templateAgents.map((a) => a.id)} strategy={verticalListSortingStrategy}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {templateAgents.map((agent, idx) => (
                <SortableAgentRow
                  key={agent.id}
                  agent={agent}
                  colorIndex={idx % AGENT_COLORS.length}
                  onEdit={() => openEditAgent(agent.id, null)}
                  onRemove={() => deleteTemplate(agent.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* Add button */}
      <button
        data-testid="btn-add-default-agent"
        onClick={onAddAgent}
        className="flex items-center justify-center gap-2 rounded-xl transition-colors hover:bg-[var(--bg-surface-elevated)] w-full"
        style={{
          padding: 14, border: '1px dashed var(--border-strong)', background: 'none',
          color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-body)',
        }}
      >
        <Plus size={14} />
        Add from Library
      </button>
    </div>
  );
}

function SortableAgentRow({
  agent, colorIndex, onEdit, onRemove,
}: {
  agent: Agent;
  colorIndex: number;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: agent.id });
  const color = AGENT_COLORS[colorIndex];

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
    >
      <div
        data-testid={`default-agent-${agent.id}`}
        style={{
          background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-card)', padding: '12px 16px',
          display: 'flex', alignItems: 'center', gap: 12,
          transition: 'border-color 150ms',
        }}
      >
        {/* Drag handle */}
        <button
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder"
          style={{
            background: 'none', border: 'none', padding: 0,
            color: 'var(--text-quaternary)', cursor: 'grab', flexShrink: 0,
            display: 'flex', alignItems: 'center',
          }}
        >
          <GripVertical size={16} />
        </button>

        {/* Emoji avatar */}
        <div style={{
          width: 40, height: 40, borderRadius: 10,
          background: 'var(--bg-surface-elevated)', border: `1px solid ${color}33`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 20, flexShrink: 0,
        }}>
          {agent.emoji}
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}>
              {agent.name}
            </span>
            <span style={{
              fontSize: 10, fontFamily: 'var(--font-numeric)', color: 'var(--text-quaternary)',
              background: 'var(--bg-surface-elevated)', padding: '1px 6px', borderRadius: 4,
            }}>
              {MODEL_SHORT[agent.model] ?? agent.model}
            </span>
            {agent.isDefault && (
              <span style={{ fontSize: 10, color: 'var(--color-primary)', background: 'var(--color-primary-subtle)', padding: '1px 5px', borderRadius: 4, fontWeight: 600 }}>
                DEFAULT
              </span>
            )}
          </div>
          {agent.role && (
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {agent.role}
            </p>
          )}
        </div>

        {/* Temperature */}
        <span style={{ fontSize: 11, color: 'var(--text-quaternary)', fontFamily: 'var(--font-numeric)', flexShrink: 0 }}>
          T={agent.temperature.toFixed(1)}
        </span>

        {/* Edit */}
        <button
          data-testid={`btn-edit-template-${agent.id}`}
          onClick={onEdit}
          className="flex items-center justify-center rounded transition-colors hover:bg-[var(--bg-surface-elevated)] flex-shrink-0"
          style={{ width: 32, height: 32, border: 'none', background: 'none', color: 'var(--text-tertiary)', cursor: 'pointer' }}
          aria-label={`Edit ${agent.name}`}
        >
          <Edit2 size={14} />
        </button>

        {/* Remove */}
        <button
          data-testid={`btn-remove-default-${agent.id}`}
          onClick={onRemove}
          className="flex items-center justify-center rounded transition-colors hover:bg-[var(--color-destructive-subtle)] flex-shrink-0"
          style={{ width: 32, height: 32, border: 'none', background: 'none', color: 'var(--color-destructive)', cursor: 'pointer' }}
          aria-label={`Remove ${agent.name}`}
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}
