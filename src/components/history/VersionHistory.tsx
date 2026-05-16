import { Clock, RotateCcw, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { useHistoryStore } from '@/lib/store/historyStore';

export function VersionHistory() {
  const { snapshots, restoreSnapshot } = useHistoryStore();
  const [expanded, setExpanded] = useState<string | null>(null);

  function formatTime(ts: number): string {
    const diff = Date.now() - ts;
    if (diff < 60_000) return 'Just now';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  return (
    <div
      data-testid="version-history"
      style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <Clock size={13} style={{ color: 'var(--text-quaternary)' }} />
        <span
          style={{
            fontSize: 10,
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--text-quaternary)',
          }}
        >
          Version History
        </span>
        <span
          style={{
            fontSize: 10,
            background: 'var(--bg-surface-overlay)',
            color: 'var(--text-quaternary)',
            padding: '1px 6px',
            borderRadius: 'var(--radius-full)',
            marginLeft: 'auto',
          }}
        >
          {snapshots.length}/20
        </span>
      </div>

      {snapshots.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '24px 16px',
            border: '1px dashed var(--border-strong)',
            borderRadius: 'var(--radius-card)',
          }}
        >
          <Clock size={24} style={{ color: 'var(--text-quaternary)', marginBottom: 8 }} />
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-quaternary)', fontFamily: 'var(--font-body)' }}>
            Snapshots auto-save on "Accept All"
          </p>
        </div>
      ) : (
        [...snapshots].reverse().map((snap, idx) => (
          <div
            key={snap.id}
            data-testid={`version-${snap.id}`}
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-base)',
              overflow: 'hidden',
            }}
          >
            <button
              onClick={() => setExpanded(expanded === snap.id ? null : snap.id)}
              className="flex items-center gap-3 w-full text-left transition-colors hover:bg-[var(--bg-surface-elevated)]"
              style={{ padding: '10px 12px', border: 'none', background: 'none', cursor: 'pointer' }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                  background: 'var(--bg-surface-elevated)',
                  border: '1px solid var(--border-subtle)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 11,
                  fontFamily: 'var(--font-numeric)',
                  color: 'var(--text-quaternary)',
                  flexShrink: 0,
                }}
              >
                v{snapshots.length - idx}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--text-primary)', fontWeight: 500, fontFamily: 'var(--font-body)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {snap.description || 'Snapshot'}
                </p>
                <p style={{ margin: 0, fontSize: 11, color: 'var(--text-quaternary)', fontFamily: 'var(--font-body)' }}>
                  {formatTime(snap.timestamp)} · {Object.keys(snap.files).length} file{Object.keys(snap.files).length !== 1 ? 's' : ''}
                </p>
              </div>
              <ChevronRight
                size={14}
                style={{
                  color: 'var(--text-quaternary)',
                  transform: expanded === snap.id ? 'rotate(90deg)' : 'none',
                  transition: 'transform var(--motion-base)',
                  flexShrink: 0,
                }}
              />
            </button>

            {expanded === snap.id && (
              <div style={{ padding: '0 12px 12px', borderTop: '1px solid var(--border-subtle)' }}>
                {/* File list */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 10, marginBottom: 12 }}>
                  {Object.keys(snap.files).map((path) => (
                    <div key={path} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-success)', flexShrink: 0 }} />
                      <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-code)' }}>{path}</span>
                    </div>
                  ))}
                </div>
                <button
                  data-testid={`btn-restore-${snap.id}`}
                  onClick={() => restoreSnapshot(snap.id)}
                  className="flex items-center gap-2 rounded-lg transition-colors hover:bg-[var(--bg-surface-overlay)]"
                  style={{
                    padding: '6px 12px',
                    border: '1px solid var(--border-default)',
                    background: 'none',
                    color: 'var(--color-primary)',
                    fontSize: 12,
                    fontFamily: 'var(--font-body)',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  <RotateCcw size={12} />
                  Restore this version
                </button>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
