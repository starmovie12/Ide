import { useState } from 'react';
import { Plus, ExternalLink, Key, CheckCircle2, XCircle } from 'lucide-react';
import { APIKeyRow } from './APIKeyRow';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { useAPIKeyStore } from '@/lib/store/apiKeyStore';
import { StatusDot } from '@/components/ui/StatusDot';

export function APIKeyManager() {
  const { keys, addKey, removeKey, testKey } = useAPIKeyStore();
  const [showAdd, setShowAdd] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newKey, setNewKey] = useState('');
  const [error, setError] = useState('');
  const [addAndTest, setAddAndTest] = useState(false);
  const [addResult, setAddResult] = useState<{ success: boolean; msg: string } | null>(null);
  const [adding, setAdding] = useState(false);

  const activeCount = keys.filter((k) => k.status === 'active').length;
  const warningCount = keys.filter((k) => k.status === 'warning').length;
  const deadCount = keys.filter((k) => k.status === 'dead').length;

  const handleAdd = async () => {
    if (!newKey.trim()) { setError('API key is required.'); return; }
    if (!newLabel.trim()) { setError('Label is required.'); return; }
    if (!newKey.trim().startsWith('AIza')) { setError('Gemini API keys start with "AIza". Check your key.'); return; }

    setAdding(true);
    setAddResult(null);

    const id = addKey(newKey.trim(), newLabel.trim());

    if (addAndTest) {
      const result = await testKey(id);
      setAddResult({
        success: result.success,
        msg: result.success
          ? `✓ Key verified in ${result.latencyMs}ms`
          : `✗ Test failed: ${result.error}`,
      });
    }

    setAdding(false);
    setNewKey('');
    setNewLabel('');
    setError('');
    if (!addAndTest) {
      setShowAdd(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <h2 style={{ margin: '0 0 4px', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20, color: 'var(--text-primary)' }}>
            API Keys
          </h2>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', lineHeight: 1.5 }}>
            Multiple keys rotate automatically on 429 errors.
            Keys are stored locally and never sent to any server.
          </p>
        </div>
        <SecondaryButton size="sm" onClick={() => { setShowAdd(true); setAddResult(null); }}>
          <Plus size={14} />
          Add Key
        </SecondaryButton>
      </div>

      {/* Stats row */}
      {keys.length > 0 && (
        <div style={{ display: 'flex', gap: 16 }}>
          <StatPill label="Active" count={activeCount} status="active" />
          {warningCount > 0 && <StatPill label="Warning" count={warningCount} status="warning" />}
          {deadCount > 0 && <StatPill label="Dead" count={deadCount} status="dead" />}
        </div>
      )}

      {/* Get key link */}
      <a
        href="https://aistudio.google.com/app/apikey"
        target="_blank"
        rel="noopener noreferrer"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--color-primary)', textDecoration: 'none', width: 'fit-content' }}
      >
        <ExternalLink size={12} />
        Get a free Gemini API key at Google AI Studio
      </a>

      {/* Add form */}
      {showAdd && (
        <div
          data-testid="add-key-form"
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-accent)',
            borderRadius: 'var(--radius-card)',
            padding: 18,
            display: 'flex', flexDirection: 'column', gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Key size={14} style={{ color: 'var(--color-primary)' }} />
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}>
              New API Key
            </span>
          </div>
          <input
            data-testid="input-key-label"
            placeholder="Label (e.g. Primary Key, Backup 1)"
            value={newLabel}
            onChange={(e) => { setNewLabel(e.target.value); setError(''); }}
            style={inputStyle}
          />
          <input
            data-testid="input-key-value"
            type="password"
            placeholder="AIzaSy…"
            value={newKey}
            onChange={(e) => { setNewKey(e.target.value); setError(''); }}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            style={inputStyle}
          />

          {/* Test on add toggle */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={addAndTest}
              onChange={(e) => setAddAndTest(e.target.checked)}
              style={{ accentColor: 'var(--color-primary)', width: 14, height: 14 }}
            />
            <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>
              Test key after adding (sends 1-token request to Gemini)
            </span>
          </label>

          {error && (
            <p style={{ margin: 0, fontSize: 12, color: 'var(--color-destructive)', fontFamily: 'var(--font-body)' }}>
              {error}
            </p>
          )}

          {addResult && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: addResult.success ? 'var(--color-success-subtle)' : 'var(--color-destructive-subtle)',
              border: `1px solid ${addResult.success ? 'rgba(74,222,128,0.3)' : 'rgba(239,68,68,0.3)'}`,
              borderRadius: 'var(--radius-base)', padding: '8px 12px',
            }}>
              {addResult.success
                ? <CheckCircle2 size={14} style={{ color: 'var(--color-success)' }} />
                : <XCircle size={14} style={{ color: 'var(--color-destructive)' }} />}
              <span style={{ fontSize: 13, color: addResult.success ? 'var(--color-success)' : 'var(--color-destructive)', fontFamily: 'var(--font-body)' }}>
                {addResult.msg}
              </span>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <SecondaryButton size="sm" onClick={() => { setShowAdd(false); setError(''); setAddResult(null); }}>
              Cancel
            </SecondaryButton>
            <PrimaryButton size="sm" onClick={handleAdd} disabled={adding}>
              {adding ? 'Saving…' : addAndTest ? 'Save & Test' : 'Save Key'}
            </PrimaryButton>
            {addResult && (
              <SecondaryButton size="sm" onClick={() => { setShowAdd(false); setAddResult(null); }}>
                Done
              </SecondaryButton>
            )}
          </div>
        </div>
      )}

      {/* Key list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {keys.length === 0 && !showAdd && (
          <div style={{
            textAlign: 'center', padding: '40px 20px',
            border: '1px dashed var(--border-strong)', borderRadius: 'var(--radius-card)',
          }}>
            <Key size={32} style={{ color: 'var(--text-quaternary)', marginBottom: 12 }} />
            <p style={{ margin: '0 0 8px', fontSize: 14, color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>
              No API keys yet
            </p>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-quaternary)', fontFamily: 'var(--font-body)' }}>
              Add a Gemini API key to start using AI agents.
            </p>
          </div>
        )}
        {keys.map((k) => (
          <APIKeyRow key={k.id} entry={k} onRemove={removeKey} onTest={testKey} />
        ))}
      </div>

      {/* Info banner */}
      {keys.length >= 2 && (
        <div style={{
          background: 'var(--color-info-subtle)', border: '1px solid rgba(56,189,248,0.2)',
          borderRadius: 'var(--radius-base)', padding: '10px 14px',
          fontSize: 12, color: 'var(--color-info)', fontFamily: 'var(--font-body)', lineHeight: 1.5,
        }}>
          💡 {keys.length} keys in rotation. Keys failing 3+ times in 5 minutes are automatically skipped.
          Add more keys for higher throughput (Gemini free tier = 15 req/min per key).
        </div>
      )}
    </div>
  );
}

function StatPill({ label, count, status }: { label: string; count: number; status: 'active' | 'warning' | 'dead' }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-full)', padding: '4px 10px',
    }}>
      <StatusDot variant={status} size={7} pulse={status === 'active'} />
      <span style={{ fontSize: 12, fontFamily: 'var(--font-body)', color: 'var(--text-secondary)' }}>
        {count} {label}
      </span>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', background: 'var(--bg-surface-sunken)', border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-base)', padding: '0 12px', height: 42,
  fontSize: 14, color: 'var(--text-primary)', fontFamily: 'var(--font-body)',
  outline: 'none', boxSizing: 'border-box',
};
