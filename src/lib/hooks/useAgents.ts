import { useAgentStore, type Agent } from '@/lib/store/agentStore';
import { useChatStore } from '@/lib/store/chatStore';
import { useMemo } from 'react';

export function useAgents() {
  const {
    templateAgents,
    chatAgents,
    agents,
    activeAgents,
    addTemplate,
    updateTemplate,
    deleteTemplate,
    reorderTemplates,
    addAgent,
    removeAgent,
    updateAgent,
    toggleActive,
    reorderAgents,
    cloneTemplatesToChat,
    addAgentToChat,
    updateChatAgent,
    removeChatAgent,
    reorderChatAgents,
    getChatAgents,
  } = useAgentStore();

  const { activeChatId } = useChatStore();

  const currentChatAgents = useMemo<Agent[]>(() => {
    if (!activeChatId) return [];
    return chatAgents[activeChatId] ?? [];
  }, [chatAgents, activeChatId]);

  const agentById = useMemo(() => {
    const map = new Map<string, Agent>();
    for (const a of templateAgents) map.set(a.id, a);
    return map;
  }, [templateAgents]);

  const chatAgentById = useMemo(() => {
    const map = new Map<string, Agent>();
    for (const a of currentChatAgents) map.set(a.id, a);
    return map;
  }, [currentChatAgents]);

  return {
    // Template agents (Settings library)
    templateAgents,
    agents,               // backward compat alias
    activeAgents,

    // Current chat agents
    currentChatAgents,
    chatAgentById,

    // Maps
    agentById,

    // Counts
    templateCount: templateAgents.length,
    chatAgentCount: currentChatAgents.length,

    // Template actions
    addTemplate,
    updateTemplate,
    deleteTemplate,
    reorderTemplates,

    // Backward compat
    addAgent,
    removeAgent,
    updateAgent,
    toggleActive,
    reorderAgents,

    // Chat-instance actions
    cloneTemplatesToChat,
    addAgentToChat,
    updateChatAgent,
    removeChatAgent,
    reorderChatAgents,
    getChatAgents,

    // Helpers
    activeChatId,
  };
}
