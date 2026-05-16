/**
 * BlueprintProgress — Phase 5 §1.2 + §4.3
 * Streaming progress indicator shown in chat while the blueprint is building.
 * Mirrors the four build phases: Index → Summarize → Conventions → Rules.
 */

import { useState, useEffect } from 'react';
import { BookOpen, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';

export type BlueprintPhase =
  | 'indexing'
  | 'summarizing'
  | 'conventions'
  | 'rules'
  | 'done'
  | 'error';

export interface BlueprintProgressState {
  phase: BlueprintPhase;
  indexedFiles: number;
  totalFiles: number;
  summarizedFiles: number;
  message?: string;
  errorMessage?: string;
}

interface BlueprintProgressProps {
  state: BlueprintProgressState;
  /** Called when user clicks the [Rebuild] button on a stale/error blueprint */
  onRebuild?: () => void;
  /** Whether to show the stale warning (>7 days old) — Bug #B32 */
  isStale?: boolean;
  daysOld?: number;
}

const PHASE_LABELS: Record<BlueprintPhase, string> = {
  indexing:     'Indexing repository files…',
  summarizing:  'Summarizing code…',
  conventions:  'Detecting conventions…',
  rules:        'Extracting rules…',
  done:         'Blueprint ready',
  error:        'Blueprint build failed',
};

export function BlueprintProgress({
  state,
  onRebuild,
  isStale = false,
  daysOld = 0,
}: BlueprintProgressProps) {
  const isDone  = state.phase === 'done';
  const isError = state.phase === 'error';

  const progressPct =
    state.phase === 'indexing'
      ? state.totalFiles > 0
        ? Math.round((state.indexedFiles / state.totalFiles) * 100)
        : 0
      : state.phase === 'summarizing'
        ? state.totalFiles > 0
          ? Math.round((state.summarizedFiles / state.totalFiles) * 100)
          : 0
        : state.phase === 'done'
          ? 100
          : undefined;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Blueprint build progress"
      style={{
        background: 'var(--bg-surface)',
        border: `1px solid ${isError ? 'var(--border-destructive)' : 'var(--border-default)'}`,
        borderRadius: 'var(--radius-card)',
        padding: '12px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        maxWidth: 360,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {isError ? (
          <AlertCircle size={14} style={{ color: 'var(--color-destructive)', flexShrink: 0 }} />
        ) : isDone ? (
          <CheckCircle size={14} style={{ color: 'var(--color-success)', flexShrink: 0 }} />
        ) : (
          <BookOpen
            size={14}
            style={{
              color: 'var(--color-primary)',
              flexShrink: 0,
              animation: 'pulse 1.5s ease-in-out infinite',
            }}
          />
        )}
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: isError ? 'var(--color-destructive)' : 'var(--text-primary)',
            flex: 1,
          }}
        >
          Repo Blueprint
        </span>
        {(isDone || isError) && onRebuild && (
          <button
            onClick={onRebuild}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              background: 'transparent',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: '3px 8px',
              fontSize: 11,
            }}
            aria-label="Rebuild blueprint"
          >
            <RefreshCw size={10} />
            Rebuild
          </button>
        )}
      </div>

      {/* Phase label */}
      <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>
        {state.message ?? PHASE_LABELS[state.phase]}
      </p>

      {/* Progress bar */}
      {progressPct !== undefined && (
        <div
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progressPct}
          role="progressbar"
          style={{
            height: 4,
            background: 'var(--bg-surface-sunken)',
            borderRadius: 'var(--radius-full)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${progressPct}%`,
              background: isError ? 'var(--color-destructive)' : 'var(--color-primary)',
              borderRadius: 'var(--radius-full)',
              transition: 'width 300ms ease',
            }}
          />
        </div>
      )}

      {/* File counts */}
      {state.phase === 'indexing' && state.totalFiles > 0 && (
        <p style={{ margin: 0, fontSize: 11, color: 'var(--text-tertiary)' }}>
          Indexed {state.indexedFiles} / {state.totalFiles} files
        </p>
      )}
      {state.phase === 'summarizing' && state.totalFiles > 0 && (
        <p style={{ margin: 0, fontSize: 11, color: 'var(--text-tertiary)' }}>
          Summarized {state.summarizedFiles} / {state.totalFiles} files
        </p>
      )}

      {/* Error details */}
      {isError && state.errorMessage && (
        <p style={{ margin: 0, fontSize: 11, color: 'var(--color-destructive)' }}>
          {state.errorMessage}
        </p>
      )}

      {/* Stale warning — Bug #B32 */}
      {isStale && isDone && daysOld > 7 && (
        <div
          role="alert"
          style={{
            marginTop: 4,
            padding: '6px 10px',
            background: 'var(--color-warning-subtle)',
            border: '1px solid var(--color-warning)',
            borderRadius: 'var(--radius-md)',
            fontSize: 11,
            color: 'var(--text-primary)',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          ⚠️ Blueprint is {daysOld} days old.
          {onRebuild && (
            <button
              onClick={onRebuild}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-link)',
                cursor: 'pointer',
                fontSize: 11,
                padding: 0,
                textDecoration: 'underline',
              }}
            >
              Rebuild
            </button>
          )}
        </div>
      )}

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.5} }`}</style>
    </div>
  );
}
