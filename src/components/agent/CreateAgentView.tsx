import { useState } from 'react';
import { X, ChevronDown, Info } from 'lucide-react';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { ModelSelector, type GeminiModel } from '@/components/agent/ModelSelector';
import { AgentRoutingPicker } from '@/components/agent/AgentRoutingPicker';
import { useAgentStore } from '@/lib/store/agentStore';
import { useChatStore } from '@/lib/store/chatStore';
import { getRandomEmoji } from '@/lib/utils/emojiPool';
import type { Agent } from '@/lib/store/agentStore';

const EMOJI_OPTIONS = [
  '🤖', '🧠', '⚡', '🔧', '🛠️', '💡', '🎯', '🚀', '🔍', '🐛',
  '✨', '🎨', '📝', '🔬', '⚙️', '🧩', '🎭', '🦾', '💻', '🔮',
  '🦊', '🐉', '🔑', '⭐', '💎', '🌊', '🔥', '❄️', '🌈', '🎲',
];

const AGENT_COLORS = ['#7c6af7', '#4ade80', '#f59e0b', '#38bdf8', '#ec4899'];

interface CreateAgentViewProps {
  open: boolean;
  onClose: () => void;
  /** If provided, the new agent will also be added to this chat (not just the template library) */
  chatId?: string | null;
}

export function CreateAgentView({ open, onClose, chatId }: CreateAgentViewProps) {
  const { addTemplate, addAgentToChat, chatAgents } = useAgentStore();
  const { activeChatId } = useChatStore();

  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState(() => getRandomEmoji());
  const [role, setRole] = useState('');
  const [model, setModel] = useState<GeminiModel>('gemini-2.5-flash');
  const [temperature, setTemperature] = useState(0.7);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [color, setColor] = useState(AGENT_COLORS[0]);
  const [routeOutputTo, setRouteOutputTo] = useState<string | null>(null);
  const [saveToLibrary, setSaveToLibrary] = useState(true);
  const [useInChat, setUseInChat] = useState(true);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showXmlHint, setShowXmlHint] = useState(false);

  const targetChatId = chatId ?? activeChatId;
  const chatAgentList = targetChatId ? (chatAgents[targetChatId] ?? []) : [];

  if (!open) return null;

  const handleCreate = () => {
    if (!name.trim()) return;
    const base: Omit<Agent, 'id' | 'createdAt' | 'updatedAt'> = {
      name: name.trim(),
      emoji,
      role: role.trim(),
      model,
      systemPrompt: systemPrompt.trim(),
      temperature,
      routeOutputTo,
      isTemplate: true,
      isDefault: false,
      color,
      order: 0,
      active: false,
    };

    let newId: string | null = null;

    if (saveToLibrary) {
      newId = addTemplate(base);
    }

    if (useInChat && targetChatId) {
      const agentToAdd: Agent = {
        ...base,
        id: newId ?? crypto.randomUUID(),
        isTemplate: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      addAgentToChat(targetChatId, agentToAdd);
    }

    onClose();
    resetForm();
  };

  const resetForm = () => {
    setName('');
    setEmoji(getRandomEmoji());
    setRole('');
    setSystemPrompt('');
    setTemperature(0.7);
    setRouteOutputTo(null);
    setSaveToLibrary(true);
    setUseInChat(true);
    setColor(AGENT_COLORS[0]);
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
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.75)',
          backdropFilter: 'blur(6px)',
        }}
      />

      {/* Sheet */}
      <div
        data-testid="modal-create-agent"
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h2 style={headingStyle}>Create Agent</h2>
            <p style={{ margin: '3px 0 0', fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>
              Build a custom AI agent for your workflow.
            </p>
          </div>
          <button onClick={onClose} style={iconBtnStyle} data-testid="button-close-create">
            <X size={18} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Emoji + Name */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <div style={{ flexShrink: 0 }}>
              <label style={labelStyle}>Emoji</label>
              <div style={{ position: 'relative' }}>
                <button
                  data-testid="button-emoji-picker"
                  onClick={() => setShowEmojiPicker((p) => !p)}
                  style={{
                    width: 56, height: 56, borderRadius: 12,
                    border: '1px solid var(--border-default)',
                    background: 'var(--bg-surface-elevated)',
                    cursor: 'pointer', fontSize: 24,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'border-color 150ms',
                  }}
                >
                  {emoji}
                </button>
                {showEmojiPicker && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, zIndex: 10,
                    background: 'var(--bg-surface-overlay)',
                    border: '1px solid var(--border-default)', borderRadius: 12,
                    padding: 10, display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)',
                    gap: 4, width: 210, marginTop: 4, boxShadow: 'var(--shadow-dropdown)',
                  }}>
                    {EMOJI_OPTIONS.map((e) => (
                      <button
                        key={e}
                        onClick={() => { setEmoji(e); setShowEmojiPicker(false); }}
                        style={{
                          width: 32, height: 32, borderRadius: 6,
                          border: 'none', cursor: 'pointer', fontSize: 18,
                          background: emoji === e ? 'var(--color-primary-subtle)' : 'none',
                          transition: 'background 100ms',
                        }}
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Agent Name</label>
              <input
                data-testid="input-agent-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Python Expert"
                style={inputStyle}
                autoFocus
              />
            </div>
          </div>

          {/* Role */}
          <div>
            <label style={labelStyle}>Role / Description</label>
            <textarea
              data-testid="textarea-agent-role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="What does this agent specialise in?"
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
              data-testid="input-temperature"
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
              <button
                onClick={() => setShowXmlHint((p) => !p)}
                style={{ background: 'none', border: 'none', color: 'var(--text-quaternary)', cursor: 'pointer', padding: 0 }}
                title="XML prompt hint"
              >
                <Info size={13} />
              </button>
            </div>
            {showXmlHint && (
              <div style={{
                background: 'var(--bg-surface-elevated)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-base)',
                padding: '10px 14px',
                marginBottom: 10,
                fontSize: 12,
                color: 'var(--text-secondary)',
                fontFamily: 'var(--font-mono)',
                lineHeight: 1.6,
              }}>
                {`<role>Expert Name</role>\n<rules>\n  Rule 1\n  Rule 2\n</rules>\n<output>Format instructions</output>`}
              </div>
            )}
            <textarea
              data-testid="textarea-system-prompt"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="You are an expert... Use XML tags for structured prompts."
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
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  style={{
                    width: 28, height: 28, borderRadius: '50%', background: c,
                    border: color === c ? '3px solid white' : '3px solid transparent',
                    cursor: 'pointer',
                    boxShadow: color === c ? `0 0 0 2px ${c}` : 'none',
                    transition: 'all 150ms',
                  }}
                />
              ))}
            </div>
          </div>

          {/* Toggles */}
          <div style={{
            display: 'flex', flexDirection: 'column', gap: 12,
            background: 'var(--bg-surface-elevated)',
            border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-card)',
            padding: '14px 16px',
          }}>
            <ToggleRow
              label="Save to Library"
              hint="Available in future chats and Settings"
              checked={saveToLibrary}
              onChange={setSaveToLibrary}
              testId="toggle-save-library"
            />
            {targetChatId && (
              <ToggleRow
                label="Use in this chat"
                hint="Add to the current chat immediately"
                checked={useInChat}
                onChange={setUseInChat}
                testId="toggle-use-chat"
              />
            )}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }}>
            <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
            <PrimaryButton
              onClick={handleCreate}
              disabled={!name.trim()}
              data-testid="button-create-agent-submit"
            >
              {saveToLibrary && useInChat ? 'Save & Add to Chat' :
               saveToLibrary ? 'Save to Library' :
               useInChat ? 'Add to Chat' : 'Create'}
            </PrimaryButton>
          </div>
        </div>
      </div>
    </div>
  );
}

function ToggleRow({
  label, hint, checked, onChange, testId,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  testId?: string;
}) {
  return (
    <label
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        cursor: 'pointer', gap: 12,
      }}
    >
      <div>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}>
          {label}
        </p>
        <p style={{ margin: 0, fontSize: 11, color: 'var(--text-quaternary)', fontFamily: 'var(--font-body)' }}>
          {hint}
        </p>
      </div>
      <button
        role="switch"
        aria-checked={checked}
        data-testid={testId}
        onClick={() => onChange(!checked)}
        style={{
          width: 40, height: 22, borderRadius: 11,
          border: 'none', cursor: 'pointer',
          background: checked ? 'var(--color-primary)' : 'var(--border-strong)',
          position: 'relative', flexShrink: 0,
          transition: 'background 200ms',
        }}
      >
        <span
          style={{
            position: 'absolute', top: 3,
            left: checked ? 21 : 3,
            width: 16, height: 16, borderRadius: '50%',
            background: 'white', transition: 'left 200ms var(--ease-glass)',
          }}
        />
      </button>
    </label>
  );
}

const headingStyle: React.CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-display)',
  fontWeight: 700,
  fontSize: 18,
  color: 'var(--text-primary)',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontFamily: 'var(--font-display)',
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--text-quaternary)',
  marginBottom: 8,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--bg-surface-sunken)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-base)',
  padding: '0 12px',
  height: 42,
  fontSize: 14,
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-body)',
  outline: 'none',
  boxSizing: 'border-box',
};

const iconBtnStyle: React.CSSProperties = {
  width: 36, height: 36, border: 'none', background: 'none',
  color: 'var(--text-tertiary)', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  borderRadius: 8,
};
