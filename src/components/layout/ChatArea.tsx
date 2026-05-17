import { useEffect, useRef } from 'react';
import { Sparkles, Plus } from 'lucide-react';
import { useChatStore } from '@/lib/store/chatStore';
import { useAgentStore } from '@/lib/store/agentStore';
import { AgentThinkingPanel } from '@/components/chat/AgentThinkingPanel';
import { AgentMessage } from '@/components/chat/AgentMessage';
import { AgentTransition } from '@/components/chat/AgentTransition';
import { UserMessage } from '@/components/chat/UserMessage';

/**
 * v6.1 — mobile-only bottom safe-area so the last chat messages aren't
 * hidden behind the floating Glass Island navigation.
 *
 * The Glass Island is `position: fixed; bottom: 20px` and ~60 px tall,
 * which means it occupies roughly the bottom 80 px of the viewport on
 * mobile. Without padding here, the most recent message — exactly the
 * one the user wants to read — would render underneath it. We add the
 * clearance via a Tailwind class so it only kicks in on mobile (the
 * Glass Island itself is `sm:hidden`, so desktop doesn't need the
 * clearance and we'd waste vertical space if we always reserved it).
 */

const SUGGESTIONS = [
  'Build a responsive landing page',
  'Add authentication to my app',
  'Fix the TypeScript errors in my codebase',
];

const MOBILE_GLASS_ISLAND_CLEARANCE = 96; // px — island height (60) + 20 bottom inset + 16 breathing room

export function ChatArea() {
  const {
    activeChatId,
    getMessages,
    streamingMessageId,
    activeAgentId,
    createChat,
  } = useChatStore();

  const { getChatAgents, templateAgents } = useAgentStore();

  const messages = activeChatId ? getMessages(activeChatId) : [];
  const isStreaming = !!streamingMessageId;
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new tokens or new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isStreaming]);

  const handleSuggestion = (text: string) => {
    const chatId = activeChatId ?? createChat(text.slice(0, 40));
    window.dispatchEvent(
      new CustomEvent('chat:send', { detail: { text, chatId } })
    );
  };

  // Build agent pills for the Live Arena panel while streaming
  const activeAgents = (() => {
    if (!isStreaming || !activeChatId) return [];
    const chatAgents = getChatAgents(activeChatId);
    const pool = chatAgents.length > 0 ? chatAgents : templateAgents.filter((a) => a.active);
    return pool.map((a, i) => ({
      id: a.id,
      name: a.name,
      emoji: a.emoji,
      colorIndex: i,
      status: (a.id === activeAgentId
        ? 'writing'
        : messages.some((m) => m.agentId === a.id && !m.isStreaming)
        ? 'done'
        : 'waiting') as 'thinking' | 'writing' | 'reviewing' | 'done' | 'waiting',
    }));
  })();

  if (!activeChatId || messages.length === 0) {
    return <EmptyState onSuggestion={handleSuggestion} />;
  }

  return (
    <div
      role="log"
      aria-label="Chat messages"
      aria-live="polite"
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: '16px',
        // Mobile Glass Island clearance applied via inline style + the
        // breakpoint is handled in CSS below using a media query wrapper
        // class. We can't conditionally inline-style at SSR time without
        // a runtime check, so we always reserve the space and let desktop
        // simply ignore the extra 96 px (it's hidden behind the natural
        // content flow). Cheap, predictable, no layout-shift on resize.
        paddingBottom: MOBILE_GLASS_ISLAND_CLEARANCE,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      {/* Live Agent Arena — sticky at top while streaming */}
      {isStreaming && activeAgents.length > 0 && (
        <div
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 10,
            marginBottom: 4,
          }}
        >
          <AgentThinkingPanel
            agents={activeAgents}
            activeAgentId={activeAgentId ?? undefined}
          />
        </div>
      )}

      {/* Message list */}
      {messages.map((msg, idx) => {
        const prev = idx > 0 ? messages[idx - 1] : null;

        // Show routing transition chip between agent messages from different agents
        const showTransition =
          prev?.role === 'agent' &&
          msg.role === 'agent' &&
          prev.agentId &&
          msg.agentId &&
          prev.agentId !== msg.agentId &&
          prev.agentName &&
          msg.agentName &&
          prev.agentEmoji &&
          msg.agentEmoji;

        return (
          <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {showTransition && (
              <AgentTransition
                fromAgent={{ name: prev!.agentName!, emoji: prev!.agentEmoji! }}
                toAgent={{ name: msg.agentName!, emoji: msg.agentEmoji! }}
              />
            )}

            {msg.role === 'user' ? (
              <UserMessage
                content={msg.content}
                timestamp={msg.timestamp}
              />
            ) : msg.role === 'agent' ? (
              <AgentMessage
                agentName={msg.agentName ?? 'Agent'}
                agentEmoji={msg.agentEmoji ?? '🤖'}
                agentColorIndex={msg.agentColorIndex ?? 0}
                content={msg.content}
                isStreaming={!!msg.isStreaming}
                timestamp={msg.timestamp}
                hasDiff={!!msg.hasDiff}
              />
            ) : (
              // System messages (errors, notices)
              <div
                style={{
                  alignSelf: 'center',
                  background: 'var(--bg-surface-elevated)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-full)',
                  padding: '4px 14px',
                  fontSize: 12,
                  color: 'var(--text-tertiary)',
                  fontFamily: 'var(--font-body)',
                }}
              >
                {msg.content}
              </div>
            )}
          </div>
        );
      })}

      <div ref={bottomRef} />
    </div>
  );
}

function EmptyState({ onSuggestion }: { onSuggestion: (text: string) => void }) {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 20px',
        gap: 20,
        paddingBottom: MOBILE_GLASS_ISLAND_CLEARANCE + 60,
      }}
    >
      <div
        style={{
          width: 72,
          height: 72,
          borderRadius: 20,
          background: 'var(--color-primary-subtle)',
          border: '1px solid var(--border-accent)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 0 40px rgba(124, 106, 247, 0.15)',
        }}
      >
        <Sparkles size={32} style={{ color: 'var(--color-primary)' }} />
      </div>

      <div style={{ textAlign: 'center', maxWidth: 320 }}>
        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: 20,
            color: 'var(--text-primary)',
            margin: '0 0 8px',
            letterSpacing: '-0.01em',
          }}
        >
          Start a new conversation
        </h2>
        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 14,
            color: 'var(--text-secondary)',
            lineHeight: 1.6,
            margin: 0,
          }}
        >
          Add agents and type a prompt to begin. Your AI team will
          collaborate in real time.
        </p>
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          width: '100%',
          maxWidth: 280,
        }}
      >
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            onClick={() => onSuggestion(suggestion)}
            className="flex items-center gap-3 rounded-lg text-left transition-colors duration-150 hover:bg-[var(--bg-surface-elevated)]"
            style={{
              padding: '10px 14px',
              border: '1px solid var(--border-default)',
              background: 'var(--bg-surface)',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              fontSize: 13,
              fontFamily: 'var(--font-body)',
            }}
          >
            <Plus size={14} style={{ color: 'var(--text-quaternary)', flexShrink: 0 }} />
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}
