import { useState, Suspense, useEffect, useRef } from 'react';
import { Code2, Eye, SplitSquareHorizontal, FilePlus } from 'lucide-react';
import { useEditorStore } from '@/lib/store/editorStore';
import { useDiffStore } from '@/lib/store/diffStore';
import { FileTab } from '@/components/editor/FileTab';
import { EditorToolbar } from '@/components/editor/EditorToolbar';
import { MonacoEditor } from '@/components/editor/MonacoEditor';
import { DiffViewer } from '@/components/editor/DiffViewer';
import { DiffControls } from '@/components/editor/DiffControls';

type PanelMode = 'editor' | 'diff' | 'preview';

export function RightPanel() {
  const { openFiles, activeFileId, setActiveFile, createFile } = useEditorStore();
  const { pendingDiffs } = useDiffStore();

  const [mode, setMode] = useState<PanelMode>('editor');
  const [wordWrap, setWordWrap] = useState(true);
  const [minimap, setMinimap] = useState(false);

  const activeFile = openFiles.find((f) => f.id === activeFileId) ?? null;

  const diffsForActiveFile = activeFile
    ? pendingDiffs.filter((d) => d.filePath === activeFile.path)
    : [];
  const hasDiffs = diffsForActiveFile.length > 0;

  const effectiveMode: PanelMode = hasDiffs && mode === 'editor' ? 'diff' : mode;

  const handleCreateSampleFile = () => {
    createFile('src/index.ts', '// Start coding here\nconsole.log("Hello, AI Agent Studio!");\n');
  };

  return (
    <div
      className="hidden lg:flex flex-col flex-shrink-0"
      style={{
        width: '42%',
        background: 'var(--bg-editor)',
        borderLeft: '1px solid var(--border-default)',
        minWidth: 300,
      }}
    >
      {/* Mode tab bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '0 12px',
          height: 40,
          borderBottom: '1px solid var(--border-default)',
          background: 'var(--bg-surface)',
          flexShrink: 0,
        }}
      >
        {(
          [
            { key: 'editor', icon: Code2, label: 'Editor' },
            { key: 'diff', icon: SplitSquareHorizontal, label: 'Diff' },
            { key: 'preview', icon: Eye, label: 'Preview' },
          ] as const
        ).map(({ key, icon: Icon, label }) => {
          const isActive = mode === key;
          const showBadge = key === 'diff' && hasDiffs;
          return (
            <button
              key={key}
              data-testid={`tab-${key}`}
              onClick={() => setMode(key)}
              className="flex items-center gap-1.5 rounded-md transition-colors hover:bg-[var(--bg-surface-elevated)]"
              style={{
                padding: '4px 10px',
                border: 'none',
                background: isActive ? 'var(--bg-surface-elevated)' : 'none',
                color: isActive ? 'var(--text-primary)' : 'var(--text-quaternary)',
                cursor: 'pointer',
                fontSize: 12,
                fontFamily: 'var(--font-body)',
                fontWeight: isActive ? 500 : 400,
                position: 'relative',
              }}
            >
              <Icon size={13} />
              {label}
              {showBadge && (
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: 'var(--color-warning)',
                    position: 'absolute',
                    top: 4,
                    right: 4,
                  }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* File tabs row */}
      {openFiles.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'stretch',
            height: 34,
            background: 'var(--bg-surface)',
            borderBottom: '1px solid var(--border-default)',
            overflowX: 'auto',
            flexShrink: 0,
          }}
        >
          {openFiles.map((f) => (
            <FileTab key={f.id} fileId={f.id} isActive={f.id === activeFileId} />
          ))}
        </div>
      )}

      {/* No file open — empty state */}
      {!activeFile && (
        <EmptyEditorState onCreate={handleCreateSampleFile} />
      )}

      {activeFile && (
        <>
          {/* Diff controls (shown above editor/diff when diffs exist) */}
          {hasDiffs && (
            <DiffControls filePath={activeFile.path} />
          )}

          {/* Editor toolbar */}
          {effectiveMode === 'editor' && (
            <EditorToolbar
              wordWrap={wordWrap}
              minimap={minimap}
              onToggleWordWrap={() => setWordWrap((w) => !w)}
              onToggleMinimap={() => setMinimap((m) => !m)}
            />
          )}

          {/* Content area */}
          <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
            {effectiveMode === 'editor' && (
              <Suspense fallback={<LoadingPane label="Loading editor…" />}>
                <MonacoEditor
                  fileId={activeFile.id}
                  language={activeFile.language}
                  wordWrap={wordWrap}
                  minimap={minimap}
                />
              </Suspense>
            )}

            {effectiveMode === 'diff' && (
              <Suspense fallback={<LoadingPane label="Loading diff…" />}>
                <DiffViewer filePath={activeFile.path} inline />
              </Suspense>
            )}

            {effectiveMode === 'preview' && (
              <LivePreview fileId={activeFile.id} />
            )}
          </div>
        </>
      )}
    </div>
  );
}

function EmptyEditorState({ onCreate }: { onCreate: () => void }) {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
        padding: 24,
      }}
    >
      <div
        style={{
          width: 52,
          height: 52,
          borderRadius: 14,
          background: 'var(--bg-surface-elevated)',
          border: '1px solid var(--border-default)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Code2 size={24} style={{ color: 'var(--text-quaternary)' }} />
      </div>
      <div style={{ textAlign: 'center' }}>
        <p
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--text-secondary)',
            margin: '0 0 4px',
            fontFamily: 'var(--font-display)',
          }}
        >
          No file open
        </p>
        <p
          style={{
            fontSize: 12,
            color: 'var(--text-quaternary)',
            margin: 0,
            fontFamily: 'var(--font-body)',
          }}
        >
          Create a file in the explorer or ask an agent to write code
        </p>
      </div>
      <button
        onClick={onCreate}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 14px',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
          borderRadius: 8,
          fontSize: 12,
          fontFamily: 'var(--font-body)',
          color: 'var(--text-secondary)',
          cursor: 'pointer',
        }}
        className="hover:border-[var(--border-accent)] hover:text-[var(--text-primary)] transition-colors"
      >
        <FilePlus size={13} />
        Create sample file
      </button>
    </div>
  );
}

function LoadingPane({ label }: { label: string }) {
  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--text-quaternary)',
        fontSize: 13,
        fontFamily: 'var(--font-body)',
      }}
    >
      {label}
    </div>
  );
}

function LivePreview({ fileId }: { fileId: string }) {
  const { files, fileContents } = useEditorStore();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const blobUrlRef = useRef<string | null>(null);

  const fileEntry = files.find((f) => f.id === fileId);
  const content = fileEntry ? (fileContents[fileId] ?? fileEntry.content) : '';
  const isHtml = fileEntry?.language === 'html' || fileEntry?.path.endsWith('.html');

  useEffect(() => {
    if (!isHtml || !iframeRef.current) return;
    if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    const blob = new Blob([content], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    blobUrlRef.current = url;
    iframeRef.current.src = url;
    return () => {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    };
  }, [content, isHtml]);

  if (!fileEntry) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8, color: 'var(--text-quaternary)', fontSize: 13, fontFamily: 'var(--font-body)' }}>
        <Eye size={24} style={{ opacity: 0.3 }} />
        <span>No file open</span>
      </div>
    );
  }

  if (!isHtml) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8, color: 'var(--text-quaternary)', fontSize: 13, fontFamily: 'var(--font-body)', padding: 24, textAlign: 'center' }}>
        <Eye size={24} style={{ opacity: 0.3 }} />
        <span>Preview is available for <code style={{ fontFamily: 'var(--font-mono)', background: 'var(--bg-surface-elevated)', padding: '2px 6px', borderRadius: 4 }}>.html</code> files.</span>
        <span style={{ fontSize: 12 }}>Open or create an HTML file to see a live preview.</span>
      </div>
    );
  }

  return (
    <iframe
      ref={iframeRef}
      sandbox="allow-scripts allow-same-origin"
      style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }}
      title="Live preview"
    />
  );
}
