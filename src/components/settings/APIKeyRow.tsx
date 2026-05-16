import { Eye, EyeOff, Trash2, RefreshCw, CheckCircle2, XCircle } from 'lucide-react';
import { useState } from 'react';
import { StatusDot } from '@/components/ui/StatusDot';
import type { APIKey } from '@/lib/store/apiKeyStore';

interface APIKeyRowProps {
  entry: APIKey;
  onRemove: (id: string) => void;
  onTest?: (id: string) => Promise<{ success: boolean; latencyMs: number; error?: string }>;
}

function maskKey(key: string): string {
  if (key.length <= 8) return '••••••••••••';
  return `${key.slice(0, 6)}${'•'.repeat(Math.min(16, key.length - 10))}${key.slice(-4)}`;
}

function formatLastUsed(ts: number | null): string {
  if (!ts) return 'Never used';
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export function APIKeyRow({ entry, onRemove, onTest }: APIKeyRowProps) {
  const [visible, setVisible] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; msg: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleTest = async () => {
    if (!onTest) return;
    setTesting(true);
    setTestResult(null);
    const result = await onTest(entry.id);
    setTestResult({
      success: result.success,
      msg: result.success ? `${result.latencyMs}ms` : (result.error ?? 'Failed'),
    });
    setTesting(false);
    setTimeout(() => setTestResult(null), 5000);
  };

  return (
    <div
      data-testid={`api-key-row-${entry.id}`}
      style={{
        background: 'var(--bg-surface)',
        border: `1px solid ${entry.status === 'dead' ? 'rgba(239,68,68,0.3)' : entry.status === 'warning' ? 'rgba(245,158,11,0.2)' : 'var(--border-default)'}`,
        borderRadius: 'var(--radius-card)',
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        transition: 'border-color 300ms',
      }}
    >
      {/* Top row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <StatusDot variant={entry.status} pulse={entry.status === 'active'} size={9} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}>
              {entry.label}
            </span>
            <span style={{
              fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-display)',
              color: entry.status === 'active' ? 'var(--color-api-active)'
                : entry.status === 'warning' ? 'var(--color-api-warning)'
                : 'var(--color-api-dead)',
              background: entry.status === 'active' ? 'var(--color-success-subtle)'
                : entry.status === 'warning' ? 'var(--color-warning-subtle)'
                : 'var(--color-destructive-subtle)',
              padding: '1px 6px', borderRadius: 4,
              textTransform: 'uppercase', letterSpacing: '0.05em',
            }}>
              {entry.status}
            </span>
          </div>
          <span style={{ fontSize: 12, color: 'var(--text-quaternary)', fontFamily: 'var(--font-mono)' }}>
            {visible ? entry.key : maskKey(entry.key)}
          </span>
        </div>

        {/* Stats */}
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'var(--font-numeric)' }}>
            {entry.requestCount.toLocaleString()} total
          </p>
          <p style={{ margin: 0, fontSize: 11, color: 'var(--text-quaternary)', fontFamily: 'var(--font-body)' }}>
            {entry.dailyRequests} today · {formatLastUsed(entry.lastUsed)}
          </p>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
          <button
            data-testid={`btn-toggle-key-${entry.id}`}
            onClick={() => setVisible((v) => !v)}
            title={visible ? 'Hide key' : 'Show key'}
            className="flex items-center justify-center rounded transition-colors hover:bg-[var(--bg-surface-elevated)]"
            style={{ width: 32, height: 32, border: 'none', background: 'none', color: 'var(--text-quaternary)', cursor: 'pointer' }}
          >
            {visible ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>

          {onTest && (
            <button
              data-testid={`btn-test-key-${entry.id}`}
              onClick={handleTest}
              disabled={testing}
              title="Test key with 1-token request"
              className="flex items-center justify-center rounded transition-colors hover:bg-[var(--bg-surface-elevated)]"
              style={{ width: 32, height: 32, border: 'none', background: 'none', color: testing ? 'var(--color-primary)' : 'var(--text-quaternary)', cursor: 'pointer' }}
            >
              <RefreshCw size={14} style={{ animation: testing ? 'spin 0.8s linear infinite' : 'none' }} />
            </button>
          )}

          {confirmDelete ? (
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <button
                data-testid={`btn-confirm-delete-${entry.id}`}
                onClick={() => onRemove(entry.id)}
                style={{ padding: '3px 10px', borderRadius: 6, border: 'none', background: 'var(--color-destructive)', color: 'white', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}
              >
                Delete
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                style={{ padding: '3px 8px', borderRadius: 6, border: '1px solid var(--border-default)', background: 'none', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              data-testid={`btn-remove-key-${entry.id}`}
              onClick={() => setConfirmDelete(true)}
              title="Remove key"
              className="flex items-center justify-center rounded transition-colors hover:bg-[var(--color-destructive-subtle)]"
              style={{ width: 32, height: 32, border: 'none', background: 'none', color: 'var(--color-destructive)', cursor: 'pointer' }}
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Test result */}
      {testResult && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 12, fontFamily: 'var(--font-body)',
          color: testResult.success ? 'var(--color-success)' : 'var(--color-destructive)',
        }}>
          {testResult.success
            ? <CheckCircle2 size={13} />
            : <XCircle size={13} />}
          {testResult.success
            ? `Key is healthy — responded in ${testResult.msg}`
            : `Test failed: ${testResult.msg}`}
        </div>
      )}

      {/* Error count warning */}
      {entry.errorCount > 0 && (
        <p style={{ margin: 0, fontSize: 11, color: 'var(--color-warning)', fontFamily: 'var(--font-body)' }}>
          ⚠ {entry.errorCount} error{entry.errorCount !== 1 ? 's' : ''} in the last 5 minutes
        </p>
      )}
    </div>
  );
}
