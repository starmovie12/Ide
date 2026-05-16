import { WrapText, Map, Save, ChevronRight } from 'lucide-react';
import { useEditorStore } from '@/lib/store/editorStore';

interface EditorToolbarProps {
  wordWrap: boolean;
  minimap: boolean;
  onToggleWordWrap: () => void;
  onToggleMinimap: () => void;
}

export function EditorToolbar({
  wordWrap,
  minimap,
  onToggleWordWrap,
  onToggleMinimap,
}: EditorToolbarProps) {
  const { activeFileId, openFiles, markFileSaved } = useEditorStore();
  const activeFile = openFiles.find((f) => f.id === activeFileId);

  if (!activeFile) return null;

  const parts = activeFile.path.split('/');

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 12px',
        height: 32,
        borderBottom: '1px solid var(--border-default)',
        background: 'var(--bg-surface)',
        flexShrink: 0,
        gap: 8,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          overflow: 'hidden',
          flex: 1,
          minWidth: 0,
        }}
      >
        {parts.map((part, i) => (
          <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            {i > 0 && <ChevronRight size={10} style={{ color: 'var(--text-quaternary)' }} />}
            <span
              style={{
                fontSize: 11,
                fontFamily: 'var(--font-mono)',
                color: i === parts.length - 1 ? 'var(--text-primary)' : 'var(--text-quaternary)',
                fontWeight: i === parts.length - 1 ? 500 : 400,
              }}
            >
              {part}
            </span>
          </span>
        ))}
        {activeFile.isDirty && (
          <span
            style={{
              fontSize: 10,
              fontFamily: 'var(--font-body)',
              color: 'var(--color-warning)',
              marginLeft: 4,
              flexShrink: 0,
            }}
          >
            ● unsaved
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
        <ToolbarButton
          label="Word Wrap"
          active={wordWrap}
          onClick={onToggleWordWrap}
          title={`Word wrap: ${wordWrap ? 'on' : 'off'}`}
        >
          <WrapText size={13} />
        </ToolbarButton>
        <ToolbarButton
          label="Minimap"
          active={minimap}
          onClick={onToggleMinimap}
          title={`Minimap: ${minimap ? 'on' : 'off'}`}
        >
          <Map size={13} />
        </ToolbarButton>
        {activeFile.isDirty && (
          <ToolbarButton
            label="Save"
            active={false}
            onClick={() => activeFileId && markFileSaved(activeFileId)}
            title="Save file (Cmd+S)"
          >
            <Save size={13} />
          </ToolbarButton>
        )}
      </div>
    </div>
  );
}

function ToolbarButton({
  children,
  active,
  onClick,
  title,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  title?: string;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex items-center justify-center rounded transition-colors hover:bg-[var(--bg-surface-elevated)]"
      style={{
        width: 24,
        height: 24,
        border: 'none',
        background: active ? 'var(--bg-surface-elevated)' : 'none',
        color: active ? 'var(--color-primary)' : 'var(--text-quaternary)',
        cursor: 'pointer',
        padding: 0,
      }}
    >
      {children}
    </button>
  );
}
