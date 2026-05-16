import { useState } from 'react';
import { ArrowLeft, Key, Users, Settings2, Palette, Github } from 'lucide-react';
import { Link } from 'wouter';
import { APIKeyManager } from '@/components/settings/APIKeyManager';
import { DefaultAgentList } from '@/components/settings/DefaultAgentList';
import { ModelDefaults } from '@/components/settings/ModelDefaults';
import { GitHubConnect } from '@/components/settings/GitHubConnect';
import { AgentLibraryModal } from '@/components/agent/AgentLibraryModal';
import { CreateAgentView } from '@/components/agent/CreateAgentView';
import { EditAgentView } from '@/components/agent/EditAgentView';
import { useSettingsStore } from '@/lib/store/settingsStore';
import { useUIStore } from '@/lib/store/uiStore';

const TABS = [
  { id: 'api-keys', label: 'API Keys', Icon: Key },
  { id: 'default-agents', label: 'Default Agents', Icon: Users },
  { id: 'github', label: 'GitHub', Icon: Github },
  { id: 'general', label: 'General', Icon: Settings2 },
  { id: 'appearance', label: 'Appearance', Icon: Palette },
] as const;

type TabId = typeof TABS[number]['id'];

export default function Settings() {
  const [activeTab, setActiveTab] = useState<TabId>('api-keys');
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const { editingAgentId, editingAgentChatId, closeEditAgent } = useUIStore();

  return (
    <div style={{ background: 'var(--bg-base)', color: 'var(--text-primary)', minHeight: '100vh', fontFamily: 'var(--font-body)' }}>
      {/* Header */}
      <header style={{
        height: 'var(--header-h)', background: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border-default)',
        display: 'flex', alignItems: 'center', padding: '0 20px', gap: 16,
        position: 'sticky', top: 0, zIndex: 'var(--z-sticky)',
      }}>
        <Link href="/">
          <button
            data-testid="button-back-home"
            className="flex items-center gap-2 rounded-lg transition-colors hover:bg-[var(--bg-surface-elevated)] px-3 py-2"
            style={{ border: 'none', background: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 14, fontFamily: 'var(--font-body)' }}
          >
            <ArrowLeft size={16} />
            Back
          </button>
        </Link>
        <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, color: 'var(--text-primary)' }}>
          Settings
        </h1>
      </header>

      <div style={{ display: 'flex', maxWidth: 920, margin: '0 auto', padding: '32px 20px', gap: 36 }}>
        {/* Sidebar nav */}
        <nav style={{ width: 188, flexShrink: 0 }}>
          <p style={{ fontSize: 10, fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-quaternary)', marginBottom: 8, marginTop: 0 }}>
            Sections
          </p>
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              data-testid={`nav-section-${id}`}
              onClick={() => setActiveTab(id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                width: '100%', textAlign: 'left',
                padding: '9px 12px', borderRadius: 8, border: 'none',
                background: activeTab === id ? 'var(--color-primary-subtle)' : 'none',
                color: activeTab === id ? 'var(--color-primary)' : 'var(--text-secondary)',
                cursor: 'pointer', fontSize: 14, fontFamily: 'var(--font-body)',
                fontWeight: activeTab === id ? 600 : 400, marginBottom: 2,
                borderLeft: activeTab === id ? '2px solid var(--color-primary)' : '2px solid transparent',
                transition: 'all 150ms',
              }}
            >
              <Icon size={15} style={{ flexShrink: 0 }} />
              {label}
            </button>
          ))}
        </nav>

        {/* Content */}
        <main style={{ flex: 1, minWidth: 0 }}>
          {activeTab === 'api-keys' && <APIKeyManager />}
          {activeTab === 'default-agents' && (
            <DefaultAgentList onAddAgent={() => setLibraryOpen(true)} />
          )}
          {activeTab === 'github' && <GitHubConnect />}
          {activeTab === 'general' && <GeneralSettings />}
          {activeTab === 'appearance' && <AppearanceSettings />}
        </main>
      </div>

      {/* Modals */}
      <AgentLibraryModal
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        onCreateNew={() => { setLibraryOpen(false); setCreateOpen(true); }}
      />
      <CreateAgentView
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />
      {editingAgentId && (
        <EditAgentView
          open={!!editingAgentId}
          onClose={closeEditAgent}
          agentId={editingAgentId}
          chatId={editingAgentChatId}
        />
      )}
    </div>
  );
}

// ── General Settings Tab ──────────────────────────────────────────

function GeneralSettings() {
  const { settings, updateSettings } = useSettingsStore();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      <div>
        <h2 style={sectionHeadingStyle}>General</h2>
        <p style={sectionDescStyle}>Control how the studio behaves.</p>
      </div>

      <SettingsGroup title="Chat Behaviour">
        <ToggleSetting
          label="Send on Enter"
          hint="Press Enter to send. Shift+Enter for new line."
          value={settings.sendOnEnter}
          onChange={(v) => updateSettings({ sendOnEnter: v })}
          testId="toggle-send-enter"
        />
        <ToggleSetting
          label="Streaming Responses"
          hint="Show text as it's generated, character by character."
          value={settings.streamingEnabled}
          onChange={(v) => updateSettings({ streamingEnabled: v })}
          testId="toggle-streaming"
        />
        <ToggleSetting
          label="Auto-Resume on Token Limit"
          hint="Automatically continue when the model hits its output limit."
          value={settings.autoResume}
          onChange={(v) => updateSettings({ autoResume: v })}
          testId="toggle-auto-resume"
        />
        <ToggleSetting
          label="Show Thinking Panel"
          hint="Display agent reasoning and intermediate steps."
          value={settings.showThinkingPanel}
          onChange={(v) => updateSettings({ showThinkingPanel: v })}
          testId="toggle-thinking"
        />
      </SettingsGroup>

      <SettingsGroup title="Default Model">
        <ModelDefaults />
      </SettingsGroup>
    </div>
  );
}

// ── Appearance Settings Tab ───────────────────────────────────────

function AppearanceSettings() {
  const { settings, updateSettings } = useSettingsStore();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      <div>
        <h2 style={sectionHeadingStyle}>Appearance</h2>
        <p style={sectionDescStyle}>Customise how the studio looks and feels.</p>
      </div>

      <SettingsGroup title="Interface">
        <ToggleSetting
          label="Compact Mode"
          hint="Reduce spacing for more information density."
          value={settings.compactMode}
          onChange={(v) => updateSettings({ compactMode: v })}
          testId="toggle-compact"
        />
        <ToggleSetting
          label="Reduce Motion"
          hint="Minimise animations and transitions."
          value={settings.reducedMotion}
          onChange={(v) => updateSettings({ reducedMotion: v })}
          testId="toggle-motion"
        />
      </SettingsGroup>

      <SettingsGroup title="Font Size">
        <div style={{ display: 'flex', gap: 8 }}>
          {(['sm', 'md', 'lg'] as const).map((size) => (
            <button
              key={size}
              data-testid={`font-size-${size}`}
              onClick={() => updateSettings({ fontSize: size })}
              style={{
                padding: '8px 20px', borderRadius: 8, cursor: 'pointer',
                border: `1px solid ${settings.fontSize === size ? 'var(--border-accent)' : 'var(--border-default)'}`,
                background: settings.fontSize === size ? 'var(--color-primary-subtle)' : 'none',
                color: settings.fontSize === size ? 'var(--color-primary)' : 'var(--text-secondary)',
                fontFamily: 'var(--font-body)',
                fontSize: size === 'sm' ? 12 : size === 'md' ? 14 : 16,
                fontWeight: settings.fontSize === size ? 600 : 400, transition: 'all 150ms',
              }}
            >
              {size.toUpperCase()}
            </button>
          ))}
        </div>
      </SettingsGroup>

      <SettingsGroup title="Code Font">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {([
            { id: 'jetbrains', label: 'JetBrains Mono', preview: 'const x = () => {};' },
            { id: 'fira', label: 'Fira Code', preview: 'function run() {}' },
            { id: 'mono', label: 'System Mono', preview: 'console.log("hi");' },
          ] as const).map(({ id, label, preview }) => (
            <button
              key={id}
              data-testid={`code-font-${id}`}
              onClick={() => updateSettings({ codeFont: id })}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 14px', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                border: `1px solid ${settings.codeFont === id ? 'var(--border-accent)' : 'var(--border-default)'}`,
                background: settings.codeFont === id ? 'var(--color-primary-subtle)' : 'none',
                transition: 'all 150ms',
              }}
            >
              <div style={{
                width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                border: `2px solid ${settings.codeFont === id ? 'var(--color-primary)' : 'var(--border-strong)'}`,
                background: settings.codeFont === id ? 'var(--color-primary)' : 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {settings.codeFont === id && <span style={{ color: 'white', fontSize: 10 }}>✓</span>}
              </div>
              <div>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}>{label}</p>
                <p style={{ margin: 0, fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>{preview}</p>
              </div>
            </button>
          ))}
        </div>
      </SettingsGroup>

      <div style={{
        padding: '14px 16px', borderRadius: 'var(--radius-card)',
        background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-subtle)',
      }}>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--text-quaternary)', fontFamily: 'var(--font-body)', lineHeight: 1.5 }}>
          Glass Era V5 Design System · Always dark · Electric purple brand
        </p>
      </div>
    </div>
  );
}

// ── Shared primitives ─────────────────────────────────────────────

function SettingsGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p style={{ margin: '0 0 14px', fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-quaternary)' }}>
        {title}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {children}
      </div>
    </div>
  );
}

function ToggleSetting({
  label, hint, value, onChange, testId,
}: {
  label: string; hint: string; value: boolean;
  onChange: (v: boolean) => void; testId?: string;
}) {
  return (
    <label style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      cursor: 'pointer', gap: 16, padding: '12px 14px',
      background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-base)',
    }}>
      <div>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}>
          {label}
        </p>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--text-quaternary)', fontFamily: 'var(--font-body)' }}>
          {hint}
        </p>
      </div>
      <button
        role="switch"
        aria-checked={value}
        data-testid={testId}
        onClick={() => onChange(!value)}
        style={{
          width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', flexShrink: 0,
          background: value ? 'var(--color-primary)' : 'var(--border-strong)',
          position: 'relative', transition: 'background 200ms',
        }}
      >
        <span style={{
          position: 'absolute', top: 4, left: value ? 23 : 4,
          width: 16, height: 16, borderRadius: '50%', background: 'white',
          transition: 'left 200ms var(--ease-glass)',
        }} />
      </button>
    </label>
  );
}

const sectionHeadingStyle: React.CSSProperties = {
  margin: '0 0 4px', fontFamily: 'var(--font-display)', fontWeight: 700,
  fontSize: 20, color: 'var(--text-primary)',
};
const sectionDescStyle: React.CSSProperties = {
  margin: 0, fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', lineHeight: 1.5,
};
