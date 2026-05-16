import { useState, useRef, useCallback } from 'react';
import { Edit2, Copy, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

export const AGENT_COLORS = [
  'var(--text-agent-1)',
  'var(--text-agent-2)',
  'var(--text-agent-3)',
  'var(--text-agent-4)',
  'var(--text-agent-5)',
];

export interface AgentPillData {
  id: string;
  name: string;
  emoji: string;
  model: string;
  color?: string;
  active?: boolean;
  colorIndex?: number;
}

interface AgentPillProps {
  agent: AgentPillData;
  onEdit?: () => void;
  onDuplicate?: () => void;
  onRemove?: () => void;
  onClick?: () => void;
  className?: string;
}

const LONG_PRESS_DELAY = 700;

const MODEL_ABBREV: Record<string, string> = {
  'gemini-2.5-flash': '2.5F',
  'gemini-2.5-pro': '2.5P',
  'gemini-2.0-flash': '2.0F',
  'gemini-1.5-flash': '1.5F',
  'gemini-3-flash': '3F',
  'gemini-3.1-pro': '3.1P',
};

export function AgentPill({ agent, onEdit, onDuplicate, onRemove, onClick, className }: AgentPillProps) {
  const color = agent.color ?? AGENT_COLORS[agent.colorIndex ?? 0] ?? AGENT_COLORS[0];
  const [actionSheetOpen, setActionSheetOpen] = useState(false);
  const [pressing, setPressing] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongRef = useRef(false);

  const startPress = useCallback(() => {
    isLongRef.current = false;
    setPressing(true);
    timerRef.current = setTimeout(() => {
      isLongRef.current = true;
      setPressing(false);
      setActionSheetOpen(true);
      // Haptic feedback on mobile
      if ('vibrate' in navigator) navigator.vibrate(30);
    }, LONG_PRESS_DELAY);
  }, []);

  const endPress = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setPressing(false);
    if (!isLongRef.current) onClick?.();
    isLongRef.current = false;
  }, [onClick]);

  const cancelPress = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setPressing(false);
    isLongRef.current = false;
  }, []);

  const shortName = agent.name.length > 12 ? agent.name.slice(0, 12) + '…' : agent.name;
  const modelLabel = MODEL_ABBREV[agent.model] ?? agent.model.replace('gemini-', '');

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <div
        role="button"
        tabIndex={0}
        data-testid={`agent-pill-${agent.id}`}
        onMouseDown={startPress}
        onMouseUp={endPress}
        onMouseLeave={cancelPress}
        onTouchStart={(e) => { e.preventDefault(); startPress(); }}
        onTouchEnd={endPress}
        onTouchCancel={cancelPress}
        onContextMenu={(e) => { e.preventDefault(); setActionSheetOpen(true); }}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick?.(); }}
        className={cn(
          'flex items-center gap-2 rounded-full select-none cursor-pointer',
          'transition-all duration-[150ms]',
          'hover:bg-[var(--bg-surface-overlay)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]',
          agent.active && 'ring-1 ring-[var(--border-accent)]',
          pressing && 'scale-95 opacity-75',
          className
        )}
        style={{
          height: 34,
          padding: '0 12px',
          border: `1px solid ${agent.active ? 'var(--border-accent)' : 'rgba(255,255,255,0.10)'}`,
          background: agent.active
            ? 'rgba(124,106,247,0.18)'
            : 'rgba(255,255,255,0.06)',
          userSelect: 'none',
          WebkitUserSelect: 'none',
        }}
      >
        {/* Status dot */}
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: color,
            flexShrink: 0,
            boxShadow: agent.active ? `0 0 6px ${color}` : 'none',
            transition: 'box-shadow 200ms',
          }}
        />
        <span style={{ fontSize: 13 }}>{agent.emoji}</span>
        <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500, whiteSpace: 'nowrap' }}>
          {shortName}
        </span>
        <span
          style={{
            fontSize: 10,
            color: 'var(--text-quaternary)',
            fontFamily: 'var(--font-numeric)',
            background: 'var(--bg-surface-overlay)',
            padding: '1px 5px',
            borderRadius: 'var(--radius-sm)',
            whiteSpace: 'nowrap',
          }}
        >
          {modelLabel}
        </span>
      </div>

      {/* Action sheet (shown on long-press) */}
      {actionSheetOpen && (
        <>
          {/* Backdrop */}
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 'var(--z-dropdown)' }}
            onClick={() => setActionSheetOpen(false)}
          />
          <div
            data-testid={`agent-pill-action-sheet-${agent.id}`}
            style={{
              position: 'absolute',
              top: 'calc(100% + 8px)',
              left: 0,
              zIndex: 'var(--z-dropdown)',
              background: 'var(--bg-surface-overlay)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-card)',
              padding: 6,
              minWidth: 160,
              boxShadow: 'var(--shadow-dropdown)',
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
              animation: 'agent-enter 150ms var(--ease-decelerate)',
            }}
          >
            <p
              style={{
                margin: '0 0 4px',
                padding: '2px 8px',
                fontSize: 11,
                fontFamily: 'var(--font-display)',
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: 'var(--text-quaternary)',
              }}
            >
              {agent.emoji} {agent.name}
            </p>
            {onEdit && (
              <ActionItem
                icon={<Edit2 size={13} />}
                label="Edit"
                onClick={() => { setActionSheetOpen(false); onEdit(); }}
                testId={`action-edit-${agent.id}`}
              />
            )}
            {onDuplicate && (
              <ActionItem
                icon={<Copy size={13} />}
                label="Duplicate"
                onClick={() => { setActionSheetOpen(false); onDuplicate(); }}
                testId={`action-duplicate-${agent.id}`}
              />
            )}
            {onRemove && (
              <ActionItem
                icon={<Trash2 size={13} />}
                label="Remove"
                onClick={() => { setActionSheetOpen(false); onRemove(); }}
                destructive
                testId={`action-remove-${agent.id}`}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}

function ActionItem({
  icon,
  label,
  onClick,
  destructive = false,
  testId,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  destructive?: boolean;
  testId?: string;
}) {
  return (
    <button
      data-testid={testId}
      onClick={onClick}
      className="flex items-center gap-2.5 w-full rounded-lg transition-colors hover:bg-[var(--bg-surface-elevated)]"
      style={{
        padding: '7px 10px',
        border: 'none',
        background: 'none',
        color: destructive ? 'var(--color-destructive)' : 'var(--text-primary)',
        fontSize: 13,
        fontFamily: 'var(--font-body)',
        cursor: 'pointer',
        textAlign: 'left',
      }}
    >
      {icon}
      {label}
    </button>
  );
}
