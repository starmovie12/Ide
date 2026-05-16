import { Check, X, ChevronLeft, ChevronRight, GitMerge } from 'lucide-react';
import { useDiffStore } from '@/lib/store/diffStore';
import { useEditorStore } from '@/lib/store/editorStore';

interface DiffControlsProps {
  filePath?: string;
}

export function DiffControls({ filePath }: DiffControlsProps) {
  const {
    pendingDiffs,
    reviewIndex,
    acceptAll,
    rejectAll,
    acceptAllForFile,
    rejectAllForFile,
    acceptDiff,
    rejectDiff,
    setReviewIndex,
    stepReview,
  } = useDiffStore();

  const { files } = useEditorStore();

  const diffs = filePath
    ? pendingDiffs.filter((d) => d.filePath === filePath)
    : pendingDiffs;

  const uniqueFiles = [...new Set(pendingDiffs.map((d) => d.filePath))];
  const fileNames = uniqueFiles.map((fp) => {
    const entry = files.find((f) => f.path === fp);
    return entry ? fp.split('/').pop() ?? fp : fp.split('/').pop() ?? fp;
  });

  const totalDiffs = diffs.length;
  const isReviewing = reviewIndex !== null;
  const currentDiff = isReviewing ? diffs[reviewIndex] : null;

  if (totalDiffs === 0) return null;

  const summary =
    `${totalDiffs} change${totalDiffs !== 1 ? 's' : ''}` +
    (filePath
      ? ''
      : ` in ${uniqueFiles.length} file${uniqueFiles.length !== 1 ? 's' : ''} (${fileNames.join(', ')})`);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        padding: '6px 12px',
        background: 'var(--bg-diff-add, #0d1f12)',
        borderBottom: '1px solid var(--border-diff-add, #2a4a30)',
        flexShrink: 0,
        flexWrap: 'wrap',
        rowGap: 4,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <GitMerge size={13} style={{ color: 'var(--color-success)' }} />
        <span
          style={{
            fontSize: 12,
            fontFamily: 'var(--font-body)',
            color: 'var(--color-success)',
            fontWeight: 500,
          }}
        >
          {summary}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {isReviewing && currentDiff ? (
          <>
            <span
              style={{
                fontSize: 11,
                fontFamily: 'var(--font-body)',
                color: 'var(--text-quaternary)',
              }}
            >
              {(reviewIndex ?? 0) + 1} / {diffs.length}
            </span>
            <CtrlButton
              onClick={() => stepReview(-1)}
              disabled={(reviewIndex ?? 0) === 0}
              label="Previous"
            >
              <ChevronLeft size={12} />
            </CtrlButton>
            <CtrlButton
              onClick={() => stepReview(1)}
              disabled={(reviewIndex ?? 0) >= diffs.length - 1}
              label="Next"
            >
              <ChevronRight size={12} />
            </CtrlButton>
            <CtrlButton
              onClick={() => acceptDiff(currentDiff.id)}
              variant="success"
              label="Accept this change"
            >
              <Check size={12} />
              <span>Accept</span>
            </CtrlButton>
            <CtrlButton
              onClick={() => rejectDiff(currentDiff.id)}
              variant="danger"
              label="Reject this change"
            >
              <X size={12} />
              <span>Reject</span>
            </CtrlButton>
            <CtrlButton
              onClick={() => setReviewIndex(null)}
              label="Exit review mode"
            >
              <span>Done</span>
            </CtrlButton>
          </>
        ) : (
          <>
            <CtrlButton
              onClick={() => setReviewIndex(0)}
              label="Review each change"
            >
              <ChevronLeft size={12} />
              <span>Review Each</span>
            </CtrlButton>
            <CtrlButton
              onClick={() => (filePath ? rejectAllForFile(filePath) : rejectAll())}
              variant="danger"
              label="Reject all changes"
            >
              <X size={12} />
              <span>Reject All</span>
            </CtrlButton>
            <CtrlButton
              onClick={() => (filePath ? acceptAllForFile(filePath) : acceptAll())}
              variant="success"
              label="Accept all changes"
            >
              <Check size={12} />
              <span>Accept All</span>
            </CtrlButton>
          </>
        )}
      </div>
    </div>
  );
}

function CtrlButton({
  children,
  onClick,
  variant,
  label,
  disabled = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  variant?: 'success' | 'danger';
  label: string;
  disabled?: boolean;
}) {
  const bg =
    variant === 'success'
      ? 'var(--bg-diff-add, #0d2210)'
      : variant === 'danger'
      ? 'var(--bg-diff-remove, #1f0d0d)'
      : 'var(--bg-surface-elevated)';

  const border =
    variant === 'success'
      ? 'var(--border-diff-add, #2a4a30)'
      : variant === 'danger'
      ? 'var(--border-diff-remove, #4a2a2a)'
      : 'var(--border-default)';

  const color =
    variant === 'success'
      ? 'var(--color-success)'
      : variant === 'danger'
      ? 'var(--color-destructive)'
      : 'var(--text-secondary)';

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex items-center gap-1 rounded transition-colors hover:brightness-125"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '3px 8px',
        border: `1px solid ${border}`,
        background: bg,
        color,
        fontSize: 11,
        fontFamily: 'var(--font-body)',
        fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        borderRadius: 5,
      }}
    >
      {children}
    </button>
  );
}
