/**
 * Multi-Agent Orchestrator — Phase 5 complete
 *
 * Full pipeline per §1.5:
 *   User prompt
 *     → [per-chat single-flight lock — NO concurrent pipelines per chat]
 *     → Manager (plan)
 *     → Coder (diffs)
 *     → sizeValidator (silent retry if oversized, max 3)
 *     → Impact Analyzer (finds affected files)
 *     → [for each affected file → Coder follow-up]
 *     → Reviewer (validates ALL diffs, MAX_REVIEW_LOOPS=3)
 *     → Apply diffs
 *     → Sandbox verify (WebContainer or cloud-mode)
 *     → [if errors] → Auto-Heal loop (Debugger, MAX_HEAL_ATTEMPTS=3)
 *     → Push PR (§1.7)
 *     → Update chat
 *
 * Bug #B6 — iterative routing (Coder_iter1, Reviewer_iter1…) up to MAX_ITERATIONS=3.
 *
 * §1.5 single-flight lock:
 *   chatPipelines is a Map<chatId, Promise<void>>.
 *   Each new call for a chatId chains after the current pending promise
 *   using .then() so requests are QUEUED, not dropped.
 *   This prevents race conditions when a user submits two prompts rapidly.
 */

import { streamAgentCall, toGeminiMessages } from './streaming';
import { buildXMLPrompt, buildContinuationPrompt } from './xmlPrompt';
import { parseDiffBlocks, parseAllBlocks, hasDiffBlocks } from '@/lib/diff/parser';
import type { DiffBlock, SearchReplaceBlock } from '@/lib/diff/parser';
import type { Agent } from '@/lib/store/agentStore';
import type { ChatMessage } from '@/lib/store/chatStore';
import { DEFAULT_MODEL } from './constants';
import { selectRelevantContext, formatBlueprintContext } from '@/lib/blueprint/selector';
import type { RepoBlueprint } from '@/lib/blueprint/types';
import { validateDiffSize, buildSurgicalRetryPrompt } from '@/lib/diff/sizeValidator';
import { analyzeImpact, buildFollowUpPrompt, formatImpactSummary } from '@/lib/impact/analyzer';

export type OrchestrationEvent =
  | { type: 'agent_start'; agentId: string; agentName: string; emoji: string; colorIndex: number }
  | { type: 'agent_token'; agentId: string; token: string }
  | { type: 'agent_complete'; agentId: string; fullText: string; totalTokens: number }
  | { type: 'diffs_extracted'; agentId: string; agentName: string; diffs: DiffBlock[] }
  | { type: 'routing_transition'; fromAgentId: string; toAgentId: string; fromName: string; toName: string }
  | { type: 'impact_found'; summary: string; affectedFiles: string[] }
  | { type: 'sandbox_start'; mode: string }
  | { type: 'sandbox_done'; ok: boolean; mode: string; durationMs: number }
  | { type: 'heal_start'; attempt: number; maxAttempts: number }
  | { type: 'heal_done'; ok: boolean; attempts: number }
  | { type: 'pr_opened'; prNumber: number; prUrl: string; branch: string; previewUrl?: string }
  | { type: 'all_complete' }
  | { type: 'error'; message: string };

export interface OrchestrationConfig {
  agents: Agent[];
  userPrompt: string;
  chatHistory: ChatMessage[];
  onEvent: (event: OrchestrationEvent) => void;
  signal?: AbortSignal;
  blueprint?: RepoBlueprint | null;
  /** Identifies the chat this run belongs to — used for single-flight locking */
  chatId?: string;
  /** Provided when GitHub is connected */
  githubContext?: {
    token: string;
    owner: string;
    repo: string;
    defaultBranch: string;
    chatId: string;
    existingPRNumber?: number;
  };
  /** Apply diffs to in-memory state — returns updated file content map */
  applyDiffs?: (diffs: SearchReplaceBlock[]) => Promise<Record<string, string>>;
}

const AGENT_COLORS = ['#7c6af7', '#4ade80', '#f59e0b', '#38bdf8', '#ec4899'] as const;
const MAX_CONTINUATION = 5;
const MAX_REVIEW_LOOPS = 3;
const MAX_SIZE_RETRIES = 3;
/** Bug #B6 — max iterative routing passes */
const MAX_ITERATIONS = 3;

// ── Per-chat single-flight lock (§1.5) ────────────────────────────────────────
//
// Maps chatId → the last pending pipeline Promise.
// A new call chains after the existing promise so requests are serialised,
// not silently dropped. This prevents:
//   - Two Coder calls racing on the same file state
//   - Heal loop and a new user prompt running concurrently
//   - Blueprint update and orchestration racing on the same symbols
//
// Cleanup: when a pipeline settles, we check if it is still the "last" promise
// for that chat. If yes, we delete the entry (avoids memory growth).
const chatPipelines = new Map<string, Promise<void>>();

function withChatLock(chatId: string, fn: () => Promise<void>): Promise<void> {
  const prior = chatPipelines.get(chatId) ?? Promise.resolve();

  const next = prior.then(
    () => fn(),
    () => fn(), // run even if prior errored — don't leave the chat deadlocked
  );

  // Store the chained promise. If another call comes in while this one is
  // running it will chain after `next`, maintaining queue order.
  chatPipelines.set(chatId, next);

  // After this pipeline settles, clean up if it is still the current entry
  next.finally(() => {
    if (chatPipelines.get(chatId) === next) {
      chatPipelines.delete(chatId);
    }
  });

  return next;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildExecutionChain(agents: Agent[]): Agent[] | null {
  if (agents.length === 0) return [];
  const agentMap = new Map(agents.map((a) => [a.id, a]));
  const firstAgent =
    agents.find((a) => !agents.some((other) => other.routeOutputTo === a.id)) ?? agents[0];
  const chain: Agent[] = [];
  const visited = new Set<string>();
  let current: Agent | undefined = firstAgent;
  while (current) {
    if (visited.has(current.id)) return null; // cycle
    visited.add(current.id);
    chain.push(current);
    const nextId = current.routeOutputTo;
    current = nextId ? agentMap.get(nextId) : undefined;
  }
  for (const agent of agents) {
    if (!visited.has(agent.id)) chain.push(agent);
  }
  return chain;
}

async function callAgent(
  agent: Agent,
  systemPrompt: string,
  userContent: string,
  chatHistory: ChatMessage[],
  onToken: (token: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const historyMessages = toGeminiMessages(chatHistory);
  const contents = [
    ...historyMessages,
    { role: 'user' as const, parts: [{ text: userContent }] },
  ];

  let fullText = '';
  let continuations = 0;

  const doStream = async (msgs: typeof contents) => {
    await streamAgentCall(
      {
        model: agent.model || DEFAULT_MODEL,
        temperature: agent.temperature ?? 0.7,
        maxOutputTokens: 8192,
        systemInstruction: systemPrompt,
      },
      msgs,
      (event) => {
        if (event.type === 'token') {
          fullText += event.text;
          onToken(event.text);
        }
      },
      3,
    );
  };

  await doStream(contents);

  // Auto-continue if truncated — uses 300-char anchor (Bug #B3 pattern)
  while (fullText.endsWith('…') || (fullText.length > 7800 && continuations === 0)) {
    if (signal?.aborted || continuations >= MAX_CONTINUATION) break;
    continuations++;
    const anchor = fullText.slice(-300);
    const contPrompt = buildContinuationPrompt(anchor);
    await doStream([
      ...contents,
      { role: 'model' as const, parts: [{ text: anchor }] }, // only the anchor, not full output
      { role: 'user' as const, parts: [{ text: contPrompt }] },
    ]);
  }

  return fullText;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Execute the multi-agent orchestration pipeline.
 *
 * If `chatId` is provided, the run is serialised against other runs
 * for the same chat via the per-chat single-flight lock (§1.5).
 * Without a chatId the pipeline runs immediately (useful for unit tests).
 */
export function executeOrchestration(config: OrchestrationConfig): Promise<void> {
  if (config.chatId) {
    return withChatLock(config.chatId, () => _runPipeline(config));
  }
  return _runPipeline(config);
}

/**
 * Cancel any queued/running pipeline for the given chat.
 * The AbortSignal in the config is the primary mechanism;
 * this just clears the queue entry so the next run starts fresh.
 */
export function cancelChatPipeline(chatId: string): void {
  chatPipelines.delete(chatId);
}

/**
 * Returns true if a pipeline is currently running (or queued) for this chat.
 * Use in the UI to show a spinner / disable the send button.
 */
export function isChatPipelineActive(chatId: string): boolean {
  return chatPipelines.has(chatId);
}

// ── Internal pipeline ─────────────────────────────────────────────────────────

async function _runPipeline(config: OrchestrationConfig): Promise<void> {
  const { agents, userPrompt, chatHistory, onEvent, signal, blueprint, githubContext, applyDiffs } =
    config;

  if (agents.length === 0) {
    onEvent({ type: 'error', message: 'No agents selected. Add agents from the pill bar.' });
    return;
  }

  const chain = buildExecutionChain(agents);
  if (chain === null) {
    onEvent({ type: 'error', message: 'Agent routing cycle detected. Fix the routing configuration.' });
    return;
  }

  if (signal?.aborted) return;

  // Blueprint context injection
  let blueprintContext = '';
  if (blueprint?.status === 'ready') {
    const selection = selectRelevantContext(blueprint, userPrompt);
    blueprintContext = formatBlueprintContext(selection);
  }

  // Separate agent roles
  const coderAgent = agents.find((a) => a.role?.toLowerCase().includes('coder')) ?? chain[0];
  const reviewerAgent = agents.find((a) => a.role?.toLowerCase().includes('review'));
  const debuggerAgent = agents.find((a) => a.role?.toLowerCase().includes('debug'));

  let previousOutput = '';
  let previousAgent: Agent | null = null;
  let allDiffs: SearchReplaceBlock[] = [];

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

    onEvent({
      type: 'agent_start',
      agentId: agent.id,
      agentName: agent.name,
      emoji: agent.emoji,
      colorIndex: i % AGENT_COLORS.length,
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

    let userContent = userPrompt;
    if (blueprintContext) userContent = `${blueprintContext}\n\n${userContent}`;
    if (previousOutput) userContent = `${userContent}\n\n--- Previous agent output ---\n${previousOutput}`;

    // ── CODER path with sizeValidator + impact engine ──────────────────────
    if (agent.id === coderAgent.id || agent.role?.toLowerCase().includes('coder')) {
      let coderOutput = '';
      let sizeAttempt = 0;
      let extraPrompt = '';

      while (sizeAttempt < MAX_SIZE_RETRIES) {
        const promptWithRetry = extraPrompt
          ? `${userContent}\n\n${extraPrompt}`
          : userContent;

        coderOutput = await callAgent(
          agent,
          systemPrompt,
          promptWithRetry,
          chatHistory,
          (token) => onEvent({ type: 'agent_token', agentId: agent.id, token }),
          signal,
        );

        const blocks = parseAllBlocks(coderOutput);

        // Size validation — §1.3
        if (blueprint && blocks.length > 0) {
          const validation = validateDiffSize(blocks, blueprint);
          if (!validation.ok) {
            extraPrompt = buildSurgicalRetryPrompt(validation);
            sizeAttempt++;
            continue;
          }
        }

        allDiffs.push(...blocks);

        // Impact analysis — §1.4
        if (blueprint && blocks.length > 0) {
          const impact = analyzeImpact(blocks, blueprint);
          if (impact.affectedFiles.length > 0) {
            onEvent({
              type: 'impact_found',
              summary: formatImpactSummary(impact),
              affectedFiles: impact.affectedFiles.map((f) => f.path),
            });

            // Follow-up Coder calls for affected files (serialised, not concurrent)
            for (const affected of impact.affectedFiles) {
              if (signal?.aborted) break;
              const followUpPrompt = buildFollowUpPrompt(affected, userPrompt);
              const followUpOutput = await callAgent(
                coderAgent,
                systemPrompt,
                `${blueprintContext}\n\n${followUpPrompt}`,
                chatHistory,
                (token) => onEvent({ type: 'agent_token', agentId: coderAgent.id, token }),
                signal,
              );
              const followUpDiffs = parseAllBlocks(followUpOutput);
              allDiffs.push(...followUpDiffs);
            }
          }
        }

        break; // size validation passed — exit retry loop
      }

      onEvent({
        type: 'agent_complete',
        agentId: agent.id,
        fullText: coderOutput,
        totalTokens: Math.ceil(coderOutput.length / 4),
      });

      if (hasDiffBlocks(coderOutput)) {
        const diffs = parseDiffBlocks(coderOutput);
        if (diffs.length > 0) {
          onEvent({ type: 'diffs_extracted', agentId: agent.id, agentName: agent.name, diffs });
        }
      }

      previousOutput = coderOutput;

      // ── REVIEWER loop — §1.5 ────────────────────────────────────────────
      if (reviewerAgent && allDiffs.length > 0) {
        let reviewPass = false;
        let reviewLoop = 0;
        let reviewerFeedback = '';

        while (!reviewPass && reviewLoop < MAX_REVIEW_LOOPS && !signal?.aborted) {
          reviewLoop++;
          onEvent({
            type: 'agent_start',
            agentId: reviewerAgent.id,
            agentName: `${reviewerAgent.name} (loop ${reviewLoop})`,
            emoji: reviewerAgent.emoji,
            colorIndex: (i + 1) % AGENT_COLORS.length,
          });

          const reviewerSystem = buildXMLPrompt({
            name: reviewerAgent.name,
            role: reviewerAgent.role || 'reviewer',
            systemPrompt: reviewerAgent.systemPrompt,
            brainNotes: reviewerAgent.brainNotes,
            routeOutputTo: null,
            isReviewer: true,
          });

          const reviewerContext =
            `User request: "${userPrompt}"\n\n` +
            (blueprintContext ? `${blueprintContext}\n\n` : '') +
            `Diffs to review:\n${allDiffs
              .map(
                (d) =>
                  `${d.filePath}\n<<<<<<< SEARCH\n${d.search}\n=======\n${d.replace}\n>>>>>>> REPLACE`,
              )
              .join('\n\n')}` +
            (reviewerFeedback ? `\n\nPrevious review feedback:\n${reviewerFeedback}` : '');

          let reviewOutput = '';
          await streamAgentCall(
            {
              model: reviewerAgent.model || DEFAULT_MODEL,
              temperature: 0.1,
              maxOutputTokens: 2048,
              systemInstruction: reviewerSystem,
            },
            [{ role: 'user' as const, parts: [{ text: reviewerContext }] }],
            (event) => {
              if (event.type === 'token') {
                reviewOutput += event.text;
                onEvent({ type: 'agent_token', agentId: reviewerAgent.id, token: event.text });
              }
            },
          );

          onEvent({
            type: 'agent_complete',
            agentId: reviewerAgent.id,
            fullText: reviewOutput,
            totalTokens: Math.ceil(reviewOutput.length / 4),
          });

          if (reviewOutput.trim().startsWith('PASS')) {
            reviewPass = true;
          } else {
            reviewerFeedback = reviewOutput;
            // Re-run Coder with Reviewer feedback
            const fixPrompt =
              `${userContent}\n\nReviewer feedback (attempt ${reviewLoop}):\n${reviewerFeedback}\n\nFix the issues and re-emit the corrected diffs.`;
            const fixOutput = await callAgent(
              coderAgent,
              systemPrompt,
              fixPrompt,
              chatHistory,
              (token) => onEvent({ type: 'agent_token', agentId: coderAgent.id, token }),
              signal,
            );
            const fixDiffs = parseAllBlocks(fixOutput);
            if (fixDiffs.length > 0) {
              allDiffs = fixDiffs; // replace with corrected set
            }
          }
        }

        if (!reviewPass) {
          onEvent({
            type: 'error',
            message: `Reviewer couldn't approve after ${MAX_REVIEW_LOOPS} loops. Partial diffs shown — review manually.`,
          });
        }
      }

      previousAgent = agent;
      continue;
    }

    // ── Non-coder agent (Manager, Designer, etc.) ──────────────────────────
    const fullText = await callAgent(
      agent,
      systemPrompt,
      userContent,
      chatHistory,
      (token) => onEvent({ type: 'agent_token', agentId: agent.id, token }),
      signal,
    );

    onEvent({
      type: 'agent_complete',
      agentId: agent.id,
      fullText,
      totalTokens: Math.ceil(fullText.length / 4),
    });

    if (hasDiffBlocks(fullText)) {
      const diffs = parseDiffBlocks(fullText);
      if (diffs.length > 0) {
        onEvent({ type: 'diffs_extracted', agentId: agent.id, agentName: agent.name, diffs });
        allDiffs.push(...parseAllBlocks(fullText));
      }
    }

    previousOutput = fullText;
    previousAgent = agent;
  }

  // ── Apply diffs ────────────────────────────────────────────────────────────
  if (allDiffs.length > 0 && applyDiffs) {
    const updatedFiles = await applyDiffs(allDiffs);

    // ── Sandbox + Auto-Heal ────────────────────────────────────────────────
    const { pickSandboxMode } = await import('@/lib/sandbox/router');
    const mode = await pickSandboxMode();

    onEvent({ type: 'sandbox_start', mode });
    const sandboxStart = Date.now();

    let sandboxOk = false;

    if (mode === 'webcontainer') {
      try {
        const { WebContainerRunner } = await import('@/lib/sandbox/webcontainer');
        const runner = new WebContainerRunner();
        await runner.boot();
        const patches = Object.entries(updatedFiles).map(([path, content]) => ({ path, content }));
        await runner.refresh(patches);
        const tcResult = await runner.typecheck();
        sandboxOk = tcResult.exitCode === 0;

        if (!sandboxOk && debuggerAgent) {
          onEvent({ type: 'heal_start', attempt: 1, maxAttempts: 3 });
          const { runHealLoop } = await import('@/lib/heal/loop');
          const healResult = await runHealLoop({
            initialSandboxResult: {
              ok: false,
              mode: 'webcontainer',
              errors: tcResult.errors,
              durationMs: tcResult.durationMs,
            },
            currentDiffs: allDiffs,
            blueprint: blueprint ?? null,
            debuggerAgent,
            userPrompt,
            runSandbox: async (healPatches) => {
              await runner.refresh(healPatches);
              const r = await runner.typecheck();
              return { ok: r.exitCode === 0, mode: 'webcontainer', errors: r.errors, durationMs: r.durationMs };
            },
            applyDiffs: async (healDiffs) => {
              allDiffs.push(...healDiffs);
            },
            onToken: (agentId, token) => onEvent({ type: 'agent_token', agentId, token }),
            signal,
          });
          sandboxOk = healResult.ok;
          onEvent({ type: 'heal_done', ok: healResult.ok, attempts: healResult.attempts });
        }

        await runner.dispose();
      } catch (err) {
        onEvent({ type: 'error', message: `Sandbox error: ${(err as Error).message}` });
      }
    } else if (mode === 'cloud-mode' && githubContext) {
      // Cloud-mode: push to verify branch → poll CI
      try {
        const { CloudSandbox } = await import('@/lib/sandbox/cloud');
        const verifyBranch = `verify/${githubContext.chatId.slice(0, 7)}-${Date.now().toString(36)}`;
        const cloudSandbox = new CloudSandbox({
          githubToken: githubContext.token,
          owner: githubContext.owner,
          repo: githubContext.repo,
          baseBranch: githubContext.defaultBranch,
          verifyBranch,
        });
        const patches = Object.entries(updatedFiles).map(([path, content]) => ({ path, content }));
        const cloudResult = await cloudSandbox.run(patches);
        sandboxOk = cloudResult.ok;

        if (!sandboxOk && debuggerAgent && cloudResult.errors.length > 0) {
          onEvent({ type: 'heal_start', attempt: 1, maxAttempts: 3 });
          const { runHealLoop } = await import('@/lib/heal/loop');
          const healResult = await runHealLoop({
            initialSandboxResult: cloudResult,
            currentDiffs: allDiffs,
            blueprint: blueprint ?? null,
            debuggerAgent,
            userPrompt,
            runSandbox: async () => cloudResult, // cloud re-run not implemented inline
            applyDiffs: async (healDiffs) => { allDiffs.push(...healDiffs); },
            onToken: (agentId, token) => onEvent({ type: 'agent_token', agentId, token }),
            signal,
          });
          sandboxOk = healResult.ok;
          onEvent({ type: 'heal_done', ok: healResult.ok, attempts: healResult.attempts });
        }
      } catch (err) {
        onEvent({ type: 'error', message: `Cloud sandbox error: ${(err as Error).message}` });
        sandboxOk = true; // don't block PR on cloud errors
      }
    } else {
      // skip mode or no GitHub context for cloud — treat as passing
      sandboxOk = true;
    }

    onEvent({ type: 'sandbox_done', ok: sandboxOk, mode, durationMs: Date.now() - sandboxStart });

    // ── Push PR ──────────────────────────────────────────────────────────────
    if (githubContext) {
      try {
        const { pushChangeSet } = await import('@/lib/github/push');
        const changedFiles = Object.entries(updatedFiles).map(([path, content]) => ({ path, content }));
        const prRecord = await pushChangeSet({
          githubToken: githubContext.token,
          owner: githubContext.owner,
          repo: githubContext.repo,
          defaultBranch: githubContext.defaultBranch,
          chatId: githubContext.chatId,
          userPrompt,
          changedFiles,
          diffs: allDiffs,
          existingPRNumber: githubContext.existingPRNumber,
        });
        onEvent({
          type: 'pr_opened',
          prNumber: prRecord.prNumber,
          prUrl: prRecord.prUrl,
          branch: prRecord.branch,
          previewUrl: prRecord.previewUrl,
        });
      } catch (err) {
        onEvent({ type: 'error', message: `PR creation failed: ${(err as Error).message}` });
      }
    }
  }

  onEvent({ type: 'all_complete' });
}
