/**
 * RepoSelectorChip — Part 4 §2.2
 *
 * Top-bar chip showing the currently active repo. Tap → repo picker sheet.
 *
 * Source of truth for the GitHub connection is the existing `blueprintStore`
 * (it already owns the OAuth token, github user, and per-chat repo
 * connections). Focus Forge needs an "active repo" concept that lives at
 * the global level (since the chip is global). We derive the active repo
 * from the currently-active chat's connection, falling back to "+ Add Repo"
 * when no chat is connected.
 *
 * Future Phase 5.10.E will wire a real RepoPickerSheet; for now tapping
 * the chip dispatches an event the parent (FocusForge) can listen for, or
 * triggers a no-op if no handler is provided.
 */

import { ChevronDown, GitBranch, Plus } from 'lucide-react';
import { useBlueprintStore } from '@/lib/store/blueprintStore';
import { useChatStore } from '@/lib/store/chatStore';

interface RepoSelectorChipProps {
  onClick: () => void;
}

export function RepoSelectorChip({ onClick }: RepoSelectorChipProps) {
  const activeChatId = useChatStore((s) => s.activeChatId);
  const connection = useBlueprintStore((s) =>
    activeChatId ? s.repoConnections[activeChatId] ?? null : null,
  );

  const label = connection ? `${connection.owner}/${connection.repo}` : '+ Add Repo';
  const hasRepo = Boolean(connection);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={hasRepo ? `Active repo: ${label}. Tap to switch.` : 'Add a repository'}
      title={hasRepo ? label : 'Connect a GitHub repository'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        height: 32,
        padding: hasRepo ? '0 10px 0 8px' : '0 12px 0 10px',
        borderRadius: 999,
        border: '1px solid',
        borderColor: hasRepo
          ? 'var(--border-subtle, rgba(255,255,255,0.08))'
          : 'var(--border-subtle, rgba(124,106,247,0.20))',
        background: hasRepo ? 'var(--bg-surface-elevated)' : 'var(--color-primary-subtle)',
        color: hasRepo ? 'var(--text-primary)' : 'var(--color-primary)',
        fontSize: 12,
        fontWeight: 500,
        cursor: 'pointer',
        transition: 'background 150ms cubic-bezier(0.2, 0, 0, 1)',
        maxWidth: 200,
        overflow: 'hidden',
      }}
    >
      {hasRepo ? (
        <GitBranch size={12} aria-hidden="true" style={{ flexShrink: 0 }} />
      ) : (
        <Plus size={12} aria-hidden="true" style={{ flexShrink: 0 }} />
      )}
      <span
        style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          minWidth: 0,
        }}
      >
        {label}
      </span>
      {hasRepo && <ChevronDown size={12} aria-hidden="true" style={{ flexShrink: 0 }} />}
    </button>
  );
}
