import { useState, useRef } from 'react';
import { MapPin, RefreshCw, CheckCircle2, AlertCircle, X, GitBranch, Loader2 } from 'lucide-react';
import { buildBlueprint } from '@/lib/blueprint/builder';
import { useBlueprintStore } from '@/lib/store/blueprintStore';
import { useAPIKeyStore } from '@/lib/store/apiKeyStore';
import { parseOwnerRepo } from '@/lib/github/oauth';
import type { RepoBlueprint } from '@/lib/blueprint/types';

interface BlueprintBuilderProps {
  chatId: string;
}

export function BlueprintBuilder({ chatId }: BlueprintBuilderProps) {
  const { githubToken, getBlueprint, setBlueprint, updateBlueprintProgress, setBuildingChatId, buildingChatId } = useBlueprintStore();
  const { getNextAvailableKey } = useAPIKeyStore();

  const [repoUrl, setRepoUrl] = useState('');
  const [building, setBuilding] = useState(false);
  const [progress, setProgress] = useState<{ phase: string; done: number; total: number } | null>(null);
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const blueprint = getBlueprint(chatId);
  const isBuilding = buildingChatId === chatId;

  async function startBuild() {
    if (!githubToken) {
      setError('Connect GitHub in Settings → GitHub first.');
      return;
    }

    const parsed = parseOwnerRepo(repoUrl.trim());
    if (!parsed) {
      setError('Invalid GitHub URL. Use https://github.com/owner/repo');
      return;
    }

    const apiKey = getNextAvailableKey();
    if (!apiKey) {
      setError('No API key available. Add a Gemini key in Settings → API Keys.');
      return;
    }

    setError('');
    setBuilding(true);
    setBuildingChatId(chatId);

    abortRef.current = new AbortController();

    try {
      const { Octokit } = await import('@octokit/rest');
      const octokit = new Octokit({ auth: githubToken });

      let ref = 'HEAD';
      try {
        const repoData = await octokit.repos.get({ owner: parsed.owner, repo: parsed.repo });
        ref = repoData.data.default_branch;
      } catch {
        ref = 'main';
      }

      const result = await buildBlueprint({
        octokit,
        owner: parsed.owner,
        repo: parsed.repo,
        ref,
        chatId,
        apiKey: apiKey.key,
        onProgress: (phase, done, total) => {
          setProgress({ phase, done, total });
          updateBlueprintProgress(chatId, phase, done, total);
        },
        signal: abortRef.current.signal,
      });

      setBlueprint(result);
      setProgress(null);
    } catch (e: unknown) {
      if (e instanceof Error && e.message === 'Aborted') {
        setError('Build cancelled.');
      } else {
        setError(e instanceof Error ? e.message : 'Blueprint build failed');
      }
    } finally {
      setBuilding(false);
      setBuildingChatId(null);
    }
  }

  function cancelBuild() {
    abortRef.current?.abort();
  }

  function clearBlueprint() {
    const { disconnectRepo } = useBlueprintStore.getState();
    disconnectRepo(chatId);
  }

  return (
    <div
      style={{
        padding: '12px 16px',
        background: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <MapPin size={14} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--text-secondary)', letterSpacing: '0.08em', textTransform: 'uppercase', flex: 1 }}>
          Blueprint Map
        </span>
        {blueprint?.status === 'ready' && (
          <button
            onClick={clearBlueprint}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-quaternary)', display: 'flex' }}
          >
            <X size={13} />
          </button>
        )}
      </div>

      {blueprint?.status === 'ready' ? (
        <BlueprintSummary blueprint={blueprint} onRebuild={() => {
          const { disconnectRepo } = useBlueprintStore.getState();
          disconnectRepo(chatId);
          setRepoUrl(`https://github.com/${blueprint.repoOwner}/${blueprint.repoName}`);
        }} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              value={repoUrl}
              onChange={(e) => { setRepoUrl(e.target.value); setError(''); }}
              placeholder="https://github.com/owner/repo"
              disabled={building}
              style={{
                flex: 1, background: 'var(--bg-surface-sunken)',
                border: '1px solid var(--border-default)', borderRadius: 6,
                padding: '0 10px', height: 34, fontSize: 12,
                color: 'var(--text-primary)', fontFamily: 'var(--font-mono)',
                outline: 'none',
              }}
              onKeyDown={(e) => e.key === 'Enter' && !building && startBuild()}
            />
            {building ? (
              <button
                onClick={cancelBuild}
                style={{
                  padding: '0 12px', height: 34, borderRadius: 6,
                  background: 'var(--color-destructive-subtle)', border: '1px solid rgba(239,68,68,0.3)',
                  color: 'var(--color-destructive)', cursor: 'pointer', fontSize: 12,
                  fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                <X size={12} /> Cancel
              </button>
            ) : (
              <button
                onClick={startBuild}
                style={{
                  padding: '0 14px', height: 34, borderRadius: 6,
                  background: 'var(--color-primary)', border: 'none',
                  color: 'white', cursor: 'pointer', fontSize: 12,
                  fontFamily: 'var(--font-body)', fontWeight: 600,
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                <MapPin size={12} /> Build
              </button>
            )}
          </div>

          {building && progress && (
            <BuildProgress phase={progress.phase} done={progress.done} total={progress.total} />
          )}

          {error && (
            <p style={{ margin: 0, fontSize: 12, color: 'var(--color-destructive)', fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <AlertCircle size={12} /> {error}
            </p>
          )}

          {!githubToken && (
            <p style={{ margin: 0, fontSize: 11, color: 'var(--text-quaternary)', fontFamily: 'var(--font-body)' }}>
              Connect GitHub in Settings → GitHub to enable Blueprint Builder.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function BuildProgress({ phase, done, total }: { phase: string; done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Loader2 size={12} style={{ color: 'var(--color-primary)', animation: 'spin 1s linear infinite', flexShrink: 0 }} />
        <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', flex: 1 }}>{phase}</span>
        <span style={{ fontSize: 11, color: 'var(--text-quaternary)', fontFamily: 'var(--font-mono)' }}>
          {total > 0 ? `${done}/${total}` : '…'}
        </span>
      </div>
      {total > 0 && (
        <div style={{ height: 3, borderRadius: 100, background: 'var(--bg-surface-elevated)', overflow: 'hidden' }}>
          <div style={{
            height: '100%', background: 'var(--color-primary)', borderRadius: 100,
            width: `${pct}%`, transition: 'width 300ms ease',
          }} />
        </div>
      )}
    </div>
  );
}

function BlueprintSummary({ blueprint, onRebuild }: { blueprint: RepoBlueprint; onRebuild: () => void }) {
  const ago = Math.round((Date.now() - blueprint.buildAt) / 60000);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <CheckCircle2 size={13} style={{ color: 'var(--color-success)', flexShrink: 0 }} />
        <span style={{ fontSize: 12, color: 'var(--text-primary)', fontFamily: 'var(--font-body)', fontWeight: 600 }}>
          {blueprint.repoOwner}/{blueprint.repoName}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <GitBranch size={11} style={{ color: 'var(--text-quaternary)' }} />
          <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-quaternary)' }}>
            {blueprint.ref}
          </span>
        </div>
        <span style={{ fontSize: 11, color: 'var(--text-quaternary)', fontFamily: 'var(--font-body)', marginLeft: 'auto' }}>
          {ago < 1 ? 'just now' : `${ago}m ago`}
        </span>
        <button
          onClick={onRebuild}
          title="Rebuild"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-quaternary)', display: 'flex' }}
        >
          <RefreshCw size={12} />
        </button>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Stat label="Files" value={blueprint.files.length} />
        <Stat label="Symbols" value={Object.keys(blueprint.symbols).length} />
        <Stat label="Rules" value={blueprint.rules.length} />
        <Stat label={blueprint.conventions.framework} value={blueprint.conventions.styling} isText />
      </div>
    </div>
  );
}

function Stat({ label, value, isText }: { label: string; value: number | string; isText?: boolean }) {
  return (
    <span style={{
      fontSize: 11, padding: '2px 8px',
      borderRadius: 100, border: '1px solid var(--border-subtle)',
      background: 'var(--bg-surface-elevated)',
      color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)',
    }}>
      {isText ? `${label}/${value}` : <><span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{value}</span> {label}</>}
    </span>
  );
}
