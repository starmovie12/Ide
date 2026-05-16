import { useState } from 'react';
import { X, ChevronDown } from 'lucide-react';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { useAgentStore } from '@/lib/store/agentStore';
import { getRandomEmoji } from '@/lib/utils/emojiPool';
import { cn } from '@/lib/utils/cn';

const EMOJI_OPTIONS = [
  '🤖', '🧠', '⚡', '🔧', '🛠️', '💡', '🎯', '🚀', '🔍', '🐛',
  '✨', '🎨', '📝', '🔬', '⚙️', '🧩', '🎭', '🦾', '💻', '🔮',
];

const MODEL_OPTIONS = [
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', badge: 'Fast' },
  { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', badge: 'Smart' },
  { value: 'gemini-3-flash', label: 'Gemini 3 Flash', badge: 'New' },
  { value: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro', badge: 'Preview' },
];

const AGENT_COLORS = [
  '#7c6af7', '#4ade80', '#f59e0b', '#38bdf8', '#ec4899',
];

interface CreateAgentModalProps {
  open: boolean;
  onClose: () => void;
}

export function CreateAgentModal({ open, onClose }: CreateAgentModalProps) {
  const { addAgent } = useAgentStore();
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState(() => getRandomEmoji());
  const [role, setRole] = useState('');
  const [model, setModel] = useState('gemini-2.5-flash');
  const [temperature, setTemperature] = useState(0.7);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [color, setColor] = useState(AGENT_COLORS[0]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  if (!open) return null;

  const handleCreate = () => {
    if (!name.trim()) return;
    addAgent({
      name: name.trim(),
      emoji,
      role: role.trim(),
      model,
      systemPrompt: systemPrompt.trim(),
      temperature,
      routeOutputTo: null,
      isTemplate: false,
      color,
    });
    onClose();
    setName('');
    setRole('');
    setSystemPrompt('');
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
        padding: '0',
      }}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.7)',
          backdropFilter: 'blur(4px)',
        }}
      />

      {/* Modal */}
      <div
        data-testid="modal-create-agent"
        style={{
          position: 'relative',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
          borderRadius: '20px 20px 0 0',
          width: '100%',
          maxWidth: 600,
          maxHeight: '90vh',
          overflow: 'auto',
          padding: 24,
          boxShadow: 'var(--shadow-modal)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <h2
            style={{
              margin: 0,
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              fontSize: 18,
              color: 'var(--text-primary)',
            }}
          >
            Create Agent
          </h2>
          <button
            data-testid="button-close-modal"
            onClick={onClose}
            className="flex items-center justify-center rounded-lg transition-colors hover:bg-[var(--bg-surface-elevated)]"
            style={{
              width: 36,
              height: 36,
              border: 'none',
              background: 'none',
              color: 'var(--text-tertiary)',
              cursor: 'pointer',
            }}
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Emoji + Name row */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <div style={{ flexShrink: 0 }}>
              <label style={labelStyle}>Emoji</label>
              <div style={{ position: 'relative' }}>
                <button
                  data-testid="button-emoji-picker"
                  onClick={() => setShowEmojiPicker((p) => !p)}
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 12,
                    border: '1px solid var(--border-default)',
                    background: 'var(--bg-surface-elevated)',
                    cursor: 'pointer',
                    fontSize: 24,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {emoji}
                </button>
                {showEmojiPicker && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      zIndex: 10,
                      background: 'var(--bg-surface-overlay)',
                      border: '1px solid var(--border-default)',
                      borderRadius: 12,
                      padding: 10,
                      display: 'grid',
                      gridTemplateColumns: 'repeat(5, 1fr)',
                      gap: 4,
                      width: 180,
                      marginTop: 4,
                    }}
                  >
                    {EMOJI_OPTIONS.map((e) => (
                      <button
                        key={e}
                        onClick={() => { setEmoji(e); setShowEmojiPicker(false); }}
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 6,
                          border: 'none',
                          background: emoji === e ? 'var(--color-primary-subtle)' : 'none',
                          cursor: 'pointer',
                          fontSize: 18,
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
              placeholder="What does this agent do?"
              rows={2}
              style={{ ...inputStyle, resize: 'vertical', paddingTop: 10, paddingBottom: 10 }}
            />
          </div>

          {/* Model */}
          <div>
            <label style={labelStyle}>Model</label>
            <div style={{ position: 'relative' }}>
              <select
                data-testid="select-agent-model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                style={{
                  ...inputStyle,
                  appearance: 'none',
                  paddingRight: 36,
                  cursor: 'pointer',
                }}
              >
                {MODEL_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label} ({opt.badge})
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
          </div>

          {/* Temperature */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <label style={labelStyle}>Temperature</label>
              <span
                style={{
                  fontSize: 13,
                  fontFamily: 'var(--font-numeric)',
                  color: 'var(--color-primary)',
                }}
              >
                {temperature.toFixed(1)}
              </span>
            </div>
            <input
              data-testid="input-temperature"
              type="range"
              min={0}
              max={2}
              step={0.1}
              value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--color-primary)' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--text-quaternary)' }}>Precise</span>
              <span style={{ fontSize: 11, color: 'var(--text-quaternary)' }}>Creative</span>
            </div>
          </div>

          {/* System Prompt */}
          <div>
            <label style={labelStyle}>System Prompt</label>
            <textarea
              data-testid="textarea-system-prompt"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="You are an expert... Describe how this agent should behave."
              rows={4}
              style={{ ...inputStyle, resize: 'vertical', paddingTop: 10, paddingBottom: 10 }}
            />
          </div>

          {/* Color */}
          <div>
            <label style={labelStyle}>Color</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {AGENT_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    background: c,
                    border: color === c ? `3px solid white` : '3px solid transparent',
                    cursor: 'pointer',
                    boxShadow: color === c ? `0 0 0 2px ${c}` : 'none',
                    transition: 'all 150ms',
                  }}
                />
              ))}
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
            <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
            <PrimaryButton
              onClick={handleCreate}
              disabled={!name.trim()}
              data-testid="button-create-agent-submit"
            >
              Create Agent
            </PrimaryButton>
          </div>
        </div>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontFamily: 'var(--font-display)',
  fontWeight: 600,
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  color: 'var(--text-quaternary)',
  marginBottom: 8,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--bg-surface-sunken)',
  border: '1px solid var(--border-default)',
  borderRadius: 8,
  padding: '0 12px',
  height: 42,
  fontSize: 14,
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-body)',
  outline: 'none',
  boxSizing: 'border-box',
};
