import { useState } from 'react';
import { X, Plus, Search, GripVertical } from 'lucide-react';
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
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { useAgentStore, type Agent } from '@/lib/store/agentStore';
import { useChatStore } from '@/lib/store/chatStore';
import { cn } from '@/lib/utils/cn';

const DEFAULT_TEMPLATES: Agent[] = [
  {
    id: 'tpl-manager', emoji: '🎯', name: 'Manager', order: 0,
    role: 'Orchestrates agents, breaks tasks, delegates, and finalises.',
    model: 'gemini-2.5-pro',
    systemPrompt: '<role>Manager Agent</role>\n<task>Orchestrate the team. Break user requests into subtasks. Delegate to Coder, Reviewer, Debugger. Finalise when all agents approve.</task>',
    color: 'var(--text-agent-1)', temperature: 0.3, isTemplate: true, isDefault: true,
    active: true, createdAt: 0, updatedAt: 0, routeOutputTo: null,
  },
  {
    id: 'tpl-coder', emoji: '💻', name: 'Coder', order: 1,
    role: 'Writes production-quality code in Search/Replace diff format.',
    model: 'gemini-2.5-flash',
    systemPrompt: '<role>Coder Agent</role>\n<rules>Output ONLY Aider-style SEARCH/REPLACE blocks. Never rewrite full files. Only change what is necessary.</rules>',
    color: 'var(--text-agent-2)', temperature: 0.7, isTemplate: true, isDefault: true,
    active: true, createdAt: 0, updatedAt: 0, routeOutputTo: null,
  },
  {
    id: 'tpl-reviewer', emoji: '🔍', name: 'Reviewer', order: 2,
    role: 'Reviews code for bugs, security issues, and best practices.',
    model: 'gemini-2.5-pro',
    systemPrompt: '<role>Reviewer Agent</role>\n<output>Start with ✅ if approved, ❌ if issues found. List specific line-by-line issues.</output>',
    color: 'var(--text-agent-3)', temperature: 0.2, isTemplate: true, isDefault: true,
    active: true, createdAt: 0, updatedAt: 0, routeOutputTo: null,
  },
  {
    id: 'tpl-debugger', emoji: '🐛', name: 'Debugger', order: 3,
    role: 'Analyses errors and produces minimal targeted fixes.',
    model: 'gemini-2.5-flash',
    systemPrompt: '<role>Debugger Agent</role>\n<task>Analyse error messages. Identify root cause. Output minimal SEARCH/REPLACE fix.</task>',
    color: 'var(--text-agent-4)', temperature: 0.4, isTemplate: true, isDefault: true,
    active: true, createdAt: 0, updatedAt: 0, routeOutputTo: null,
  },
  {
    id: 'tpl-designer', emoji: '🎨', name: 'Designer', order: 4,
    role: 'Handles CSS, UI/UX, and visual improvements.',
    model: 'gemini-2.5-flash',
    systemPrompt: '<role>Designer Agent</role>\n<specialization>CSS, Tailwind, responsive design, animations, color theory, accessibility.</specialization>',
    color: 'var(--text-agent-5)', temperature: 0.8, isTemplate: true, isDefault: true,
    active: true, createdAt: 0, updatedAt: 0, routeOutputTo: null,
  },
];

interface AgentLibraryModalProps {
  open: boolean;
  onClose: () => void;
  onCreateNew: () => void;
}

export function AgentLibraryModal({ open, onClose, onCreateNew }: AgentLibraryModalProps) {
  const { templateAgents, addAgentToChat, addTemplate, reorderTemplates } = useAgentStore();
  const { activeChatId } = useChatStore();
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'library' | 'defaults'>('defaults');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  if (!open) return null;

  const displayList = activeTab === 'defaults' ? DEFAULT_TEMPLATES : templateAgents;
  const filtered = displayList.filter((a) =>
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    a.role.toLowerCase().includes(search.toLowerCase())
  );

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAddSelected = () => {
    if (!activeChatId) { onClose(); return; }
    selectedIds.forEach((id) => {
      const agent = displayList.find((a) => a.id === id);
      if (!agent) return;
      if (activeTab === 'defaults') {
        // First ensure it's in the template library
        const alreadyInLib = templateAgents.find((t) => t.name === agent.name);
        if (!alreadyInLib) addTemplate(agent);
      }
      addAgentToChat(activeChatId, agent);
    });
    setSelectedIds(new Set());
    onClose();
  };

  const handleAddAll = () => {
    if (!activeChatId) return;
    DEFAULT_TEMPLATES.forEach((tpl) => {
      addAgentToChat(activeChatId, tpl);
    });
    onClose();
  };

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
    <div style={{ position: 'fixed', inset: 0, zIndex: 'var(--z-modal)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }} />

      <div
        data-testid="modal-agent-library"
        style={{
          position: 'relative', background: 'var(--bg-surface)',
          border: '1px solid var(--border-default)', borderRadius: 'var(--radius-xl)',
          width: '100%', maxWidth: 580, maxHeight: '82vh',
          display: 'flex', flexDirection: 'column',
          boxShadow: 'var(--shadow-modal)', overflow: 'hidden',
          animation: 'agent-enter 220ms var(--ease-decelerate)',
        }}
      >
        {/* Header */}
        <div style={{ padding: '20px 20px 0', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
            <div>
              <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, color: 'var(--text-primary)' }}>
                Agent Library
              </h2>
              <p style={{ margin: '3px 0 0', fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>
                Select agents to add to this chat.
              </p>
            </div>
            <button onClick={onClose} style={iconBtnStyle} data-testid="button-close-library">
              <X size={18} />
            </button>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
            {(['defaults', 'library'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  fontSize: 13, fontFamily: 'var(--font-body)', fontWeight: activeTab === tab ? 600 : 400,
                  background: activeTab === tab ? 'var(--color-primary-subtle)' : 'none',
                  color: activeTab === tab ? 'var(--color-primary)' : 'var(--text-secondary)',
                  transition: 'all 150ms',
                }}
              >
                {tab === 'defaults' ? '⭐ Default Agents' : `My Library (${templateAgents.length})`}
              </button>
            ))}
          </div>

          {/* Search */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-default)',
            borderRadius: 8, padding: '0 12px', height: 38, marginBottom: 16,
          }}>
            <Search size={14} style={{ color: 'var(--text-quaternary)', flexShrink: 0 }} />
            <input
              data-testid="input-library-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search agents..."
              style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: 13, color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}
            />
          </div>
        </div>

        {/* Agent list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px' }}>
          {activeTab === 'library' && templateAgents.length > 0 ? (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={templateAgents.map((a) => a.id)} strategy={verticalListSortingStrategy}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 12 }}>
                  {filtered.map((agent) => (
                    <SortableAgentRow
                      key={agent.id}
                      agent={agent}
                      selected={selectedIds.has(agent.id)}
                      onToggle={() => toggleSelect(agent.id)}
                      draggable
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 12 }}>
              {filtered.length === 0 ? (
                <p style={{ textAlign: 'center', color: 'var(--text-quaternary)', fontSize: 13, padding: '20px 0', fontFamily: 'var(--font-body)' }}>
                  {activeTab === 'library' ? 'No agents in your library yet.' : 'No results.'}
                </p>
              ) : (
                filtered.map((agent) => (
                  <SortableAgentRow
                    key={agent.id}
                    agent={agent}
                    selected={selectedIds.has(agent.id)}
                    onToggle={() => toggleSelect(agent.id)}
                    draggable={false}
                  />
                ))
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: 10, flexShrink: 0, alignItems: 'center' }}>
          <button
            data-testid="button-create-custom-agent"
            onClick={() => { onClose(); onCreateNew(); }}
            className="flex items-center gap-2 rounded-lg transition-colors hover:bg-[var(--bg-surface-elevated)]"
            style={{ padding: '0 14px', height: 38, border: '1px dashed var(--border-strong)', background: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-body)' }}
          >
            <Plus size={14} />
            Create Custom
          </button>
          {activeTab === 'defaults' && (
            <button
              data-testid="button-add-all-defaults"
              onClick={handleAddAll}
              className="flex items-center gap-2 rounded-lg transition-colors hover:bg-[var(--bg-surface-elevated)]"
              style={{ padding: '0 14px', height: 38, border: '1px solid var(--border-default)', background: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-body)' }}
            >
              Add all 5
            </button>
          )}
          <div style={{ flex: 1 }} />
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton onClick={handleAddSelected} disabled={selectedIds.size === 0}>
            Add {selectedIds.size > 0 ? selectedIds.size : ''} Agent{selectedIds.size !== 1 ? 's' : ''}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}

function SortableAgentRow({
  agent,
  selected,
  onToggle,
  draggable,
}: {
  agent: Agent;
  selected: boolean;
  onToggle: () => void;
  draggable: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: agent.id,
    disabled: !draggable,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <button
        data-testid={`library-agent-${agent.id}`}
        onClick={onToggle}
        className={cn(
          'flex items-center gap-3 text-left rounded-xl p-3 transition-all duration-150 w-full',
          'hover:bg-[var(--bg-surface-elevated)]',
          selected && 'ring-1 ring-[var(--border-accent)]'
        )}
        style={{
          border: `1px solid ${selected ? 'var(--border-accent)' : 'var(--border-default)'}`,
          background: selected ? 'rgba(124,106,247,0.08)' : 'none',
          cursor: 'pointer',
        }}
      >
        {draggable && (
          <div {...attributes} {...listeners} onClick={(e) => e.stopPropagation()}>
            <GripVertical size={14} style={{ color: 'var(--text-quaternary)', cursor: 'grab', flexShrink: 0 }} />
          </div>
        )}
        <div style={{
          width: 40, height: 40, borderRadius: 10,
          background: 'var(--bg-surface-elevated)',
          border: '1px solid var(--border-default)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 20, flexShrink: 0,
        }}>
          {agent.emoji}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}>
              {agent.name}
            </span>
            <span style={{ fontSize: 10, fontFamily: 'var(--font-numeric)', color: 'var(--text-quaternary)', background: 'var(--bg-surface-overlay)', padding: '1px 5px', borderRadius: 4 }}>
              {agent.model.replace('gemini-', '')}
            </span>
            {agent.isDefault && (
              <span style={{ fontSize: 10, color: 'var(--color-primary)', background: 'var(--color-primary-subtle)', padding: '1px 5px', borderRadius: 4, fontWeight: 600 }}>
                DEFAULT
              </span>
            )}
          </div>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {agent.role}
          </p>
        </div>
        <div style={{
          width: 20, height: 20, borderRadius: '50%',
          border: `2px solid ${selected ? 'var(--color-primary)' : 'var(--border-strong)'}`,
          background: selected ? 'var(--color-primary)' : 'none',
          flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {selected && <span style={{ color: 'white', fontSize: 11, fontWeight: 700 }}>✓</span>}
        </div>
      </button>
    </div>
  );
}

const iconBtnStyle: React.CSSProperties = {
  width: 36, height: 36, border: 'none', background: 'none',
  color: 'var(--text-tertiary)', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8,
};
