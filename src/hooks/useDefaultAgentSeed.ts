import { useEffect } from 'react';
import { useAgentStore } from '@/lib/store/agentStore';
import { DEFAULT_AGENTS } from '@/lib/ai/constants';

/**
 * Seeds the default agents on first launch (when agent store is empty).
 * Call once at the App root.
 */
export function useDefaultAgentSeed() {
  const templateAgents = useAgentStore((s) => s.templateAgents);
  const addTemplate = useAgentStore((s) => s.addTemplate);

  useEffect(() => {
    if (templateAgents.length === 0) {
      for (const agent of DEFAULT_AGENTS) {
        addTemplate({
          name: agent.name,
          emoji: agent.emoji,
          role: agent.role,
          color: agent.color,
          model: agent.model,
          temperature: agent.temperature,
          systemPrompt: agent.systemPrompt,
          isDefault: agent.isDefault,
          active: agent.active,
          order: agent.order,
          routeOutputTo: null,
          brainNotes: '',
          brainFileIds: [],
        });
      }
    }
  }, []); // Run once on mount
}
