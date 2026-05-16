import { ChevronDown } from 'lucide-react';
import { useSettingsStore } from '@/lib/store/settingsStore';

const MODEL_OPTIONS = [
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', badge: 'Fast · Free', hint: '~1M context, low latency' },
  { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', badge: 'Smart', hint: 'Best reasoning quality' },
  { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', badge: 'Stable', hint: 'Reliable, battle-tested' },
  { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash', badge: 'Legacy', hint: 'Older generation' },
];

const TEMPERATURE_PRESETS = [
  { label: 'Precise', value: 0.0 },
  { label: 'Balanced', value: 0.7 },
  { label: 'Creative', value: 1.3 },
];

export function ModelDefaults() {
  const { settings, updateSettings } = useSettingsStore();

  const settingsAny = settings as unknown as Record<string, unknown>;
  const defaultTemperature =
    typeof settingsAny.defaultTemperature === 'number'
      ? (settingsAny.defaultTemperature as number)
      : 0.7;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <p style={labelStyle}>Default Model</p>
        <p style={hintStyle}>Fallback model used for new agents when none is explicitly set.</p>
        <div style={{ position: 'relative', marginTop: 10 }}>
          <select
            data-testid="select-default-model"
            value={settings.defaultModel}
            onChange={(e) => updateSettings({ defaultModel: e.target.value })}
            style={selectStyle}
          >
            {MODEL_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label} ({opt.badge})
              </option>
            ))}
          </select>
          <ChevronDown
            size={15}
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
        {/* detail hint for selected model */}
        {MODEL_OPTIONS.find((o) => o.value === settings.defaultModel)?.hint && (
          <p style={{ ...hintStyle, marginTop: 6, color: 'var(--color-primary)', opacity: 0.8 }}>
            {MODEL_OPTIONS.find((o) => o.value === settings.defaultModel)!.hint}
          </p>
        )}
      </div>

      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <p style={labelStyle}>Default Temperature</p>
          <span
            style={{
              fontSize: 13,
              fontFamily: 'var(--font-numeric)',
              fontWeight: 700,
              color: 'var(--color-primary)',
              background: 'var(--color-primary-subtle)',
              borderRadius: 6,
              padding: '2px 8px',
            }}
          >
            {defaultTemperature.toFixed(1)}
          </span>
        </div>
        <p style={hintStyle}>Controls creativity vs. precision for new agents.</p>
        <input
          data-testid="input-default-temperature"
          type="range"
          min={0}
          max={2}
          step={0.1}
          value={defaultTemperature}
          onChange={(e) =>
            updateSettings({ defaultTemperature: parseFloat(e.target.value) } as unknown as Parameters<typeof updateSettings>[0])
          }
          style={{ width: '100%', accentColor: 'var(--color-primary)', marginTop: 10, cursor: 'pointer' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
          {TEMPERATURE_PRESETS.map((p) => (
            <button
              key={p.value}
              onClick={() =>
                updateSettings({ defaultTemperature: p.value } as unknown as Parameters<typeof updateSettings>[0])
              }
              style={{
                background:
                  Math.abs(defaultTemperature - p.value) < 0.05
                    ? 'var(--color-primary-subtle)'
                    : 'var(--bg-surface-elevated)',
                border: '1px solid var(--border-default)',
                borderRadius: 6,
                padding: '3px 10px',
                fontSize: 11,
                fontFamily: 'var(--font-body)',
                color:
                  Math.abs(defaultTemperature - p.value) < 0.05
                    ? 'var(--color-primary)'
                    : 'var(--text-tertiary)',
                cursor: 'pointer',
                transition: 'all 120ms',
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 13,
  fontFamily: 'var(--font-display)',
  fontWeight: 600,
  color: 'var(--text-primary)',
};

const hintStyle: React.CSSProperties = {
  margin: '4px 0 0',
  fontSize: 12,
  fontFamily: 'var(--font-body)',
  color: 'var(--text-tertiary)',
  lineHeight: 1.5,
};

const selectStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 340,
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
  boxSizing: 'border-box',
};
