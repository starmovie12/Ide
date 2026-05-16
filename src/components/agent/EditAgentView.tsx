import { useState, useEffect } from 'react';
import { X, Info, AlertTriangle } from 'lucide-react';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { DeleteAgentButton } from '@/components/agent/DeleteAgentButton';
import { ModelSelector, type GeminiModel } from '@/components/agent/ModelSelector';
import { AgentRoutingPicker } from '@/components/agent/AgentRoutingPicker';
import { useAgentStore, type Agent } from '@/lib/store/agentStore';

const EMOJI_OPTIONS = [
  '🤖', '🧠', '⚡', '🔧', '🛠️', '💡', '🎯', '🚀', '🔍', '🐛',
  '✨', '🎨', '📝', '🔬', '⚙️', '🧩', '🎭', '🦾', '💻', '🔮',
  '🦊', '🐉', '🔑', '⭐', '💎', '🌊', '🔥', '❄️', '🌈', '🎲',
];

const AGENT_COLORS = ['#7c6af7', '#4ade80', '#f59e0b', '#38bdf8', '#ec4899'];

interface EditAgentViewProps {
  open: boolean;
  onClose: () => void;
  agentId: string;
  /** If set, editing a chat-local instance (not the template) */
  chatId?: string | null;
}

export function EditAgentView({ open, onClose, agentId, chatId }: EditAgentViewProps) {
  const {
    templateAgents,
    chatAgents,
    updateTemplate,
    deleteTemplate,
    updateChatAgent,
    removeChatAgent,
  } = useAgentStore();

  const isChatInstance = !!chatId;

  // Find the agent to edit
  const sourceAgent: Agent | undefined = isChatInstance
    ? (chatAgents[chatId!] ?? []).find((a) => a.id === agentId)
    : templateAgents.find((a) => a.id === agentId);

  const chatAgentList = chatId ? (chatAgents[chatId] ?? []).filter((a) => a.id !== agentId) : [];

  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('🤖');
  const [role, setRole] = useState('');
  const [model, setModel] = useState<GeminiModel>('gemini-2.5-flash');
  const [temperature, setTemperature] = useState(0.7);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [color, setColor] = useState(AGENT_COLORS[0]);
  const [routeOutputTo, setRouteOutputTo] = useState<string | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showXmlHint, setShowXmlHint] = useState(false);

  // Populate fields when agent is loaded
  useEffect(() => {
    if (sourceAgent) {
      setName(sourceAgent.name);
      setEmoji(sourceAgent.emoji);
      setRole(sourceAgent.role);
      setModel(sourceAgent.model as GeminiModel);
      setTemperature(sourceAgent.temperature);
      setSystemPrompt(sourceAgent.systemPrompt);
      setColor(sourceAgent.color);
      setRouteOutputTo(sourceAgent.routeOutputTo);
    }
  }, [sourceAgent?.id, open]);

  if (!open || !sourceAgent) return null;

  const handleSave = () => {
    if (!name.trim()) return;
    const updates: Partial<Agent> = {
      name: name.trim(),
      emoji,
      role: role.trim(),
      model,
      temperature,
      systemPrompt: systemPrompt.trim(),
      color,
      routeOutputTo,
    };

    if (isChatInstance) {
      updateChatAgent(chatId!, agentId, updates);
    } else {
      updateTemplate(agentId, updates);
    }
    onClose();
  };

  const handleDelete = () => {
    if (isChatInstance) {
      removeChatAgent(chatId!, agentId);
    } else {
      deleteTemplate(agentId);
    }
    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 'var(--z-modal)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={onClose}
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
      />

      <div
        data-testid="modal-edit-agent"
        style={{
          position: 'relative',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
          borderRadius: '20px 20px 0 0',
          width: '100%',
          maxWidth: 640,
          maxHeight: '92vh',
          overflow: 'auto',
          padding: '24px 24px 36px',
          boxShadow: 'var(--shadow-modal)',
          animation: 'agent-enter 280ms var(--ease-glass)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={headingStyle}>Edit Agent</h2>
          <button onClick={onClose} style={iconBtnStyle} data-testid="button-close-edit">
            <X size={18} />
          </button>
        </div>

        {/* Context notice */}
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20,
            background: isChatInstance ? 'var(--color-warning-subtle)' : 'var(--color-primary-subtle)',
            border: `1px solid ${isChatInstance ? 'rgba(245,158,11,0.25)' : 'var(--border-accent)'}`,
            borderRadius: 'var(--radius-base)', padding: '8px 12px',
          }}
        >
          <AlertTriangle size={13} style={{ color: isChatInstance ? 'var(--color-warning)' : 'var(--color-primary)', flexShrink: 0 }} />
          <p style={{ margin: 0, fontSize: 12, color: isChatInstance ? 'var(--color-warning)' : 'var(--color-primary)', fontFamily: 'var(--font-body)' }}>
            {isChatInstance
              ? 'This edit only affects this chat — the library template is unchanged.'
              : 'Changes apply to the library template — future chats will use the updated version.'}
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Emoji + Name */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <div style={{ flexShrink: 0 }}>
              <label style={labelStyle}>Emoji</label>
              <div style={{ position: 'relative' }}>
                <button
                  data-testid="button-emoji-picker-edit"
                  onClick={() => setShowEmojiPicker((p) => !p)}
                  style={{
                    width: 56, height: 56, borderRadius: 12,
                    border: '1px solid var(--border-default)',
                    background: 'var(--bg-surface-elevated)',
                    cursor: 'pointer', fontSize: 24,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  {emoji}
                </button>
                {showEmojiPicker && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, zIndex: 10,
                    background: 'var(--bg-surface-overlay)', border: '1px solid var(--border-default)',
                    borderRadius: 12, padding: 10, display: 'grid',
                    gridTemplateColumns: 'repeat(6, 1fr)', gap: 4, width: 210, marginTop: 4,
                    boxShadow: 'var(--shadow-dropdown)',
                  }}>
                    {EMOJI_OPTIONS.map((e) => (
                      <button key={e} onClick={() => { setEmoji(e); setShowEmojiPicker(false); }}
                        style={{
                          width: 32, height: 32, borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 18,
                          background: emoji === e ? 'var(--color-primary-subtle)' : 'none',
                        }}
                      >{e}</button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Agent Name</label>
              <input
                data-testid="input-edit-agent-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>

          {/* Role */}
          <div>
            <label style={labelStyle}>Role / Description</label>
            <textarea
              value={role}
              onChange={(e) => setRole(e.target.value)}
              rows={2}
              style={{ ...inputStyle, height: 'auto', resize: 'vertical', paddingTop: 10, paddingBottom: 10 }}
            />
          </div>

          {/* Model */}
          <div>
            <label style={labelStyle}>Model</label>
            <ModelSelector value={model} onChange={setModel} />
          </div>

          {/* Temperature */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <label style={labelStyle}>Temperature</label>
              <span style={{ fontSize: 13, fontFamily: 'var(--font-numeric)', color: 'var(--color-primary)' }}>
                {temperature.toFixed(1)}
              </span>
            </div>
            <input
              type="range" min={0} max={1} step={0.05} value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--color-primary)' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--text-quaternary)' }}>0.0 — Precise</span>
              <span style={{ fontSize: 11, color: 'var(--text-quaternary)' }}>1.0 — Creative</span>
            </div>
          </div>

          {/* System Prompt */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <label style={{ ...labelStyle, margin: 0 }}>System Prompt</label>
              <button onClick={() => setShowXmlHint((p) => !p)}
                style={{ background: 'none', border: 'none', color: 'var(--text-quaternary)', cursor: 'pointer', padding: 0 }}>
                <Info size={13} />
              </button>
            </div>
            {showXmlHint && (
              <div style={{
                background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-base)', padding: '10px 14px', marginBottom: 10,
                fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', lineHeight: 1.6,
              }}>
                {`<role>Expert Name</role>\n<rules>\n  Rule 1\n</rules>`}
              </div>
            )}
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={5}
              style={{ ...inputStyle, height: 'auto', resize: 'vertical', paddingTop: 10, paddingBottom: 10, fontFamily: 'var(--font-mono)', fontSize: 13 }}
            />
          </div>

          {/* Routing */}
          {chatAgentList.length > 0 && (
            <AgentRoutingPicker
              value={routeOutputTo}
              onChange={setRouteOutputTo}
              agents={chatAgentList}
            />
          )}

          {/* Color */}
          <div>
            <label style={labelStyle}>Color</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {AGENT_COLORS.map((c) => (
                <button key={c} onClick={() => setColor(c)}
                  style={{
                    width: 28, height: 28, borderRadius: '50%', background: c, cursor: 'pointer',
                    border: color === c ? '3px solid white' : '3px solid transparent',
                    boxShadow: color === c ? `0 0 0 2px ${c}` : 'none', transition: 'all 150ms',
                  }}
                />
              ))}
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'center', paddingTop: 4 }}>
            <DeleteAgentButton agentName={name} onConfirm={handleDelete} />
            <div style={{ display: 'flex', gap: 10 }}>
              <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
              <PrimaryButton onClick={handleSave} disabled={!name.trim()} data-testid="button-save-agent">
                Save Changes
              </PrimaryButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const headingStyle: React.CSSProperties = {
  margin: 0, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, color: 'var(--text-primary)',
};
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700,
  letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-quaternary)', marginBottom: 8,
};
const inputStyle: React.CSSProperties = {
  width: '100%', background: 'var(--bg-surface-sunken)', border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-base)', padding: '0 12px', height: 42, fontSize: 14,
  color: 'var(--text-primary)', fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box',
};
const iconBtnStyle: React.CSSProperties = {
  width: 36, height: 36, border: 'none', background: 'none', color: 'var(--text-tertiary)',
  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8,
};
