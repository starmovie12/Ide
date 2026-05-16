/**
 * Multi-Agent Orchestrator — Phase 5
 * Executes agents in DAG order, streaming events for each.
 * Post-processes agent output for Aider-style diff blocks.
 * Injects blueprint context when available.
 * Auto-resumes truncated outputs.
 */

import { streamAgentCall, toGeminiMessages } from './streaming';
import { buildXMLPrompt, buildContinuationPrompt } from './xmlPrompt';
import { parseDiffBlocks, hasDiffBlocks } from '@/lib/diff/parser';
import type { DiffBlock } from '@/lib/diff/parser';
import type { Agent } from '@/lib/store/agentStore';
import type { ChatMessage } from '@/lib/store/chatStore';
import { DEFAULT_MODEL } from './constants';
import { selectRelevantContext, formatBlueprintContext } from '@/lib/blueprint/selector';
import type { RepoBlueprint } from '@/lib/blueprint/types';

export type OrchestrationEvent =
  | { type: 'agent_start'; agentId: string; agentName: string; emoji: string; colorIndex: number }
  | { type: 'agent_token'; agentId: string; token: string }
  | { type: 'agent_complete'; agentId: string; fullText: string; totalTokens: number }
  | { type: 'diffs_extracted'; agentId: string; agentName: string; diffs: DiffBlock[] }
  | { type: 'routing_transition'; fromAgentId: string; toAgentId: string; fromName: string; toName: string }
  | { type: 'all_complete' }
  | { type: 'error'; message: string };

export interface OrchestrationConfig {
  agents: Agent[];
  userPrompt: string;
  chatHistory: ChatMessage[];
  onEvent: (event: OrchestrationEvent) => void;
  signal?: AbortSignal;
  blueprint?: RepoBlueprint | null;
}

function buildExecutionChain(agents: Agent[]): Agent[] | null {
  if (agents.length === 0) return [];

  const agentMap = new Map(agents.map((a) => [a.id, a]));

  const firstAgent =
    agents.find((a) => !agents.some((other) => other.routeOutputTo === a.id)) ?? agents[0];

  const chain: Agent[] = [];
  const visited = new Set<string>();
  let current: Agent | undefined = firstAgent;

  while (current) {
    if (visited.has(current.id)) return null;
    visited.add(current.id);
    chain.push(current);
    const nextId: string | null | undefined = current.routeOutputTo;
    current = nextId ? agentMap.get(nextId) : undefined;
  }

  for (const agent of agents) {
    if (!visited.has(agent.id)) chain.push(agent);
  }

  return chain;
}

const AGENT_COLORS = ['#7c6af7', '#4ade80', '#f59e0b', '#38bdf8', '#ec4899'];
const MAX_CONTINUATION = 5;

export async function executeOrchestration(config: OrchestrationConfig): Promise<void> {
  const { agents, userPrompt, chatHistory, onEvent, signal, blueprint } = config;

  if (agents.length === 0) {
    onEvent({ type: 'error', message: 'No agents selected. Add agents from the pill bar.' });
    return;
  }

  const chain = buildExecutionChain(agents);
  if (chain === null) {
    onEvent({
      type: 'error',
      message: 'Agent routing cycle detected. Please fix the routing configuration.',
    });
    return;
  }

  // Build blueprint context injection string once
  let blueprintContext = '';
  if (blueprint?.status === 'ready') {
    const selection = selectRelevantContext(blueprint, userPrompt);
    blueprintContext = formatBlueprintContext(selection);
  }

  let previousAgentOutput = '';
  let previousAgent: Agent | null = null;

  for (let i = 0; i < chain.length; i++) {
    const agent = chain[i];

    if (signal?.aborted) break;

    if (previousAgent) {
      onEvent({
        type: 'routing_transition',
        fromAgentId: previousAgent.id,
        toAgentId: agent.id,
        fromName: previousAgent.name,
        toName: agent.name,
      });
    }

    const colorIndex = i % AGENT_COLORS.length;
    onEvent({
      type: 'agent_start',
      agentId: agent.id,
      agentName: agent.name,
      emoji: agent.emoji,
      colorIndex,
    });

    const systemPrompt = buildXMLPrompt({
      name: agent.name,
      role: agent.role || agent.name,
      systemPrompt: agent.systemPrompt,
      brainNotes: agent.brainNotes,
      routeOutputTo: agent.routeOutputTo
        ? agents.find((a) => a.id === agent.routeOutputTo)?.name ?? null
        : null,
      isReviewer: agent.role?.toLowerCase().includes('review') ?? false,
    });

    const historyMessages = toGeminiMessages(chatHistory);

    // Assemble user content with optional blueprint context and previous agent output
    let userContent = userPrompt;
    if (blueprintContext) {
      userContent = `${blueprintContext}\n\n${userContent}`;
    }
    if (previousAgentOutput) {
      userContent = `${userContent}\n\n--- Previous agent output ---\n${previousAgentOutput}`;
    }

    const contents = [
      ...historyMessages,
      {
        role: 'user' as const,
        parts: [{ text: userContent }],
      },
    ];

    let fullText = '';
    let tokenCount = 0;
    let truncated = false;

    const modelId = agent.model || DEFAULT_MODEL;

    await streamAgentCall(
      {
        model: modelId,
        temperature: agent.temperature ?? 0.7,
        maxOutputTokens: 8192,
        systemInstruction: systemPrompt,
      },
      contents,
      (event) => {
        if (event.type === 'token') {
          fullText += event.text;
          tokenCount += Math.ceil(event.text.length / 4);
          onEvent({ type: 'agent_token', agentId: agent.id, token: event.text });
        } else if (event.type === 'done') {
          truncated = false;
        } else if (event.type === 'error') {
          onEvent({ type: 'error', message: event.message });
        }
      }
    );

    // Auto-resume truncated outputs (Bug #B3)
    if (truncated) {
      let continuationAttempts = 0;
      while (truncated && continuationAttempts < MAX_CONTINUATION && !signal?.aborted) {
        continuationAttempts++;
        const anchor = fullText.slice(-300);
        const continuationPrompt = buildContinuationPrompt(anchor);
        let continuationDone = false;

        await streamAgentCall(
          {
            model: modelId,
            temperature: 0,
            maxOutputTokens: 8192,
            systemInstruction: systemPrompt,
          },
          [
            ...contents,
            { role: 'model' as const, parts: [{ text: fullText }] },
            { role: 'user' as const, parts: [{ text: continuationPrompt }] },
          ],
          (event) => {
            if (event.type === 'token') {
              fullText += event.text;
              tokenCount += Math.ceil(event.text.length / 4);
              onEvent({ type: 'agent_token', agentId: agent.id, token: event.text });
            } else if (event.type === 'done') {
              continuationDone = true;
              truncated = false;
            } else if (event.type === 'error') {
              continuationDone = true;
              truncated = false;
            }
          }
        );

        if (!continuationDone) break;
      }
    }

    onEvent({ type: 'agent_complete', agentId: agent.id, fullText, totalTokens: tokenCount });

    if (hasDiffBlocks(fullText)) {
      const diffs = parseDiffBlocks(fullText);
      if (diffs.length > 0) {
        onEvent({ type: 'diffs_extracted', agentId: agent.id, agentName: agent.name, diffs });
      }
    }

    previousAgentOutput = fullText;
    previousAgent = agent;
  }

  onEvent({ type: 'all_complete' });
}
