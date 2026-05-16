import { X } from 'lucide-react';
import { useEditorStore } from '@/lib/store/editorStore';
import { getFileIcon } from '@/lib/utils/fileIcons';

interface FileTabProps {
  fileId: string;
  isActive: boolean;
}

export function FileTab({ fileId, isActive }: FileTabProps) {
  const { openFiles, setActiveFile, closeFile } = useEditorStore();
  const file = openFiles.find((f) => f.id === fileId);
  if (!file) return null;

  const name = file.path.split('/').pop() ?? file.path;
  const { icon: Icon, color } = getFileIcon(file.path);

  return (
    <div
      role="tab"
      aria-selected={isActive}
      data-testid={`file-tab-${name}`}
      onClick={() => setActiveFile(fileId)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '0 10px 0 10px',
        height: '100%',
        cursor: 'pointer',
        flexShrink: 0,
        borderRight: '1px solid var(--border-default)',
        background: isActive ? 'var(--bg-editor)' : 'var(--bg-surface)',
        borderBottom: isActive ? '2px solid var(--color-primary)' : '2px solid transparent',
        transition: 'background 150ms',
        position: 'relative',
        userSelect: 'none',
      }}
      className="hover:bg-[var(--bg-surface-elevated)]"
    >
      <Icon size={13} style={{ color, flexShrink: 0 }} />
      <span
        style={{
          fontSize: 12,
          fontFamily: 'var(--font-body)',
          color: isActive ? 'var(--text-primary)' : 'var(--text-tertiary)',
          whiteSpace: 'nowrap',
          maxWidth: 120,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {name}
      </span>
      {file.isDirty && (
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: 'var(--color-warning)',
            flexShrink: 0,
          }}
          title="Unsaved changes"
        />
      )}
      <button
        data-testid={`close-tab-${name}`}
        onClick={(e) => {
          e.stopPropagation();
          closeFile(fileId);
        }}
        className="flex items-center justify-center rounded hover:bg-[var(--bg-surface-overlay)] transition-colors"
        style={{
          width: 16,
          height: 16,
          border: 'none',
          background: 'none',
          color: 'var(--text-quaternary)',
          cursor: 'pointer',
          padding: 0,
          marginLeft: 2,
          flexShrink: 0,
        }}
        aria-label={`Close ${name}`}
      >
        <X size={10} />
      </button>
    </div>
  );
}
