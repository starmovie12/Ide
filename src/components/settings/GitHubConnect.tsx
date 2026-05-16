import { useState } from 'react';
import { Github, Link2, Link2Off, RefreshCw, GitBranch, Lock, Unlock } from 'lucide-react';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { useBlueprintStore } from '@/lib/store/blueprintStore';
import { fetchGitHubUser, fetchUserRepos, parseOwnerRepo, type GitHubRepo } from '@/lib/github/oauth';

export function GitHubConnect() {
  const { githubToken, githubUser, setGitHubToken, setGitHubUser } = useBlueprintStore();

  const [showTokenInput, setShowTokenInput] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);

  const isConnected = !!githubToken && !!githubUser;

  async function connectWithToken() {
    if (!tokenInput.trim()) {
      setError('Token is required');
      return;
    }
    setConnecting(true);
    setError('');
    try {
      const user = await fetchGitHubUser(tokenInput.trim());
      setGitHubToken(tokenInput.trim());
      setGitHubUser(user);
      setTokenInput('');
      setShowTokenInput(false);
      loadRepos(tokenInput.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to connect');
    } finally {
      setConnecting(false);
    }
  }

  async function loadRepos(token?: string) {
    const t = token ?? githubToken;
    if (!t) return;
    setLoadingRepos(true);
    try {
      const r = await fetchUserRepos(t);
      setRepos(r.slice(0, 30));
    } catch {
      // ignore
    } finally {
      setLoadingRepos(false);
    }
  }

  function disconnect() {
    setGitHubToken(null);
    setGitHubUser(null);
    setRepos([]);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h2 style={{ margin: '0 0 4px', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20, color: 'var(--text-primary)' }}>
          GitHub
        </h2>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', lineHeight: 1.5 }}>
          Connect a GitHub Personal Access Token to link repos and build Blueprint Maps.
          Tokens are stored locally and never sent to any server.
        </p>
      </div>

      {isConnected ? (
        <ConnectedState
          user={githubUser!}
          repos={repos}
          loadingRepos={loadingRepos}
          onRefresh={() => loadRepos()}
          onDisconnect={disconnect}
        />
      ) : (
        <DisconnectedState
          showTokenInput={showTokenInput}
          tokenInput={tokenInput}
          connecting={connecting}
          error={error}
          onToggleInput={() => { setShowTokenInput(!showTokenInput); setError(''); }}
          onTokenChange={setTokenInput}
          onConnect={connectWithToken}
        />
      )}

      <TokenHelpPanel />
    </div>
  );
}

function ConnectedState({
  user,
  repos,
  loadingRepos,
  onRefresh,
  onDisconnect,
}: {
  user: { login: string; name: string | null; avatar_url: string };
  repos: GitHubRepo[];
  loadingRepos: boolean;
  onRefresh: () => void;
  onDisconnect: () => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* User card */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '14px 16px',
        background: 'var(--bg-surface)', border: '1px solid var(--border-accent)',
        borderRadius: 'var(--radius-card)',
      }}>
        <img
          src={user.avatar_url}
          alt={user.login}
          style={{ width: 40, height: 40, borderRadius: '50%', flexShrink: 0 }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}>
            {user.name ?? user.login}
          </p>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}>
            @{user.login}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-success)', display: 'inline-block' }} />
          <span style={{ fontSize: 12, color: 'var(--color-success)', fontFamily: 'var(--font-body)' }}>Connected</span>
        </div>
        <SecondaryButton size="sm" onClick={onDisconnect}>
          <Link2Off size={13} />
          Disconnect
        </SecondaryButton>
      </div>

      {/* Repos */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <p style={{ margin: 0, fontSize: 12, fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-quaternary)' }}>
            Your Repos
          </p>
          <button
            onClick={onRefresh}
            disabled={loadingRepos}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontFamily: 'var(--font-body)' }}
          >
            <RefreshCw size={12} style={{ animation: loadingRepos ? 'spin 1s linear infinite' : 'none' }} />
            Refresh
          </button>
        </div>

        {repos.length === 0 && !loadingRepos && (
          <p style={{ fontSize: 13, color: 'var(--text-quaternary)', fontFamily: 'var(--font-body)' }}>
            No repos loaded yet. Click Refresh to load.
          </p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
          {repos.map((r) => (
            <RepoCard key={r.id} repo={r} />
          ))}
        </div>
      </div>
    </div>
  );
}

function RepoCard({ repo }: { repo: GitHubRepo }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 12px',
      background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-base)',
    }}>
      {repo.private ? <Lock size={12} style={{ color: 'var(--text-quaternary)', flexShrink: 0 }} /> : <Unlock size={12} style={{ color: 'var(--text-quaternary)', flexShrink: 0 }} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', fontFamily: 'var(--font-body)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {repo.full_name}
        </p>
        {repo.description && (
          <p style={{ margin: 0, fontSize: 11, color: 'var(--text-quaternary)', fontFamily: 'var(--font-body)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {repo.description}
          </p>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        <GitBranch size={11} style={{ color: 'var(--text-quaternary)' }} />
        <span style={{ fontSize: 11, color: 'var(--text-quaternary)', fontFamily: 'var(--font-mono)' }}>{repo.default_branch}</span>
      </div>
      {repo.language && (
        <span style={{
          fontSize: 10, padding: '2px 8px', borderRadius: 100,
          background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-subtle)',
          color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)', flexShrink: 0,
        }}>
          {repo.language}
        </span>
      )}
    </div>
  );
}

function DisconnectedState({
  showTokenInput,
  tokenInput,
  connecting,
  error,
  onToggleInput,
  onTokenChange,
  onConnect,
}: {
  showTokenInput: boolean;
  tokenInput: string;
  connecting: boolean;
  error: string;
  onToggleInput: () => void;
  onTokenChange: (v: string) => void;
  onConnect: () => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '16px', borderRadius: 'var(--radius-card)',
        border: '1px dashed var(--border-strong)',
        background: 'var(--bg-surface)',
      }}>
        <Github size={24} style={{ color: 'var(--text-quaternary)', flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <p style={{ margin: '0 0 2px', fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}>
            Not connected
          </p>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-quaternary)', fontFamily: 'var(--font-body)' }}>
            Connect a Personal Access Token to enable repo browsing and Blueprint Builder.
          </p>
        </div>
        <PrimaryButton size="sm" onClick={onToggleInput}>
          <Link2 size={13} />
          Connect
        </PrimaryButton>
      </div>

      {showTokenInput && (
        <div style={{
          padding: '16px', borderRadius: 'var(--radius-card)',
          border: '1px solid var(--border-accent)',
          background: 'var(--bg-surface)',
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}>
            GitHub Personal Access Token
          </p>
          <input
            type="password"
            placeholder="ghp_…"
            value={tokenInput}
            onChange={(e) => onTokenChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onConnect()}
            style={{
              width: '100%', background: 'var(--bg-surface-sunken)',
              border: '1px solid var(--border-default)', borderRadius: 'var(--radius-base)',
              padding: '0 12px', height: 42, fontSize: 14,
              color: 'var(--text-primary)', fontFamily: 'var(--font-mono)',
              outline: 'none', boxSizing: 'border-box',
            }}
          />
          {error && (
            <p style={{ margin: 0, fontSize: 12, color: 'var(--color-destructive)', fontFamily: 'var(--font-body)' }}>
              {error}
            </p>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <SecondaryButton size="sm" onClick={onToggleInput}>Cancel</SecondaryButton>
            <PrimaryButton size="sm" onClick={onConnect} disabled={connecting}>
              {connecting ? 'Connecting…' : 'Connect'}
            </PrimaryButton>
          </div>
        </div>
      )}
    </div>
  );
}

function TokenHelpPanel() {
  return (
    <div style={{
      padding: '14px 16px', borderRadius: 'var(--radius-base)',
      background: 'var(--color-info-subtle)', border: '1px solid rgba(56,189,248,0.2)',
      fontSize: 12, color: 'var(--color-info)', fontFamily: 'var(--font-body)', lineHeight: 1.6,
    }}>
      <p style={{ margin: '0 0 4px', fontWeight: 600 }}>How to get a PAT:</p>
      <ol style={{ margin: 0, paddingLeft: 16 }}>
        <li>Go to <a href="https://github.com/settings/tokens/new" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit' }}>github.com/settings/tokens/new</a></li>
        <li>Select scopes: <code style={{ fontFamily: 'var(--font-mono)' }}>repo</code>, <code style={{ fontFamily: 'var(--font-mono)' }}>read:user</code></li>
        <li>Generate and paste here</li>
      </ol>
    </div>
  );
}
