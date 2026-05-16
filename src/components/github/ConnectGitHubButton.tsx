/**
 * ConnectGitHubButton — Phase 5 §4.6
 * Handles GitHub OAuth initiation + PAT fallback.
 * Uses blueprint store to persist the token.
 */

import { useState } from 'react';
import { Github, Key, X } from 'lucide-react';
import { buildOAuthUrl, fetchGitHubUser, parseOwnerRepo } from '@/lib/github/oauth';
import { useBlueprintStore } from '@/lib/store/blueprintStore';

interface ConnectGitHubButtonProps {
  onConnected?: () => void;
}

export function ConnectGitHubButton({ onConnected }: ConnectGitHubButtonProps) {
  const [showPAT, setShowPAT] = useState(false);
  const [patValue, setPatValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { setGitHubToken, githubToken } = useBlueprintStore();
  const clientId = import.meta.env.VITE_GITHUB_OAUTH_CLIENT_ID as string | undefined;

  function handleOAuth() {
    if (!clientId) {
      setError('GitHub OAuth is not configured. Please use a Personal Access Token instead.');
      setShowPAT(true);
      return;
    }
    const redirectUri = `${window.location.origin}/auth/github/callback`;
    window.location.href = buildOAuthUrl(clientId, redirectUri);
  }

  async function handlePAT() {
    if (!patValue.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const user = await fetchGitHubUser(patValue.trim());
      setGitHubToken(patValue.trim(), user);
      setPatValue('');
      setShowPAT(false);
      onConnected?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to verify token.');
    } finally {
      setLoading(false);
    }
  }

  if (githubToken) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 13,
            color: 'var(--color-success)',
            fontWeight: 500,
          }}
        >
          <Github size={14} />
          Connected
        </span>
        <button
          onClick={() => setGitHubToken(null, null)}
          style={{
            background: 'transparent',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text-tertiary)',
            cursor: 'pointer',
            padding: '2px 6px',
            fontSize: 11,
          }}
          aria-label="Disconnect GitHub"
        >
          Disconnect
        </button>
      </div>
    );
  }

  if (showPAT) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Key size={14} style={{ color: 'var(--text-secondary)' }} />
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Personal Access Token
          </span>
          <button
            onClick={() => { setShowPAT(false); setError(null); }}
            style={{ marginLeft: 'auto', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }}
            aria-label="Close PAT input"
          >
            <X size={14} />
          </button>
        </div>
        <input
          type="password"
          placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
          value={patValue}
          onChange={(e) => setPatValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handlePAT()}
          style={{
            background: 'var(--bg-surface-sunken)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--text-primary)',
            fontSize: 13,
            padding: '7px 10px',
            outline: 'none',
          }}
          aria-label="GitHub Personal Access Token"
        />
        {error && (
          <p style={{ fontSize: 12, color: 'var(--color-destructive)', margin: 0 }}>{error}</p>
        )}
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={handlePAT}
            disabled={loading || !patValue.trim()}
            style={{
              flex: 1,
              background: 'var(--color-primary)',
              color: 'var(--text-on-primary)',
              border: 'none',
              borderRadius: 'var(--radius-base)',
              padding: '7px 12px',
              fontSize: 13,
              fontWeight: 500,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading || !patValue.trim() ? 0.6 : 1,
            }}
          >
            {loading ? 'Verifying…' : 'Connect'}
          </button>
        </div>
        <a
          href="https://github.com/settings/tokens/new?scopes=repo,read:user"
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: 11, color: 'var(--text-link)' }}
        >
          Create a token on GitHub ↗
        </a>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <button
        onClick={handleOAuth}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-base)',
          color: 'var(--text-primary)',
          padding: '8px 14px',
          fontSize: 13,
          fontWeight: 500,
          cursor: 'pointer',
          width: '100%',
          justifyContent: 'center',
        }}
      >
        <Github size={15} />
        Connect GitHub
      </button>
      <button
        onClick={() => setShowPAT(true)}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--text-tertiary)',
          fontSize: 11,
          cursor: 'pointer',
          textDecoration: 'underline',
        }}
      >
        Use a Personal Access Token instead
      </button>
    </div>
  );
}
