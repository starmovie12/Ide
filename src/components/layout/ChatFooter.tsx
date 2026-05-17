import { useState, useRef, useEffect, useCallback } from 'react';
import { SendHorizonal, Square, Upload } from 'lucide-react';
import { useChatStore } from '@/lib/store/chatStore';
import { useAgentStore } from '@/lib/store/agentStore';
import { useDiffStore } from '@/lib/store/diffStore';
import { useBlueprintStore } from '@/lib/store/blueprintStore';
import { useEditorStore } from '@/lib/store/editorStore';
import { executeOrchestration } from '@/lib/ai/orchestrator';
import { useAutoTitle } from '@/hooks/useAutoTitle';
import { handleZipImport } from '@/lib/io/zipImportHandler';
import { applyAllDiffBlocks } from '@/lib/diff/apply';
import type { SearchReplaceBlock } from '@/lib/diff/parser';

/**
 * v6.1 fixes (May 2026):
 *   FIX-C1 — Previously this only emitted `addDiff` events to the diffStore
 *            (which queues diffs for manual user accept). It NEVER passed
 *            `applyDiffs` to executeOrchestration, so the orchestrator's
 *            GitHub-push branch was unreachable — it requires the applied
 *            file map. Now we pass an applyDiffs callback that mutates
 *            editorStore in-place and returns the updated content map so
 *            the orchestrator can hand it to pushChangeSet.
 *   FIX-C2 — `githubContext` is now provided when a GitHub repo is
 *            connected for the chat. Without this, PR creation was dead
 *            code regardless of fix-C1.
 *   FIX-C3 — Chat history sent to agents previously filtered to ONLY user
 *            messages, dropping all prior agent replies. That made multi-
 *            turn refinement impossible ("you mentioned earlier…" stopped
 *            working). Now we send the full role-tagged history.
 */
export function ChatFooter() {
  const [message, setMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importStatus, setImportStatus] = useState<string | null>(null);

  const {
    activeChatId,
    createChat,
    addMessage,
    appendToMessage,
    updateMessage,
    streamingMessageId,
    setStreamingMessageId,
    setActiveAgentId,
    getMessages,
    chats,
  } = useChatStore();

  const { getChatAgents, templateAgents, cloneTemplatesToChat } = useAgentStore();
  const { addDiff } = useDiffStore();
  const { getBlueprint, getRepoConnection } = useBlueprintStore();
  const { autoTitle } = useAutoTitle();

  const isStreaming = !!streamingMessageId;

  const handleInput = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
    setMessage(ta.value);
  };

  /**
   * FIX-C1 — Apply diffs to the in-memory editor state and return the updated
   * file map. This is the contract the orchestrator expects so it can push the
   * resulting file contents to GitHub.
   *
   * Strategy:
   *   1. Group incoming diffs by filePath
   *   2. For each path, find the current content (editorStore.fileContents,
   *      falling back to file.content, falling back to empty string for new files)
   *   3. Apply all blocks for that file in order via applyAllDiffBlocks
   *   4. Write the result back through editorStore.updateFileContent (or
   *      createFile when the file is brand new)
   *   5. Return { path → finalContent } for every touched file
   *
   * The orchestrator uses paths (not editor ids) as map keys, because GitHub
   * push works on paths. We keep editor ids internal to the editor store.
   */
  const applyDiffsForOrchestrator = useCallback(
    async (diffs: SearchReplaceBlock[]): Promise<Record<string, string>> => {
      if (diffs.length === 0) return {};
      const editor = useEditorStore.getState();

      const byPath = new Map<string, SearchReplaceBlock[]>();
      for (const d of diffs) {
        const arr = byPath.get(d.filePath) ?? [];
        arr.push(d);
        byPath.set(d.filePath, arr);
      }

      const result: Record<string, string> = {};

      for (const [filePath, blocks] of byPath) {
        const fileEntry = editor.files.find(
          (f) => f.path === filePath || f.id === filePath
        );
        const original = fileEntry
          ? editor.fileContents[fileEntry.id] ?? fileEntry.content
          : '';

        // applyAllDiffBlocks expects the DiffBlock shape, not SearchReplaceBlock
        const diffBlocks = blocks.map((b) => ({
          filePath: b.filePath,
          searchContent: b.search,
          replaceContent: b.replace,
          raw: b.search,
        }));

        const { content } = applyAllDiffBlocks(original, diffBlocks);

        if (fileEntry) {
          editor.updateFileContent(fileEntry.id, content);
        } else {
          editor.createFile(filePath, content);
        }
        result[filePath] = content;
      }

      return result;
    },
    []
  );

  const handleSend = useCallback(async () => {
    const text = message.trim();
    if (!text || isStreaming) return;

    let chatId = activeChatId;
    const isNewChat = !chatId;
    if (!chatId) {
      chatId = createChat(text.slice(0, 40));
    }

    cloneTemplatesToChat(chatId);
    const agents = getChatAgents(chatId);
    const agentsToUse = agents.length > 0 ? agents : templateAgents.filter((a) => a.active);

    setMessage('');
    if (textareaRef.current) {
      textareaRef.current.value = '';
      textareaRef.current.style.height = 'auto';
    }

    addMessage(chatId, { role: 'user', content: text });

    // Bug #B11: Auto-generate a short title after the first user message
    const existingMessages = getMessages(chatId).filter((m) => m.role === 'user');
    const isFirstMessage = isNewChat || existingMessages.length <= 1;
    const chatTitle = chats.find((c) => c.id === chatId)?.title ?? '';
    if (isFirstMessage && (chatTitle === 'New Chat' || chatTitle.length <= 40)) {
      autoTitle(chatId, text);
    }

    // FIX-C3 — pass full chat history (not user-only) so agents have context
    const chatHistory = getMessages(chatId);

    const abort = new AbortController();
    abortRef.current = abort;

    const agentMessageIds = new Map<string, string>();

    // Get active blueprint for this chat
    const blueprint = getBlueprint(chatId);

    // FIX-C2 — wire GitHub repo connection when present
    const repoConnection = getRepoConnection(chatId);
    const githubContext = repoConnection
      ? {
          token: repoConnection.token,
          owner: repoConnection.owner,
          repo: repoConnection.repo,
          defaultBranch: repoConnection.ref || 'main',
          chatId,
        }
      : undefined;

    await executeOrchestration({
      agents: agentsToUse,
      userPrompt: text,
      chatHistory,
      signal: abort.signal,
      blueprint: blueprint?.status === 'ready' ? blueprint : null,
      githubContext,
      applyDiffs: applyDiffsForOrchestrator,
      onEvent: (event) => {
        if (abort.signal.aborted) return;

        if (event.type === 'agent_start') {
          const msgId = addMessage(chatId!, {
            role: 'agent',
            content: '',
            agentId: event.agentId,
            agentName: event.agentName,
            agentEmoji: event.emoji,
            agentColorIndex: event.colorIndex,
            isStreaming: true,
          });
          agentMessageIds.set(event.agentId, msgId);
          setStreamingMessageId(msgId);
          setActiveAgentId(event.agentId);
        } else if (event.type === 'agent_token') {
          const msgId = agentMessageIds.get(event.agentId);
          if (msgId) {
            appendToMessage(chatId!, msgId, event.token);
          }
        } else if (event.type === 'agent_complete') {
          const msgId = agentMessageIds.get(event.agentId);
          if (msgId) {
            updateMessage(chatId!, msgId, { isStreaming: false });
          }
          setActiveAgentId(null);
        } else if (event.type === 'diffs_extracted') {
          const msgId = agentMessageIds.get(event.agentId);
          if (msgId) {
            updateMessage(chatId!, msgId, { hasDiff: true });
          }
          // Still queue diffs in the diffStore so the user can see/review them
          // even though they're also auto-applied via applyDiffsForOrchestrator
          // (the diffStore's per-diff accept/reject UI remains useful for
          // pre-PR auditing).
          for (const diff of event.diffs) {
            addDiff({
              filePath: diff.filePath,
              searchContent: diff.searchContent,
              replaceContent: diff.replaceContent,
              agentName: event.agentName,
              acceptedAt: Date.now(),
            });
          }
        } else if (event.type === 'routing_transition') {
          setActiveAgentId(event.toAgentId);
        } else if (event.type === 'pr_opened') {
          addMessage(chatId!, {
            role: 'system',
            content:
              `✅ PR #${event.prNumber} opened on ${event.branch}\n${event.prUrl}` +
              (event.previewUrl ? `\nPreview: ${event.previewUrl}` : ''),
          });
        } else if (event.type === 'all_complete') {
          setStreamingMessageId(null);
          setActiveAgentId(null);
          abortRef.current = null;
        } else if (event.type === 'error') {
          addMessage(chatId!, {
            role: 'system',
            content: `Error: ${event.message}`,
          });
          setStreamingMessageId(null);
          setActiveAgentId(null);
          abortRef.current = null;
        }
      },
    });
  }, [
    message,
    isStreaming,
    activeChatId,
    createChat,
    addMessage,
    appendToMessage,
    updateMessage,
    streamingMessageId,
    setStreamingMessageId,
    setActiveAgentId,
    getMessages,
    getChatAgents,
    templateAgents,
    cloneTemplatesToChat,
    addDiff,
    getBlueprint,
    getRepoConnection,
    autoTitle,
    chats,
    applyDiffsForOrchestrator,
  ]);

  const handleStop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreamingMessageId(null);
    setActiveAgentId(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  // ZIP import
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    setImportStatus('Importing…');
    try {
      const { count } = await handleZipImport(file);
      setImportStatus(`Imported ${count} files`);
      setTimeout(() => setImportStatus(null), 3000);
    } catch (err) {
      setImportStatus(err instanceof Error ? err.message : 'Import failed');
      setTimeout(() => setImportStatus(null), 4000);
    }
  };

  useEffect(() => {
    const handler = (e: Event) => {
      const { text } = (e as CustomEvent<{ text: string; chatId: string }>).detail;
      if (textareaRef.current) {
        textareaRef.current.value = text;
        setMessage(text);
        textareaRef.current.focus();
      }
    };
    window.addEventListener('chat:send', handler);
    return () => window.removeEventListener('chat:send', handler);
  }, []);

  const activeAgentCount = (() => {
    const chatId = activeChatId;
    if (!chatId) return templateAgents.filter((a) => a.active).length;
    const chatAgents = getChatAgents(chatId);
    return chatAgents.length > 0 ? chatAgents.length : templateAgents.filter((a) => a.active).length;
  })();

  const canSend = message.trim().length > 0 && !isStreaming;

  return (
    <footer
      // v6.1 — `mb-20 sm:mb-0` pushes the input above the floating Glass
      // Island on mobile (the island is `sm:hidden` so on desktop we
      // remove the margin to keep the footer flush with the viewport
      // bottom). 80 px clearance = island height (~60) + 20 inset.
      className="mb-20 sm:mb-0"
      style={{
        background: 'var(--bg-surface)',
        borderTop: '1px solid var(--border-default)',
        padding: '10px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        flexShrink: 0,
      }}
    >
      {importStatus && (
        <div style={{
          fontSize: 12, color: 'var(--color-info)', fontFamily: 'var(--font-body)',
          padding: '4px 10px', borderRadius: 6, background: 'var(--color-info-subtle)',
          border: '1px solid rgba(56,189,248,0.2)', alignSelf: 'flex-start',
        }}>
          {importStatus}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
        {/* ZIP import */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".zip"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
        <button
          data-testid="button-attach-file"
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center justify-center rounded-lg transition-colors duration-150 hover:bg-[var(--bg-surface-elevated)] active:scale-95 flex-shrink-0"
          style={{
            width: 40, height: 40, border: 'none', background: 'none',
            color: 'var(--text-tertiary)', cursor: 'pointer',
          }}
          aria-label="Import ZIP"
          title="Import ZIP"
        >
          <Upload size={18} />
        </button>

        <div
          style={{
            flex: 1, display: 'flex', alignItems: 'flex-end', gap: 8,
            background: 'var(--bg-surface-sunken)', border: '1px solid var(--border-default)',
            borderRadius: 12, padding: '8px 12px', transition: 'border-color 200ms',
          }}
          onFocusCapture={(e) => { e.currentTarget.style.borderColor = 'var(--border-accent)'; }}
          onBlurCapture={(e) => { e.currentTarget.style.borderColor = 'var(--border-default)'; }}
        >
          <textarea
            data-testid="textarea-message-input"
            ref={textareaRef}
            onInput={handleInput}
            onKeyDown={handleKeyDown}
            placeholder={
              isStreaming
                ? 'Agents are working…'
                : activeAgentCount === 0
                ? 'Add agents first, then type a prompt…'
                : 'Type a message… Ctrl+Enter to send'
            }
            disabled={isStreaming}
            rows={1}
            style={{
              flex: 1, background: 'none', border: 'none', outline: 'none',
              resize: 'none', fontSize: 14, color: 'var(--text-primary)',
              fontFamily: 'var(--font-body)', lineHeight: 1.5, maxHeight: 160,
              overflowY: 'auto', opacity: isStreaming ? 0.5 : 1,
            }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {activeAgentCount > 0 && (
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)', whiteSpace: 'nowrap',
              }}
              className="hidden sm:flex"
            >
              <span
                style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: isStreaming ? 'var(--color-warning)' : 'var(--color-api-active)',
                  display: 'inline-block',
                  animation: isStreaming ? 'ping 1.5s ease-in-out infinite' : 'none',
                }}
              />
              {activeAgentCount} {activeAgentCount === 1 ? 'agent' : 'agents'}
            </div>
          )}

          {isStreaming ? (
            <button
              data-testid="button-stop-streaming"
              onClick={handleStop}
              className="flex items-center justify-center rounded-lg transition-all duration-150 active:scale-95"
              style={{
                width: 40, height: 40, background: 'var(--color-destructive)',
                border: 'none', color: 'white', cursor: 'pointer',
              }}
              aria-label="Stop generation"
            >
              <Square size={14} fill="white" />
            </button>
          ) : (
            <button
              data-testid="button-send-message"
              onClick={handleSend}
              disabled={!canSend}
              className="flex items-center justify-center rounded-lg transition-all duration-150 active:scale-95"
              style={{
                width: 40, height: 40,
                background: canSend ? 'var(--color-primary)' : 'var(--bg-surface-elevated)',
                border: 'none',
                color: canSend ? 'white' : 'var(--text-quaternary)',
                cursor: canSend ? 'pointer' : 'not-allowed',
                transition: 'background 200ms, color 200ms',
              }}
              aria-label="Send message"
            >
              <SendHorizonal size={16} />
            </button>
          )}
        </div>
      </div>
    </footer>
  );
}
