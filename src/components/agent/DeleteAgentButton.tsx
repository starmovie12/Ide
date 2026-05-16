import { Trash2 } from 'lucide-react';
import { useState } from 'react';

interface DeleteAgentButtonProps {
  agentName: string;
  onConfirm: () => void;
}

export function DeleteAgentButton({ agentName, onConfirm }: DeleteAgentButtonProps) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>
          Delete "{agentName}"?
        </span>
        <button
          data-testid="button-confirm-delete"
          onClick={() => { setConfirming(false); onConfirm(); }}
          style={{
            padding: '4px 12px',
            borderRadius: 'var(--radius-base)',
            border: 'none',
            background: 'var(--color-destructive)',
            color: 'white',
            fontSize: 13,
            fontFamily: 'var(--font-body)',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Yes, delete
        </button>
        <button
          data-testid="button-cancel-delete"
          onClick={() => setConfirming(false)}
          style={{
            padding: '4px 12px',
            borderRadius: 'var(--radius-base)',
            border: '1px solid var(--border-default)',
            background: 'none',
            color: 'var(--text-secondary)',
            fontSize: 13,
            fontFamily: 'var(--font-body)',
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      data-testid="button-delete-agent"
      onClick={() => setConfirming(true)}
      className="flex items-center gap-2 rounded-lg transition-colors hover:bg-[var(--color-destructive-subtle)]"
      style={{
        padding: '8px 12px',
        border: '1px solid var(--border-destructive)',
        background: 'none',
        color: 'var(--color-destructive)',
        fontSize: 14,
        fontFamily: 'var(--font-body)',
        cursor: 'pointer',
      }}
    >
      <Trash2 size={15} />
      Delete Agent
    </button>
  );
}
