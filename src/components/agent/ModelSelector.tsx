import { ChevronDown, Zap, Brain, Star } from 'lucide-react';

export type GeminiModel =
  | 'gemini-2.5-flash'
  | 'gemini-2.5-pro'
  | 'gemini-2.0-flash'
  | 'gemini-1.5-flash'
  | 'gemini-3-flash'
  | 'gemini-3.1-pro';

interface ModelOption {
  value: GeminiModel;
  label: string;
  badge: string;
  badgeColor: string;
  description: string;
  Icon: React.ComponentType<{ size: number }>;
}

export const MODEL_OPTIONS: ModelOption[] = [
  {
    value: 'gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    badge: 'Fast • Free',
    badgeColor: 'var(--color-success)',
    description: '1M context, fastest',
    Icon: Zap,
  },
  {
    value: 'gemini-2.5-pro',
    label: 'Gemini 2.5 Pro',
    badge: 'Smart',
    badgeColor: 'var(--color-primary)',
    description: '1M context, best quality',
    Icon: Brain,
  },
  {
    value: 'gemini-3-flash',
    label: 'Gemini 3 Flash',
    badge: 'New',
    badgeColor: 'var(--color-accent)',
    description: 'Latest fast model',
    Icon: Zap,
  },
  {
    value: 'gemini-3.1-pro',
    label: 'Gemini 3.1 Pro',
    badge: 'Preview',
    badgeColor: 'var(--text-agent-5)',
    description: 'Latest pro model',
    Icon: Star,
  },
  {
    value: 'gemini-2.0-flash',
    label: 'Gemini 2.0 Flash',
    badge: 'Stable',
    badgeColor: 'var(--text-secondary)',
    description: 'Stable fast model',
    Icon: Zap,
  },
  {
    value: 'gemini-1.5-flash',
    label: 'Gemini 1.5 Flash',
    badge: 'Legacy',
    badgeColor: 'var(--text-quaternary)',
    description: 'Previous gen',
    Icon: Zap,
  },
];

interface ModelSelectorProps {
  value: GeminiModel;
  onChange: (model: GeminiModel) => void;
}

export function ModelSelector({ value, onChange }: ModelSelectorProps) {
  const selected = MODEL_OPTIONS.find((m) => m.value === value) ?? MODEL_OPTIONS[0];

  return (
    <div style={{ position: 'relative' }}>
      <select
        data-testid="model-selector"
        value={value}
        onChange={(e) => onChange(e.target.value as GeminiModel)}
        style={{
          width: '100%',
          background: 'var(--bg-surface-sunken)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-base)',
          padding: '0 36px 0 12px',
          height: 42,
          fontSize: 14,
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-body)',
          outline: 'none',
          appearance: 'none',
          cursor: 'pointer',
        }}
        onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--border-accent)'; }}
        onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border-default)'; }}
      >
        {MODEL_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value} style={{ background: 'var(--bg-surface-overlay)' }}>
            {opt.label} — {opt.badge}
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
      {/* Badge */}
      <span
        style={{
          position: 'absolute',
          right: 36,
          top: '50%',
          transform: 'translateY(-50%)',
          fontSize: 10,
          fontWeight: 700,
          fontFamily: 'var(--font-display)',
          color: selected.badgeColor,
          background: `${selected.badgeColor}18`,
          padding: '2px 6px',
          borderRadius: 'var(--radius-sm)',
          pointerEvents: 'none',
        }}
      >
        {selected.badge}
      </span>
    </div>
  );
}
