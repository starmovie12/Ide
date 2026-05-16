/**
 * useStreaming — legacy Phase 1 hook, kept for backward-compat.
 * Live chat now goes through ChatFooter → executeOrchestration (Phase 3).
 */

import { useState, useCallback, useRef } from 'react';
import { streamAgentCall, toGeminiMessages } from '@/lib/ai/streaming';
import { buildXMLPrompt } from '@/lib/ai/xmlPrompt';
import { useChatStore } from '@/lib/store/chatStore';
import { useEditorStore } from '@/lib/store/editorStore';
import { useAPIKeyStore } from '@/lib/store/apiKeyStore';
import type { Agent } from '@/lib/store/agentStore';

export interface StreamingState {
  isStreaming: boolean;
  streamingText: string;
  error: string | null;
}

export function useStreaming() {
  const [state, setState] = useState<StreamingState>({
    isStreaming: false,
    streamingText: '',
    error: null,
  });

  const abortRef = useRef(false);
  const { activeChatId, getMessages, addMessage, createChat } = useChatStore();
  const { fileContents, activeFileId } = useEditorStore();
  const { keys } = useAPIKeyStore();

  const send = useCallback(
    async (prompt: string, agents: Agent[]) => {
      if (agents.length === 0) {
        setState((s) => ({ ...s, error: 'No agents active. Add an agent first.' }));
        return;
      }
      if (keys.length === 0) {
        setState((s) => ({ ...s, error: 'No API keys configured. Go to Settings to add one.' }));
        return;
      }

      const chatId = activeChatId ?? createChat(prompt.slice(0, 40));
      const messages = getMessages(chatId);

      abortRef.current = false;
      setState({ isStreaming: true, streamingText: '', error: null });

      addMessage(chatId, { role: 'user', content: prompt });

      let fullText = '';

      for (const agent of agents) {
        if (abortRef.current) break;

        const systemPrompt = buildXMLPrompt({
          name: agent.name,
          role: agent.role ?? '',
          systemPrompt: agent.systemPrompt,
          brainNotes: agent.brainNotes,
          fileContents,
          activeFile: activeFileId ?? undefined,
          routeOutputTo: agent.routeOutputTo ?? undefined,
        });

        const geminiMessages = toGeminiMessages(
          messages.map((m) => ({ role: m.role as 'user' | 'agent', content: m.content }))
        );
        geminiMessages.push({ role: 'user', parts: [{ text: prompt }] });

        await streamAgentCall(
          {
            model: agent.model,
            temperature: agent.temperature,
            systemInstruction: systemPrompt,
          },
          geminiMessages,
          (event) => {
            if (event.type === 'token') {
              fullText += event.text;
              setState((s) => ({ ...s, streamingText: s.streamingText + event.text }));
            } else if (event.type === 'done') {
              addMessage(chatId, { role: 'agent', content: fullText, agentId: agent.id });
            } else if (event.type === 'error') {
              setState((s) => ({ ...s, error: event.message }));
            }
          }
        );
      }

      setState({ isStreaming: false, streamingText: '', error: null });
    },
    [keys, activeChatId, getMessages, createChat, fileContents, activeFileId, addMessage]
  );

  const abort = useCallback(() => {
    abortRef.current = true;
    setState((s) => ({ ...s, isStreaming: false }));
  }, []);

  return { ...state, send, abort };
}
