import { useRef, useCallback, useEffect } from 'react';
import Editor, { OnMount, BeforeMount } from '@monaco-editor/react';
import { useEditorStore } from '@/lib/store/editorStore';

interface MonacoEditorProps {
  fileId: string;
  language: string;
  wordWrap?: boolean;
  minimap?: boolean;
  readOnly?: boolean;
}

const DEBOUNCE_MS = 400;

type MonacoInstance = Parameters<BeforeMount>[0];

function defineAgentStudioTheme(monaco: MonacoInstance) {
  monaco.editor.defineTheme('agent-studio-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '6272a4', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'bd93f9' },
      { token: 'string', foreground: 'f1fa8c' },
      { token: 'number', foreground: 'bd93f9' },
      { token: 'type', foreground: '8be9fd' },
      { token: 'class', foreground: '50fa7b' },
      { token: 'function', foreground: '50fa7b' },
      { token: 'variable', foreground: 'f8f8f2' },
      { token: 'delimiter', foreground: 'ff79c6' },
      { token: 'operator', foreground: 'ff79c6' },
      { token: 'tag', foreground: 'ff79c6' },
      { token: 'attribute.name', foreground: '50fa7b' },
      { token: 'attribute.value', foreground: 'f1fa8c' },
    ],
    colors: {
      'editor.background': '#0d0d12',
      'editor.foreground': '#e4e4f0',
      'editorLineNumber.foreground': '#3a3a4a',
      'editorLineNumber.activeForeground': '#7c6af7',
      'editor.lineHighlightBackground': '#1a1a2a',
      'editor.selectionBackground': '#7c6af740',
      'editor.inactiveSelectionBackground': '#7c6af720',
      'editor.wordHighlightBackground': '#7c6af720',
      'editorCursor.foreground': '#7c6af7',
      'editorWhitespace.foreground': '#2a2a3a',
      'editorIndentGuide.background1': '#2a2a3a',
      'editorIndentGuide.activeBackground1': '#7c6af740',
      'scrollbarSlider.background': '#2a2a3a80',
      'scrollbarSlider.hoverBackground': '#3a3a4a80',
      'scrollbarSlider.activeBackground': '#7c6af740',
      'editorWidget.background': '#13131f',
      'editorSuggestWidget.background': '#13131f',
      'editorSuggestWidget.border': '#2a2a3a',
      'editorSuggestWidget.selectedBackground': '#7c6af730',
      'input.background': '#1a1a2a',
      'input.foreground': '#e4e4f0',
      'input.border': '#2a2a3a',
      'focusBorder': '#7c6af7',
    },
  });
}

export function MonacoEditor({
  fileId,
  language,
  wordWrap = true,
  minimap = false,
  readOnly = false,
}: MonacoEditorProps) {
  const { fileContents, updateFileContent, markFileSaved } = useEditorStore();
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const content = fileContents[fileId] ?? '';

  const handleBeforeMount: BeforeMount = useCallback((monaco) => {
    defineAgentStudioTheme(monaco);
  }, []);

  const handleMount: OnMount = useCallback(
    (editor) => {
      editorRef.current = editor;

      editor.addCommand(
        2097 | 512,
        () => {
          markFileSaved(fileId);
        }
      );
    },
    [fileId, markFileSaved]
  );

  const handleChange = useCallback(
    (value: string | undefined) => {
      if (value === undefined) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        updateFileContent(fileId, value);
      }, DEBOUNCE_MS);
    },
    [fileId, updateFileContent]
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const model = editor.getModel();
    if (model && model.getValue() !== content) {
      const pos = editor.getPosition();
      model.setValue(content);
      if (pos) editor.setPosition(pos);
    }
  }, [content]);

  return (
    <Editor
      height="100%"
      language={language}
      value={content}
      theme="agent-studio-dark"
      beforeMount={handleBeforeMount}
      onMount={handleMount}
      onChange={handleChange}
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
          Loading editor…
        </div>
      }
      options={{
        readOnly,
        wordWrap: wordWrap ? 'on' : 'off',
        minimap: { enabled: minimap },
        lineNumbers: 'on',
        fontSize: 13,
        fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, monospace",
        fontLigatures: true,
        tabSize: 2,
        insertSpaces: true,
        scrollBeyondLastLine: false,
        smoothScrolling: true,
        cursorBlinking: 'smooth',
        cursorSmoothCaretAnimation: 'on',
        renderWhitespace: 'selection',
        bracketPairColorization: { enabled: true },
        guides: { bracketPairs: true, indentation: true },
        padding: { top: 12, bottom: 12 },
        overviewRulerLanes: 0,
        hideCursorInOverviewRuler: true,
        renderLineHighlight: 'line',
        contextmenu: true,
        automaticLayout: true,
        scrollbar: {
          verticalScrollbarSize: 6,
          horizontalScrollbarSize: 6,
          useShadows: false,
        },
      }}
    />
  );
}
