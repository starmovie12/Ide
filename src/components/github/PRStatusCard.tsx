/**
 * PR Status Card — Phase 5 §4.9
 * Inline chat card showing the PR status, CI state, and preview URL.
 * Used by ChatArea to render PR events from the orchestrator.
 */

import { ExternalLink, GitPullRequest, CheckCircle, XCircle, Clock, Eye } from 'lucide-react';
import type { PRStatus } from '@/lib/store/runStore';

interface PRStatusCardProps {
  prNumber: number;
  prUrl: string;
  branch: string;
  status: PRStatus;
  previewUrl?: string;
  repoName?: string;
}

const STATUS_CONFIG: Record<
  PRStatus,
  { label: string; color: string; icon: React.ReactNode }
> = {
  open: {
    label: 'Open',
    color: 'var(--color-success)',
    icon: <GitPullRequest size={13} />,
  },
  merged: {
    label: 'Merged',
    color: 'var(--color-primary)',
    icon: <CheckCircle size={13} />,
  },
  closed: {
    label: 'Closed',
    color: 'var(--text-tertiary)',
    icon: <XCircle size={13} />,
  },
  'ci-pending': {
    label: 'CI running…',
    color: 'var(--color-pending)',
    icon: <Clock size={13} />,
  },
  'ci-success': {
    label: 'CI passed',
    color: 'var(--color-success)',
    icon: <CheckCircle size={13} />,
  },
  'ci-failed': {
    label: 'CI failed',
    color: 'var(--color-destructive)',
    icon: <XCircle size={13} />,
  },
  'preview-ready': {
    label: 'Preview ready',
    color: 'var(--color-success)',
    icon: <Eye size={13} />,
  },
};

export function PRStatusCard({
  prNumber,
  prUrl,
  branch,
  status,
  previewUrl,
  repoName,
}: PRStatusCardProps) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.open;

  return (
    <div
      role="article"
      aria-label={`Pull Request #${prNumber}`}
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-card)',
        padding: '12px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        maxWidth: 420,
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <GitPullRequest size={14} style={{ color: cfg.color, flexShrink: 0 }} />
        <a
          href={prUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: 'var(--text-primary)',
            fontWeight: 600,
            fontSize: 13,
            textDecoration: 'none',
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          PR #{prNumber} {repoName ? `· ${repoName}` : ''}
        </a>
        <ExternalLink size={11} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
      </div>

      {/* Branch */}
      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
        {branch}
      </div>

      {/* Status pill */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ color: cfg.color, display: 'flex', alignItems: 'center' }}>
          {cfg.icon}
        </span>
        <span style={{ fontSize: 12, color: cfg.color, fontWeight: 500 }}>{cfg.label}</span>
      </div>

      {/* Preview link */}
      {previewUrl && (
        <a
          href={previewUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            fontSize: 12,
            color: 'var(--text-link)',
            textDecoration: 'none',
            fontWeight: 500,
          }}
        >
          <Eye size={12} />
          Live preview ↗
        </a>
      )}
    </div>
  );
}
