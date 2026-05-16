import { useState, useRef, useEffect, useCallback } from 'react';
import { SendHorizonal, Square, Upload } from 'lucide-react';
import { useChatStore } from '@/lib/store/chatStore';
import { useAgentStore } from '@/lib/store/agentStore';
import { useDiffStore } from '@/lib/store/diffStore';
import { useBlueprintStore } from '@/lib/store/blueprintStore';
import { executeOrchestration } from '@/lib/ai/orchestrator';
import { useAutoTitle } from '@/hooks/useAutoTitle';
import { handleZipImport } from '@/lib/io/zipImportHandler';

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
  const { getBlueprint } = useBlueprintStore();
  const { autoTitle } = useAutoTitle();

  const isStreaming = !!streamingMessageId;

  const handleInput = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
    setMessage(ta.value);
  };

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

    const chatHistory = getMessages(chatId).filter((m) => m.role === 'user');

    const abort = new AbortController();
    abortRef.current = abort;

    const agentMessageIds = new Map<string, string>();

    // Get active blueprint for this chat
    const blueprint = getBlueprint(chatId);

    await executeOrchestration({
      agents: agentsToUse,
      userPrompt: text,
      chatHistory,
      signal: abort.signal,
      blueprint: blueprint?.status === 'ready' ? blueprint : null,
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
          for (const diff of event.diffs) {
            addDiff({
              filePath: diff.filePath,
              searchContent: diff.searchContent,
              replaceContent: diff.replaceContent,
              agentName: event.agentName,
              acceptedAt: null,
            });
          }
        } else if (event.type === 'routing_transition') {
          setActiveAgentId(event.toAgentId);
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
    autoTitle,
    chats,
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
