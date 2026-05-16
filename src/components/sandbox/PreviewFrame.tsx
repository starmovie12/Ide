/**
 * PreviewFrame — Phase 5 §4.1
 * Displays the WebContainer dev server URL in an iframe,
 * or a Vercel/CF preview URL in cloud-mode.
 * Used inside RightPanel when a preview URL is available.
 */

import { useState } from 'react';
import { RefreshCw, ExternalLink, Monitor } from 'lucide-react';

interface PreviewFrameProps {
  /** The URL to display — either localhost (WC) or Vercel/CF Pages */
  url: string | null;
  /** Title shown in the toolbar */
  title?: string;
  /** Height of the iframe in px; defaults to '100%' */
  height?: number | string;
}

export function PreviewFrame({ url, title = 'Preview', height = '100%' }: PreviewFrameProps) {
  const [key, setKey] = useState(0);

  function refresh() {
    setKey((k) => k + 1);
  }

  if (!url) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: typeof height === 'number' ? `${height}px` : height,
          gap: 12,
          color: 'var(--text-tertiary)',
        }}
        aria-label="No preview available"
      >
        <Monitor size={28} style={{ opacity: 0.4 }} />
        <p style={{ margin: 0, fontSize: 13 }}>Preview will appear after a successful run</p>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: typeof height === 'number' ? `${height}px` : height,
        overflow: 'hidden',
      }}
    >
      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 10px',
          background: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border-default)',
          flexShrink: 0,
        }}
      >
        {/* URL pill */}
        <div
          style={{
            flex: 1,
            background: 'var(--bg-surface-sunken)',
            borderRadius: 'var(--radius-md)',
            padding: '4px 10px',
            fontSize: 11,
            color: 'var(--text-secondary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontFamily: 'var(--font-mono)',
          }}
          title={url}
        >
          {url}
        </div>

        {/* Refresh */}
        <button
          onClick={refresh}
          aria-label="Refresh preview"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28,
            height: 28,
            background: 'transparent',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-base)',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
          }}
        >
          <RefreshCw size={12} />
        </button>

        {/* Open in new tab */}
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open preview in new tab"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28,
            height: 28,
            background: 'transparent',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-base)',
            color: 'var(--text-secondary)',
            textDecoration: 'none',
          }}
        >
          <ExternalLink size={12} />
        </a>
      </div>

      {/* iframe */}
      <iframe
        key={key}
        src={url}
        title={title}
        style={{
          flex: 1,
          border: 'none',
          width: '100%',
          background: '#fff',
        }}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
        allow="cross-origin-isolated"
        aria-label={`${title} preview`}
      />
    </div>
  );
}
