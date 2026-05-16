/**
 * RepoPicker — Phase 5 §4.6
 * Lists the user's GitHub repos and lets them pick one + branch.
 * Triggered after OAuth / PAT connection succeeds.
 */

import { useEffect, useState } from 'react';
import { Search, GitBranch, Lock, Globe } from 'lucide-react';
import { fetchUserRepos, type GitHubRepo } from '@/lib/github/oauth';
import { useBlueprintStore } from '@/lib/store/blueprintStore';

interface RepoPickerProps {
  /** Called when the user selects a repo+branch */
  onPick: (owner: string, repo: string, branch: string) => void;
  /** Currently connected token */
  token: string;
}

export function RepoPicker({ onPick, token }: RepoPickerProps) {
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [filtered, setFiltered] = useState<GitHubRepo[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null);
  const [branch, setBranch] = useState('');

  useEffect(() => {
    setLoading(true);
    fetchUserRepos(token)
      .then((rs) => {
        setRepos(rs);
        setFiltered(rs);
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load repos.');
        setLoading(false);
      });
  }, [token]);

  useEffect(() => {
    if (!search.trim()) {
      setFiltered(repos);
    } else {
      const q = search.toLowerCase();
      setFiltered(repos.filter((r) => r.full_name.toLowerCase().includes(q)));
    }
  }, [search, repos]);

  function handleSelect(repo: GitHubRepo) {
    setSelectedRepo(repo);
    setBranch(repo.default_branch);
  }

  function handleConfirm() {
    if (!selectedRepo) return;
    onPick(selectedRepo.owner, selectedRepo.name, branch || selectedRepo.default_branch);
  }

  if (loading) {
    return (
      <div style={{ color: 'var(--text-secondary)', fontSize: 13, padding: '12px 0' }}>
        Loading repositories…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ color: 'var(--color-destructive)', fontSize: 13 }}>{error}</div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Search */}
      <div style={{ position: 'relative' }}>
        <Search
          size={13}
          style={{
            position: 'absolute',
            left: 9,
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--text-tertiary)',
          }}
        />
        <input
          placeholder="Search repos…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: '100%',
            paddingLeft: 28,
            padding: '7px 10px 7px 28px',
            background: 'var(--bg-surface-sunken)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--text-primary)',
            fontSize: 13,
            outline: 'none',
            boxSizing: 'border-box',
          }}
          aria-label="Search repositories"
        />
      </div>

      {/* Repo list */}
      <div
        style={{
          maxHeight: 240,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
        role="listbox"
        aria-label="Repository list"
      >
        {filtered.length === 0 && (
          <div style={{ color: 'var(--text-tertiary)', fontSize: 13, padding: '8px 0' }}>
            No repos found.
          </div>
        )}
        {filtered.map((repo) => (
          <button
            key={repo.id}
            role="option"
            aria-selected={selectedRepo?.id === repo.id}
            onClick={() => handleSelect(repo)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '7px 10px',
              background: selectedRepo?.id === repo.id ? 'var(--bg-glass-island-active)' : 'transparent',
              border: '1px solid',
              borderColor: selectedRepo?.id === repo.id ? 'var(--border-interactive)' : 'transparent',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              textAlign: 'left',
              color: 'var(--text-primary)',
            }}
          >
            {repo.private ? (
              <Lock size={12} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
            ) : (
              <Globe size={12} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
            )}
            <span style={{ fontSize: 13, fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {repo.full_name}
            </span>
            {repo.language && (
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)', flexShrink: 0 }}>
                {repo.language}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Branch input */}
      {selectedRepo && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <GitBranch size={13} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
          <input
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            placeholder={selectedRepo.default_branch}
            style={{
              flex: 1,
              background: 'var(--bg-surface-sunken)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-primary)',
              fontSize: 13,
              padding: '6px 9px',
              outline: 'none',
            }}
            aria-label="Branch name"
          />
          <button
            onClick={handleConfirm}
            style={{
              background: 'var(--color-primary)',
              color: 'var(--text-on-primary)',
              border: 'none',
              borderRadius: 'var(--radius-base)',
              padding: '6px 14px',
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            Load Repo
          </button>
        </div>
      )}
    </div>
  );
}
