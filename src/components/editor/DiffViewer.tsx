import { useMemo } from 'react';
import { DiffEditor, BeforeMount } from '@monaco-editor/react';
import { useDiffStore } from '@/lib/store/diffStore';
import { useEditorStore } from '@/lib/store/editorStore';
import { applyAllDiffBlocks } from '@/lib/diff/apply';

type MonacoInstance = Parameters<BeforeMount>[0];

interface DiffViewerProps {
  filePath: string;
  inline?: boolean;
}

function defineTheme(monaco: MonacoInstance) {
  try {
    monaco.editor.defineTheme('agent-studio-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '6272a4', fontStyle: 'italic' },
        { token: 'keyword', foreground: 'bd93f9' },
        { token: 'string', foreground: 'f1fa8c' },
        { token: 'number', foreground: 'bd93f9' },
        { token: 'type', foreground: '8be9fd' },
        { token: 'function', foreground: '50fa7b' },
      ],
      colors: {
        'editor.background': '#0d0d12',
        'editor.foreground': '#e4e4f0',
        'diffEditor.insertedTextBackground': '#4ade8025',
        'diffEditor.removedTextBackground': '#f8717125',
        'diffEditor.insertedLineBackground': '#4ade8015',
        'diffEditor.removedLineBackground': '#f8717115',
        'editorLineNumber.foreground': '#3a3a4a',
        'editorLineNumber.activeForeground': '#7c6af7',
        'editorCursor.foreground': '#7c6af7',
        'scrollbarSlider.background': '#2a2a3a80',
      },
    });
  } catch {
  }
}

export function DiffViewer({ filePath, inline = true }: DiffViewerProps) {
  const { pendingDiffs } = useDiffStore();
  const { files, fileContents } = useEditorStore();

  const fileEntry = files.find((f) => f.path === filePath);
  const original = fileEntry
    ? (fileContents[fileEntry.id] ?? fileEntry.content)
    : '';

  const diffsForFile = pendingDiffs.filter((d) => d.filePath === filePath);

  const modified = useMemo(() => {
    if (diffsForFile.length === 0) return original;
    const blocks = diffsForFile.map((b) => ({
      filePath: b.filePath,
      searchContent: b.searchContent,
      replaceContent: b.replaceContent,
      raw: b.searchContent,
    }));
    const { content } = applyAllDiffBlocks(original, blocks);
    return content;
  }, [original, diffsForFile]);

  const lang = fileEntry?.language ?? 'plaintext';

  const handleBeforeMount: BeforeMount = (monaco) => {
    defineTheme(monaco);
  };

  if (diffsForFile.length === 0) {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-quaternary)',
          fontSize: 13,
          fontFamily: 'var(--font-body)',
        }}
      >
        No pending diffs for this file.
      </div>
    );
  }

  return (
    <DiffEditor
      height="100%"
      language={lang}
      original={original}
      modified={modified}
      theme="agent-studio-dark"
      beforeMount={handleBeforeMount}
      options={{
        renderSideBySide: !inline,
        readOnly: true,
        fontSize: 13,
        fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, monospace",
        fontLigatures: true,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        automaticLayout: true,
        renderOverviewRuler: false,
        scrollbar: {
          verticalScrollbarSize: 6,
          horizontalScrollbarSize: 6,
        },
        padding: { top: 8, bottom: 8 },
        lineNumbers: 'on',
        ignoreTrimWhitespace: false,
        renderIndicators: true,
        enableSplitViewResizing: false,
        originalEditable: false,
      }}
      loading={
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
          Loading diff…
        </div>
      }
    />
  );
}
