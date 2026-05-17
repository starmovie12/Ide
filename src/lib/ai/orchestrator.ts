/**
 * Multi-Agent Orchestrator — Phase 5 v6 COMPLETE
 *
 * Full pipeline per PRD §1.5:
 *
 *   User prompt
 *     → [per-chat single-flight lock — §1.5 no concurrent pipelines per chat]
 *     → Run recorded in Dexie (§4.9 recorder.ts)
 *     → [Optional] Chat title auto-generated via Flash-Lite (Bug #B11)
 *     → [Optional] Blueprint staleness banner (Bug #B32)
 *     → Manager (plan — parses XML <plan> subtasks)
 *     → [For each subtask (iterative routing, Bug #B6, MAX_ITERATIONS = 3):]
 *         → Coder / Designer (emits Aider SEARCH/REPLACE diffs)
 *         → sizeValidator (silent retry if oversized, MAX_SIZE_RETRIES = 3)
 *         → Impact Analyzer (finds affected cross-file dependents)
 *         → [For each affected file → serialised Coder follow-up call]
 *         → Reviewer (validates ALL diffs, MAX_REVIEW_LOOPS = 3)
 *         → [FAIL → Coder retry with Reviewer feedback; PASS → continue]
 *     → Apply diffs to in-memory state
 *     → Sandbox verify (WebContainer desktop / cloud-mode mobile — §1.6)
 *     → [If errors] → Auto-Heal loop (Debugger, MAX_HEAL_ATTEMPTS = 3)
 *     → [Heal failure] → User escalation card (no silent rollback — §1.6)
 *     → Push PR (§1.7 — branch ai/<chatId>-<slug>, NEVER push to main)
 *     → Run finalised in Dexie
 *     → all_complete event
 *
 * Key invariants enforced:
 *   §1.5  single-flight lock: chatPipelines is a Map<chatId, Promise<void>>.
 *         Requests queue (via .then()), never drop. Prevents race conditions
 *         when user submits two prompts rapidly or heal loop runs concurrently.
 *
 *   §1.3  Coder follows surgical-edit rules. sizeValidator silently retries
 *         up to MAX_SIZE_RETRIES before surfacing an error.
 *
 *   §1.4  Impact Engine runs after every Coder call. Affected-file follow-up
 *         calls are serialised (not concurrent) to preserve file-state ordering.
 *
 *   §1.6  Heal failure: user receives [Roll back] / [Keep changes] choice card.
 *         NEVER silent rollback. Diffs remain applied in-memory.
 *
 *   §1.7  Branch always ai/<chatId-7>-<slug>. PR created or updated. Never main.
 *         Non-fast-forward push → clear "rebuild blueprint" escalation (no silent fail).
 *
 *   Bug #B6   Iterative routing: each iteration unrolled as
 *             Coder_iter1, Reviewer_iter1 ... up to MAX_ITERATIONS = 3.
 *             Manager subtask loop now increments iteration counter correctly.
 *   Bug #B11  Chat title auto-generated after first user message (Flash-Lite call).
 *   Bug #B15  Model strings: FALLBACK_CHAIN from constants.ts; callAgent tries
 *             fallback models on 404/model-unavailable errors.
 *   Bug #B22  Raw hex colour values removed from AGENT_COLORS.
 *             Only AGENT_COLOR_COUNT (integer) kept — hex tokens belong in UI layer.
 *   Bug #B31  Quota exhaustion: isQuotaExhausted flag on error events + human-readable banner.
 *   Bug #B32  Blueprint staleness: warns if blueprint is > 7 days old (non-blocking).
 *   Fix       sandbox_done durationMs was always 0 — now tracked from sandboxOverallStartMs.
 *   Fix       Cloud-mode heal loop no longer re-uses original cloudResult; it re-pushes
 *             heal patches to a fresh verification branch and polls CI properly.
 *   Fix       Signal abort check added before sandbox and PR-push sections.
 *   Fix       finishRun now receives errorTail on heal-failed status.
 *   Fix       extractTitleFromResponse uses Array.from for surrogate-pair-safe slicing.
 *
 * ── CRITICAL LOGICAL FIXES (post-review round 2) ──────────────────────────
 *   Fix (State Blindness)     applyDiffsNow() called after EACH Manager subtask so
 *                             Subtask N+1's Coder sees the files Subtask N already
 *                             modified.  Deferred single-batch apply remains only
 *                             for standalone Coder / generic-agent diffs.
 *   Fix (Reviewer Merge)      Reviewer fix-retry no longer replaces ALL currentDiffs
 *                             with fixDiffs.  Only files the Reviewer flagged are
 *                             replaced; untouched files keep their original correct diffs.
 *   Fix (Impact Size Guard)   Impact Engine follow-up Coder calls now run through
 *                             validateDiffSize (§1.3) before their diffs are accepted,
 *                             same as primary Coder calls.
 *   Fix (Brittle PASS)        Reviewer PASS detection replaced with a regex that
 *                             handles **PASS**, leading whitespace, and "PASS — note"
 *                             patterns that Gemini Flash commonly produces.
 */

import { streamAgentCall, toGeminiMessages } from './streaming';
import { buildXMLPrompt, buildContinuationPrompt } from './xmlPrompt';
import {
  parseDiffBlocks,
  parseAllBlocks,
  hasDiffBlocks,
} from '@/lib/diff/parser';
import type { DiffBlock, SearchReplaceBlock } from '@/lib/diff/parser';
import type { Agent } from '@/lib/store/agentStore';
import type { ChatMessage } from '@/lib/store/chatStore';
import { DEFAULT_MODEL, BLUEPRINT_MODEL, FALLBACK_CHAIN } from './constants';
import {
  selectRelevantContext,
  formatBlueprintContext,
} from '@/lib/blueprint/selector';
import type { RepoBlueprint } from '@/lib/blueprint/types';
import {
  validateDiffSize,
  buildSurgicalRetryPrompt,
} from '@/lib/diff/sizeValidator';
import {
  analyzeImpact,
  buildFollowUpPrompt,
  formatImpactSummary,
} from '@/lib/impact/analyzer';
import {
  startRun,
  updateRun,
  finishRun,
  addAgentEntry,
  addDiffsToRun,
} from '@/lib/runs/recorder';
import type { SandboxMode } from '@/lib/sandbox/types';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Max auto-continue passes when agent output is truncated (Bug #B3 anchor pattern) */
const MAX_CONTINUATION = 3 as const;

/** Max Reviewer loops before escalating to user */
const MAX_REVIEW_LOOPS = 3 as const;

/** Max sizeValidator retries per Coder call (§1.3) */
const MAX_SIZE_RETRIES = 3 as const;

/** Bug #B6 — max iterative routing passes (Coder_iter1, Reviewer_iter1 …) */
const MAX_ITERATIONS = 3 as const;

/** Max heal attempts before surfacing escalation card (§1.6) */
const MAX_HEAL_ATTEMPTS = 3 as const;

/**
 * Number of colour slots available for agent stream messages in the UI.
 * Bug #B22 — hex values removed from orchestrator layer.
 * The actual colour tokens (var(--color-primary), etc.) are defined in the
 * UI component that consumes `colorIndex` from `agent_start` events.
 */
const AGENT_COLOR_COUNT = 5 as const;

/** Characters of Coder output used as re-continuation anchor (Bug #B3) */
const ANCHOR_CHARS = 300 as const;

// ── Public event shape ────────────────────────────────────────────────────────

export type OrchestrationEvent =
  // ── Agent lifecycle ──────────────────────────────────────────────────────
  | {
      type: 'agent_start';
      agentId: string;
      agentName: string;
      emoji: string;
      colorIndex: number;
    }
  | { type: 'agent_token'; agentId: string; token: string }
  | {
      type: 'agent_complete';
      agentId: string;
      fullText: string;
      totalTokens: number;
      durationMs: number;
    }
  // ── Diff extraction ──────────────────────────────────────────────────────
  | {
      type: 'diffs_extracted';
      agentId: string;
      agentName: string;
      diffs: DiffBlock[];
    }
  // ── Routing ──────────────────────────────────────────────────────────────
  | {
      type: 'routing_transition';
      fromAgentId: string;
      toAgentId: string;
      fromName: string;
      toName: string;
    }
  // ── Impact engine ────────────────────────────────────────────────────────
  | {
      type: 'impact_found';
      summary: string;
      affectedFiles: string[];
      riskScore: 'low' | 'medium' | 'high';
    }
  // ── Reviewer ─────────────────────────────────────────────────────────────
  | { type: 'reviewer_pass'; loop: number }
  | { type: 'reviewer_fail'; loop: number; feedback: string }
  // ── Sandbox ──────────────────────────────────────────────────────────────
  | { type: 'sandbox_start'; mode: SandboxMode | 'skip' }
  | {
      type: 'sandbox_done';
      ok: boolean;
      mode: SandboxMode | 'skip';
      durationMs: number;
    }
  // ── Heal loop ────────────────────────────────────────────────────────────
  | { type: 'heal_start'; attempt: number; maxAttempts: number }
  | { type: 'heal_done'; ok: boolean; attempts: number }
  | {
      type: 'heal_failed_escalate';
      attempts: number;
      errorTail: string;
      /** Caller must render [Roll back] / [Keep changes] card */
    }
  // ── PR ───────────────────────────────────────────────────────────────────
  | {
      type: 'pr_opened';
      prNumber: number;
      prUrl: string;
      branch: string;
      previewUrl?: string;
    }
  // ── Chat title (Bug #B11) ─────────────────────────────────────────────────
  | { type: 'chat_title_generated'; chatId: string; title: string }
  // ── Run record ───────────────────────────────────────────────────────────
  | { type: 'run_started'; runId: string }
  | { type: 'run_complete'; runId: string; status: 'success' | 'heal-failed' | 'cancelled' | 'error' }
  // ── Queue ────────────────────────────────────────────────────────────────
  | { type: 'pipeline_queued'; chatId: string }
  // ── Terminal ─────────────────────────────────────────────────────────────
  | { type: 'all_complete' }
  | { type: 'error'; message: string; isQuotaExhausted?: boolean };

// ── Config ────────────────────────────────────────────────────────────────────

export interface OrchestrationConfig {
  /** Active agents for this pipeline run */
  agents: Agent[];
  /** Raw user message text */
  userPrompt: string;
  /** Chat history for context window */
  chatHistory: ChatMessage[];
  /** UI update callback — called synchronously for each event */
  onEvent: (event: OrchestrationEvent) => void;
  /** AbortSignal from the Stop button */
  signal?: AbortSignal;
  /** Repo blueprint, if connected and ready (§1.2) */
  blueprint?: RepoBlueprint | null;
  /**
   * Identifies the chat session.
   * Required for:
   *   - per-chat single-flight lock (§1.5)
   *   - run recording (§4.9)
   *   - chat title generation (Bug #B11)
   *   - PR branch naming (§1.7)
   */
  chatId?: string;
  /** GitHub context — required for PR push (§1.7) */
  githubContext?: {
    token: string;
    owner: string;
    repo: string;
    defaultBranch: string;
    chatId: string;
    existingPRNumber?: number;
  };
  /**
   * Apply a batch of diffs to the in-memory file state (editorStore + Dexie).
   * Returns a map of { filePath → updated content } for sandbox patching.
   */
  applyDiffs?: (diffs: SearchReplaceBlock[]) => Promise<Record<string, string>>;
  /**
   * Whether to auto-generate a chat title after the first user message.
   * Defaults to true when chatId is provided.  Bug #B11.
   */
  generateTitle?: boolean;
  /**
   * Current chat title — if already non-empty, title generation is skipped
   * so we don't overwrite a user-set title. Bug #B11.
   */
  currentChatTitle?: string;
}

// ── Per-chat single-flight lock (§1.5) ───────────────────────────────────────
//
// Invariant: at most ONE active pipeline per chatId at any moment.
// New calls chain after the existing promise via .then() — requests are
// QUEUED, never silently dropped.  Prevents:
//   - Two Coder calls racing on the same file state
//   - Heal loop and a new user prompt running concurrently
//   - Blueprint build and orchestration racing on shared symbols
//
// Cleanup: after a pipeline settles we check if it is still the "last"
// entry for that chat; if yes, delete it (avoids unbounded Map growth).

const chatPipelines = new Map<string, Promise<void>>();

// H7: AbortController map so cancelChatPipeline can abort in-flight work
const chatAbortControllers = new Map<string, AbortController>();

function withChatLock(chatId: string, fn: () => Promise<void>): Promise<void> {
  const prior = chatPipelines.get(chatId) ?? Promise.resolve();

  const next = prior.then(
    () => fn(),
    () => fn(), // run even if prior errored — don't deadlock the chat
  );

  chatPipelines.set(chatId, next);

  next.finally(() => {
    if (chatPipelines.get(chatId) === next) {
      chatPipelines.delete(chatId);
    }
  });

  return next;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Execute the multi-agent orchestration pipeline.
 *
 * If `chatId` is provided the run is serialised against other runs for
 * the same chat via the single-flight lock (§1.5).
 * Without a chatId the pipeline runs immediately (useful in unit tests).
 */
export function executeOrchestration(config: OrchestrationConfig): Promise<void> {
  if (config.chatId) {
    const isAlreadyActive = chatPipelines.has(config.chatId);
    if (isAlreadyActive) {
      config.onEvent({ type: 'pipeline_queued', chatId: config.chatId });
    }
    // H7: register an AbortController for this chat so cancelChatPipeline can abort it
    const controller = new AbortController();
    chatAbortControllers.set(config.chatId, controller);
    const configWithSignal: OrchestrationConfig = config.signal
      ? config  // caller already provided a signal — respect it
      : { ...config, signal: controller.signal };
    return withChatLock(config.chatId, () => _runPipelineSafe(configWithSignal));
  }
  return _runPipelineSafe(config);
}

/**
 * Cancel any queued/running pipeline for the given chat.
 * Aborts in-flight network requests via AbortController (H7),
 * then clears the queue entry so the next submission starts fresh.
 */
export function cancelChatPipeline(chatId: string): void {
  // H7: abort the in-flight pipeline, not just remove map entry
  chatAbortControllers.get(chatId)?.abort();
  chatAbortControllers.delete(chatId);
  chatPipelines.delete(chatId);
}

/**
 * Returns true if a pipeline is currently running OR queued for this chat.
 * Use in the UI to disable the send button / show a spinner.
 */
export function isChatPipelineActive(chatId: string): boolean {
  return chatPipelines.has(chatId);
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Resolve the linear execution chain from the agent routing DAG.
 * Returns null on cycle detection.
 * Agents not reachable from the head are appended at the end.
 */
function buildExecutionChain(agents: Agent[]): Agent[] | null {
  if (agents.length === 0) return [];

  const agentMap = new Map(agents.map((a) => [a.id, a]));

  // Head = agent nobody routes to
  const firstAgent =
    agents.find((a) => !agents.some((other) => other.routeOutputTo === a.id)) ??
    agents[0];

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

  // Append unreachable agents (disconnected nodes) at the tail
  for (const agent of agents) {
    if (!visited.has(agent.id)) chain.push(agent);
  }

  return chain;
}

/**
 * Identify well-known agent roles by inspecting the `role` field.
 * Falls back to name heuristics when role is not set.
 */
function detectRole(agent: Agent): 'manager' | 'coder' | 'designer' | 'reviewer' | 'debugger' | 'other' {
  const r = (agent.role ?? agent.name ?? '').toLowerCase();
  if (r.includes('manager'))  return 'manager';
  if (r.includes('coder'))    return 'coder';
  if (r.includes('designer')) return 'designer';
  if (r.includes('review'))   return 'reviewer';
  if (r.includes('debug'))    return 'debugger';
  return 'other';
}

/**
 * Estimate token count from a string (4 chars ≈ 1 token — rough but sufficient
 * for UI display; real counting requires the SDK countTokens() call which adds
 * latency and quota usage — Bug #B25 deferred to Phase 6 when token budget
 * management becomes critical).
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Extract the generated title from a Flash-Lite response.
 * The prompt asks for a bare title; strip stray quotes/punctuation.
 *
 * Uses Array.from for surrogate-pair-safe slicing (Bug #B2 — emoji handling).
 */
function extractTitleFromResponse(raw: string): string {
  const codePoints = Array.from(raw.trim());
  const stripped = codePoints
    .join('')
    .replace(/^["'`]+|["'`]+$/g, '')   // strip wrapping quotes
    .replace(/\.$/, '');                // strip trailing period
  // Use Array.from again for the final slice — surrogate-pair safe (Bug #H1)
  return Array.from(stripped).slice(0, 60).join('').trim();
}

/**
 * Parse Manager's XML plan for ordered subtasks.
 * Returns an array of subtask descriptions, or [] if no XML plan found
 * (in which case the caller treats the Manager output as a free-form plan).
 *
 * Expected shape from §G.1:
 *   <plan>
 *     <subtask agent="coder" id="t1"><description>…</description></subtask>
 *   </plan>
 */
function parseManagerPlan(output: string): {
  description: string;
  agent: string;
  id: string;
  sizeHint: 'small' | 'medium' | 'large';
}[] {
  const planMatch = output.match(/<plan>([\s\S]*?)<\/plan>/i);
  if (!planMatch) return [];

  const planXml = planMatch[1];
  const subtaskRegex =
    /<subtask\s+([^>]*)>([\s\S]*?)<\/subtask>/gi;

  const tasks: {
    description: string;
    agent: string;
    id: string;
    sizeHint: 'small' | 'medium' | 'large';
  }[] = [];

  let match: RegExpExecArray | null;
  while ((match = subtaskRegex.exec(planXml)) !== null) {
    const attrs = match[1];
    const body = match[2];

    const agentAttr = (attrs.match(/agent="([^"]+)"/) ?? [])[1] ?? 'coder';
    const idAttr = (attrs.match(/id="([^"]+)"/) ?? [])[1] ?? `t${tasks.length + 1}`;
    const descMatch = body.match(/<description>([\s\S]*?)<\/description>/i);
    const sizeMatch = body.match(/<sizeHint>([\s\S]*?)<\/sizeHint>/i);
    const desc = descMatch ? descMatch[1].trim() : '';
    const rawSize = sizeMatch ? sizeMatch[1].trim().toLowerCase() : 'medium';
    const sizeHint =
      rawSize === 'small' ? 'small' : rawSize === 'large' ? 'large' : 'medium';

    if (desc) {
      tasks.push({ description: desc, agent: agentAttr, id: idAttr, sizeHint });
    }
  }

  return tasks;
}

// ── Agent call wrapper ────────────────────────────────────────────────────────

interface CallAgentOptions {
  agent: Agent;
  systemPrompt: string;
  userContent: string;
  chatHistory: ChatMessage[];
  onToken: (token: string) => void;
  signal?: AbortSignal;
  /** Override model (used for title generation with BLUEPRINT_MODEL) */
  modelOverride?: string;
  /** Override temperature */
  temperatureOverride?: number;
  /** Override max output tokens */
  maxOutputTokensOverride?: number;
  /** M5: optional event emitter to surface MAX_CONTINUATION exceeded error */
  onEvent?: (e: OrchestrationEvent) => void;
}

/**
 * Call a single agent with streaming, auto-continuation (Bug #B3 anchor),
 * abort-signal support, and model-unavailable fallback chain (§2.1).
 *
 * Returns the full accumulated text.
 *
 * On quota-exhaustion (HTTP 429 / RESOURCE_EXHAUSTED body), throws an error
 * whose `.isQuotaExhausted` property is `true` so the pipeline can surface
 * the correct banner (Bug #B31).
 */
async function callAgent(opts: CallAgentOptions): Promise<string> {
  const {
    agent,
    systemPrompt,
    userContent,
    chatHistory,
    onToken,
    signal,
    modelOverride,
    temperatureOverride,
    maxOutputTokensOverride,
    onEvent: emitEvent,
  } = opts;

  const historyMessages = toGeminiMessages(chatHistory);
  const contents = [
    ...historyMessages,
    { role: 'user' as const, parts: [{ text: userContent }] },
  ];

  let fullText = '';
  let continuations = 0;

  // §2.1 — build the ordered list of models to try (primary + fallback chain)
  const primaryModel = modelOverride ?? agent.model ?? DEFAULT_MODEL;
  const fallbackModels: string[] = FALLBACK_CHAIN[primaryModel] ?? [];
  const modelsToTry = [primaryModel, ...fallbackModels];

  let lastError: unknown;

  for (const currentModel of modelsToTry) {
    if (signal?.aborted) break;

    fullText = '';  // reset per model attempt
    continuations = 0;
    lastError = undefined;

    const doStream = async (
      msgs: typeof contents,
    ): Promise<void> => {
      await streamAgentCall(
        {
          model: currentModel,
          temperature: temperatureOverride ?? agent.temperature ?? 0.7,
          maxOutputTokens: maxOutputTokensOverride ?? 8192,
          systemInstruction: systemPrompt,
        },
        msgs,
        (event) => {
          if (event.type === 'token') {
            fullText += event.text;
            onToken(event.text);
          }
        },
        /* maxRetries */ 3,
      );
    };

    try {
      await doStream(contents);

      // Bug #B3: auto-continue if truncated.
      // Use only last ANCHOR_CHARS of output as model anchor to avoid context spiral.
      while (
        (fullText.endsWith('…') || (fullText.length > 7800 && continuations === 0))
      ) {
        if (signal?.aborted) break;
        if (continuations >= MAX_CONTINUATION) {
          // M5: emit error when MAX_CONTINUATION exceeded so user knows output is truncated
          emitEvent?.({
            type: 'error',
            message: `Agent output too long — truncated after ${MAX_CONTINUATION} continuations.`,
          });
          break;
        }
        continuations++;
        // M1: Array.from for surrogate-pair-safe anchor extraction
        const anchor = Array.from(fullText).slice(-ANCHOR_CHARS).join('');
        await doStream([
          ...contents,
          { role: 'model' as const, parts: [{ text: anchor }] },
          {
            role: 'user' as const,
            parts: [{ text: buildContinuationPrompt(anchor) }],
          },
        ]);
      }

      return fullText;  // success — return immediately, skip remaining fallbacks

    } catch (err: unknown) {
      lastError = err;

      // Quota-exhausted error (HTTP 429 / RESOURCE_EXHAUSTED) — §2.2 / Bug #B31
      const errMsg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
      const isQuota =
        errMsg.includes('quota') ||
        errMsg.includes('resource_exhausted') ||
        errMsg.includes('429');

      if (isQuota) {
        // Annotate the error so the pipeline can emit isQuotaExhausted: true
        const quotaErr = new Error(
          `Quota exhausted on model "${currentModel}". Trying fallback model.`,
        ) as Error & { isQuotaExhausted: boolean; model: string };
        quotaErr.isQuotaExhausted = true;
        quotaErr.model = currentModel;

        // If this was the last model in the chain, re-throw with quota flag
        if (currentModel === modelsToTry[modelsToTry.length - 1]) {
          throw quotaErr;
        }
        // Otherwise, continue to next model in fallback chain
        continue;
      }

      // Model-unavailable (404 / model_not_found / region-blocked) — try next in chain
      const isModelUnavailable =
        errMsg.includes('not found') ||
        errMsg.includes('404') ||
        errMsg.includes('model_not_found') ||
        errMsg.includes('unsupported') ||
        errMsg.includes('region');

      if (isModelUnavailable && currentModel !== modelsToTry[modelsToTry.length - 1]) {
        continue;  // try next model
      }

      // Any other error on the last model — re-throw
      throw err;
    }
  }

  // All models tried and failed — re-throw the last error
  if (lastError) throw lastError;
  return fullText;
}

// ── Chat title generator (Bug #B11) ──────────────────────────────────────────

/**
 * Fire-and-forget title generation using Flash-Lite (cheap, fast).
 * Only runs when the chat title is empty (first user message).
 * Result is emitted as a `chat_title_generated` event for the store to persist.
 */
async function generateChatTitle(
  userPrompt: string,
  chatId: string,
  onEvent: (e: OrchestrationEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) return;
  try {
    let rawTitle = '';
    await streamAgentCall(
      {
        model: BLUEPRINT_MODEL, // Flash-Lite — cheapest, no reasoning needed
        temperature: 0.4,
        maxOutputTokens: 32,
        systemInstruction:
          'Generate a 3-6 word title summarising the user request. Return ONLY the title — no punctuation, no quotes.',
      },
      [{ role: 'user' as const, parts: [{ text: userPrompt.slice(0, 500) }] }],
      (event) => {
        if (event.type === 'token') rawTitle += event.text;
      },
      /* maxRetries */ 1,
    );
    const title = extractTitleFromResponse(rawTitle);
    if (title.length >= 3) {
      onEvent({ type: 'chat_title_generated', chatId, title });
    }
  } catch {
    // Non-critical — silently ignore title generation failures
  }
}

// ── Main pipeline ─────────────────────────────────────────────────────────────

async function _runPipeline(config: OrchestrationConfig): Promise<void> {
  const {
    agents,
    userPrompt,
    chatHistory,
    onEvent,
    signal,
    blueprint,
    githubContext,
    applyDiffs,
    chatId,
    generateTitle = true,
    currentChatTitle = '',
  } = config;

  // ── Guard: agents required ────────────────────────────────────────────────
  if (agents.length === 0) {
    onEvent({
      type: 'error',
      message: 'No agents selected. Add agents from the pill bar.',
    });
    return;
  }

  // ── Guard: cycle check ────────────────────────────────────────────────────
  const chain = buildExecutionChain(agents);
  if (chain === null) {
    onEvent({
      type: 'error',
      message: 'Agent routing cycle detected. Fix the routing configuration.',
    });
    return;
  }

  if (signal?.aborted) return;

  // ── Run recording (§4.9) ──────────────────────────────────────────────────
  let runId: string | null = null;
  try {
    runId = chatId ? await startRun(chatId, userPrompt) : null;
    if (runId) {
      onEvent({ type: 'run_started', runId });
    }
  } catch {
    // Run recording is non-critical — don't abort the pipeline on DB failure
    runId = null;
  }

  // ── Chat title generation (Bug #B11) ─────────────────────────────────────
  // Fire-and-forget — does not block the main pipeline
  const shouldGenerateTitle =
    generateTitle &&
    chatId &&
    !currentChatTitle?.trim() &&
    userPrompt.trim().length >= 10;

  if (shouldGenerateTitle) {
    generateChatTitle(userPrompt, chatId!, onEvent, signal).catch(() => {
      /* non-critical */
    });
  }

  // ── Blueprint context injection (§1.2) ────────────────────────────────────
  let blueprintContext = '';
  // C2: blueprint.status does not exist on RepoBlueprint — check files array instead
  if (blueprint && Array.isArray(blueprint.files) && blueprint.files.length > 0) {
    try {
      // Bug #B32: Surface staleness banner if blueprint is > 7 days old.
      // Orchestrator emits an error-level warning (non-fatal) so the UI can
      // render the "Blueprint is X days old. [Rebuild]" banner.
      const BLUEPRINT_STALE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
      if (
        typeof blueprint.buildAt === 'number' &&
        Date.now() - blueprint.buildAt > BLUEPRINT_STALE_MS
      ) {
        const daysOld = Math.floor((Date.now() - blueprint.buildAt) / (24 * 60 * 60 * 1000));
        onEvent({
          type: 'error',
          message: `⚠️ Blueprint is ${daysOld} days old and may be stale. Agents will still work but context may be outdated. Click [Rebuild Blueprint] in the chat header to refresh.`,
        });
      }

      const selection = selectRelevantContext(blueprint, userPrompt);
      blueprintContext = formatBlueprintContext(selection);
    } catch {
      // Blueprint errors must never block the pipeline
    }
  }

  // ── Role detection ────────────────────────────────────────────────────────
  const managerAgent  = agents.find((a) => detectRole(a) === 'manager');
  const coderAgent    = agents.find((a) => detectRole(a) === 'coder')    ?? chain[0];
  const designerAgent = agents.find((a) => detectRole(a) === 'designer');
  const reviewerAgent = agents.find((a) => detectRole(a) === 'reviewer');
  const debuggerAgent = agents.find((a) => detectRole(a) === 'debugger');

  // ── Accumulated state ─────────────────────────────────────────────────────
  let allDiffs: SearchReplaceBlock[] = [];
  // updatedFiles accumulates LIVE across the pipeline so each subsequent
  // subtask/iteration sees the editorStore state that previous subtasks
  // already modified.  Without this, Subtask 2 would write against the
  // stale pre-Subtask-1 file contents and produce conflicting diffs.
  let updatedFiles: Record<string, string> = {};
  let previousOutput = '';
  let previousAgent: Agent | null = null;
  let iteration = 0;  // Bug #B6 — tracks current iterative routing pass

  // M4: track which diff objects have been applied incrementally (by reference)
  // so the end-of-pipeline batch doesn't double-apply Manager-subtask diffs,
  // while still correctly applying generic-agent diffs for the same file paths.
  const alreadyAppliedDiffRefs = new Set<SearchReplaceBlock>();

  /**
   * Apply a batch of diffs immediately and merge the resulting file map
   * into `updatedFiles` so subsequent subtasks see the latest editor state.
   * Non-fatal: if `applyDiffs` is not provided (test environments) we skip
   * silently and accumulate diffs for the end-of-pipeline sandbox batch.
   */
  async function applyDiffsNow(diffs: SearchReplaceBlock[]): Promise<void> {
    if (diffs.length === 0 || !applyDiffs) return;
    try {
      const fresh = await applyDiffs(diffs);
      Object.assign(updatedFiles, fresh);
      // M4: record these diff references as already applied
      for (const d of diffs) alreadyAppliedDiffRefs.add(d);
    } catch (err) {
      // Propagate — a mid-pipeline apply failure is fatal to the pipeline
      throw err;
    }
  }

  // ── Main chain loop ───────────────────────────────────────────────────────
  for (let chainIdx = 0; chainIdx < chain.length; chainIdx++) {
    const agent = chain[chainIdx];

    if (signal?.aborted) break;

    // ── Routing transition event ────────────────────────────────────────────
    if (previousAgent) {
      onEvent({
        type: 'routing_transition',
        fromAgentId: previousAgent.id,
        toAgentId: agent.id,
        fromName: previousAgent.name,
        toName: agent.name,
      });
    }

    // ── Determine display label (Bug #B6 — iterative suffix) ───────────────
    const roleOfAgent = detectRole(agent);
    const isIterativeRole =
      roleOfAgent === 'coder' || roleOfAgent === 'reviewer' || roleOfAgent === 'designer';
    const displayName =
      isIterativeRole && iteration > 0
        ? `${agent.name} (iter ${iteration + 1})`
        : agent.name;

    const colorIndex = chainIdx % AGENT_COLOR_COUNT;

    onEvent({
      type: 'agent_start',
      agentId: agent.id,
      agentName: displayName,
      emoji: agent.emoji,
      colorIndex,
    });

    // ── Build system prompt ─────────────────────────────────────────────────
    const systemPrompt = buildXMLPrompt({
      name: agent.name,
      role: agent.role || agent.name,
      systemPrompt: agent.systemPrompt,
      brainNotes: agent.brainNotes,
      routeOutputTo: agent.routeOutputTo
        ? agents.find((a) => a.id === agent.routeOutputTo)?.name ?? null
        : null,
      isReviewer: roleOfAgent === 'reviewer',
    });

    // ── Build user content ──────────────────────────────────────────────────
    let userContent = userPrompt;
    if (blueprintContext) {
      userContent = `${blueprintContext}\n\n${userContent}`;
    }
    if (previousOutput) {
      userContent = `${userContent}\n\n--- Previous agent output ---\n${previousOutput}`;
    }

    const agentStartMs = Date.now();

    // ══════════════════════════════════════════════════════════════════════
    //  MANAGER PATH — parse plan, optionally drive subtask loop
    // ══════════════════════════════════════════════════════════════════════

    if (roleOfAgent === 'manager') {
      let managerOutput = '';

      managerOutput = await callAgent({
        agent,
        systemPrompt,
        userContent,
        chatHistory,
        onToken: (t) => onEvent({ type: 'agent_token', agentId: agent.id, token: t }),
        signal,
        onEvent,
      });

      const durationMs = Date.now() - agentStartMs;

      onEvent({
        type: 'agent_complete',
        agentId: agent.id,
        fullText: managerOutput,
        totalTokens: estimateTokens(managerOutput),
        durationMs,
      });

      if (runId) {
        await addAgentEntry(runId, {
          name: agent.name,
          model: agent.model ?? DEFAULT_MODEL,
          tokensIn: estimateTokens(userContent + systemPrompt),
          tokensOut: estimateTokens(managerOutput),
          durationMs,
        }).catch(() => {});
      }

      previousOutput = managerOutput;
      previousAgent  = agent;

      // Try to parse the plan and use subtasks to guide the coder below.
      // If no plan XML found, we fall through to the normal chain loop
      // which will hand previousOutput (the plan text) to the Coder.
      const subtasks = parseManagerPlan(managerOutput);

      if (subtasks.length > 0 && coderAgent) {
        // ── Subtask-driven coder calls (one per Manager subtask) ────────────
        // H6: use a separate counter for manager subtasks — don't share `iteration`
        let managerSubtaskCount = 0;
        for (const subtask of subtasks) {
          if (signal?.aborted) break;

          // Choose the right agent for this subtask
          const targetRole = subtask.agent.toLowerCase();
          const targetAgent =
            targetRole === 'designer' && designerAgent
              ? designerAgent
              : coderAgent;

          // C3: emit agent_start so UI shows spinner + agent name for each subtask
          onEvent({
            type: 'agent_start',
            agentId: targetAgent.id,
            agentName: `${targetAgent.name} (subtask ${subtask.id})`,
            emoji: targetAgent.emoji,
            colorIndex,
          });

          // Bug 3: blueprintContext was generated once at pipeline start and does NOT
          // reflect files modified by previous subtasks.  After applyDiffsNow() the
          // in-memory updatedFiles map has the latest content — inject those changed
          // files directly into the subtask prompt so the LLM sees the real current state.
          //
          // Strategy: re-select blueprint context from updated selector if blueprint exists,
          // AND append the literal current content of any files already modified this run.
          let freshBlueprintContext = blueprintContext; // baseline: original selection
          if (blueprint && managerSubtaskCount > 0 && Object.keys(updatedFiles).length > 0) {
            try {
              // Re-run selector so new/changed symbols from prior subtasks are visible
              const freshSelection = selectRelevantContext(blueprint, subtask.description);
              freshBlueprintContext = formatBlueprintContext(freshSelection);
            } catch {
              // Non-fatal — fall back to original blueprintContext
            }
          }

          // Also append current content of every file modified so far this run,
          // so the Coder sees the ACTUAL current state regardless of blueprint staleness.
          const modifiedFileBlock = Object.keys(updatedFiles).length > 0
            ? '\n\n<current_file_state>\n' +
              Object.entries(updatedFiles)
                .map(([path, content]) => `// ${path}\n${content}`)
                .join('\n\n---\n\n')
                .slice(0, 8000) + // cap to avoid context overflow
              '\n</current_file_state>'
            : '';

          const subtaskPrompt =
            `Manager subtask [${subtask.id}]: ${subtask.description}\n\n` +
            `Original user request: "${userPrompt}"\n\n` +
            (freshBlueprintContext ? `${freshBlueprintContext}\n\n` : '') +
            (previousOutput
              ? `Manager plan:\n${managerOutput.slice(0, 2000)}`
              : '') +
            modifiedFileBlock;

          await _runCoderIteration({
            agent: targetAgent,
            systemPrompt: buildXMLPrompt({
              name: targetAgent.name,
              role: targetAgent.role || targetAgent.name,
              systemPrompt: targetAgent.systemPrompt,
              brainNotes: targetAgent.brainNotes,
              routeOutputTo: null,
              isReviewer: false,
            }),
            userContent: subtaskPrompt,
            chatHistory,
            blueprint: blueprint ?? null,
            blueprintContext: freshBlueprintContext,
            coderAgent,
            reviewerAgent: reviewerAgent ?? null,
            allDiffs,
            userPrompt,
            iteration,
            colorIndex,
            onEvent,
            signal,
            runId,
            onDiffsAccumulated: async (newDiffs) => {
              allDiffs.push(...newDiffs);
              // Apply each subtask's diffs IMMEDIATELY so the next subtask's Coder
              // sees the already-modified files rather than the stale originals.
              await applyDiffsNow(newDiffs);
            },
          });

          // H6: increment the manager-specific counter, NOT the shared `iteration`
          managerSubtaskCount = Math.min(managerSubtaskCount + 1, MAX_ITERATIONS - 1);
        }
      }

      continue; // advance chain
    }

    // ══════════════════════════════════════════════════════════════════════
    //  CODER / DESIGNER PATH — diff generation + size-validate + impact
    // ══════════════════════════════════════════════════════════════════════

    if (
      roleOfAgent === 'coder' ||
      roleOfAgent === 'designer'
    ) {
      // Bug #B6 — track iterations for this coder/designer slot
      if (iteration < MAX_ITERATIONS) {
        const newDiffs: SearchReplaceBlock[] = [];
        // H4: capture last coder output so the next generic agent in chain gets context
        let lastCoderOutput = '';

        await _runCoderIteration({
          agent,
          systemPrompt,
          userContent,
          chatHistory,
          blueprint: blueprint ?? null,
          blueprintContext,
          coderAgent,
          reviewerAgent: reviewerAgent ?? null,
          allDiffs,
          userPrompt,
          iteration,
          colorIndex,
          onEvent,
          signal,
          runId,
          onDiffsAccumulated: (d) => { newDiffs.push(...d); },
          onOutputCaptured: (out) => { lastCoderOutput = out; },
        });

        allDiffs.push(...newDiffs);
        iteration++;
        // H4: preserve coder output for next agent; don't silently discard it
        previousOutput = lastCoderOutput;
      } else {
        previousOutput = '';
      }

      previousAgent  = agent;
      continue;
    }

    // ══════════════════════════════════════════════════════════════════════
    //  REVIEWER PATH — standalone (when not inside _runCoderIteration)
    // ══════════════════════════════════════════════════════════════════════

    if (roleOfAgent === 'reviewer') {
      // Handled inside _runCoderIteration when triggered from Coder path.
      // If Reviewer appears as an isolated node in the chain (e.g. user
      // manually places it without a Coder), run a single review pass here.
      if (allDiffs.length > 0) {
        await _runReviewerPass({
          agent,
          systemPrompt,
          allDiffs,
          blueprintContext,
          userPrompt,
          coderAgent,
          chatHistory,
          colorIndex,
          onEvent,
          signal,
          runId,
          onDiffsReplaced: (d) => { allDiffs = d; },
        });
      }
      previousAgent = agent;
      continue;
    }

    // ══════════════════════════════════════════════════════════════════════
    //  DEBUGGER PATH — standalone (when not inside heal loop)
    // ══════════════════════════════════════════════════════════════════════

    if (roleOfAgent === 'debugger') {
      // Debugger in the chain without a sandbox is a no-op at this stage;
      // the heal loop handles Debugger internally.
      previousAgent = agent;
      continue;
    }

    // ══════════════════════════════════════════════════════════════════════
    //  GENERIC AGENT PATH — any other role (analyst, planner, writer, etc.)
    // ══════════════════════════════════════════════════════════════════════

    const genericStartMs = Date.now();
    const fullText = await callAgent({
      agent,
      systemPrompt,
      userContent,
      chatHistory,
      onToken: (t) => onEvent({ type: 'agent_token', agentId: agent.id, token: t }),
      signal,
      onEvent,
    });

    const genericDuration = Date.now() - genericStartMs;

    onEvent({
      type: 'agent_complete',
      agentId: agent.id,
      fullText,
      totalTokens: estimateTokens(fullText),
      durationMs: genericDuration,
    });

    if (runId) {
      await addAgentEntry(runId, {
        name: agent.name,
        model: agent.model ?? DEFAULT_MODEL,
        tokensIn: estimateTokens(userContent + systemPrompt),
        tokensOut: estimateTokens(fullText),
        durationMs: genericDuration,
      }).catch(() => {});
    }

    // Generic agents may also emit diffs (e.g. a planner who writes code)
    if (hasDiffBlocks(fullText)) {
      const diffs = parseDiffBlocks(fullText);
      if (diffs.length > 0) {
        onEvent({
          type: 'diffs_extracted',
          agentId: agent.id,
          agentName: agent.name,
          diffs,
        });
        allDiffs.push(...parseAllBlocks(fullText));
      }
    }

    previousOutput = fullText;
    previousAgent  = agent;
  } // end chain loop

  if (signal?.aborted) {
    if (runId) {
      await finishRun(runId, 'cancelled').catch(() => {});
      onEvent({ type: 'run_complete', runId, status: 'cancelled' });
    }
    return;
  }

  // ── Apply remaining diffs (non-Manager / standalone-coder path) ──────────
  //
  // Manager-subtask diffs are applied incrementally inside the subtask loop
  // (see applyDiffsNow above) so that each subtask sees the latest file state.
  //
  // Standalone Coder / Designer / generic-agent diffs that ran OUTSIDE the
  // Manager subtask loop land here as a batch.
  //
  // M4 FIX: Use object identity (Set of already-applied diff references) to
  // distinguish which diffs were applied incrementally, rather than filtering by
  // filePath. The old filePath check silently dropped generic-agent diffs for
  // any file a Manager subtask had already touched — those diffs are distinct
  // objects and must be applied separately.
  //
  // alreadyAppliedDiffs is populated by applyDiffsNow inside the subtask loop.
  const unappliedDiffs = allDiffs.filter(
    (d) => !alreadyAppliedDiffRefs.has(d),
  );

  if (unappliedDiffs.length > 0) {
    if (runId) {
      await addDiffsToRun(runId, unappliedDiffs).catch(() => {});
    }

    if (applyDiffs) {
      try {
        const fresh = await applyDiffs(unappliedDiffs);
        Object.assign(updatedFiles, fresh);
      } catch (err) {
        onEvent({
          type: 'error',
          message: `Failed to apply diffs: ${(err as Error).message}`,
        });
        if (runId) {
          await finishRun(runId, 'error', {
            errorTail: (err as Error).message,
          }).catch(() => {});
          onEvent({ type: 'run_complete', runId, status: 'error' });
        }
        return;
      }
    }
  }

  // Record ALL diffs (Manager-applied + batch-applied) to run history
  if (allDiffs.length > 0 && runId) {
    // Diffs already recorded per-subtask above via addDiffsToRun for the
    // unapplied batch; record any Manager-path diffs not yet recorded.
    const managerAppliedDiffs = allDiffs.filter(
      (d) => !unappliedDiffs.some((u) => u === d),
    );
    if (managerAppliedDiffs.length > 0) {
      await addDiffsToRun(runId, managerAppliedDiffs).catch(() => {});
    }
  }

  // ── Sandbox + Auto-Heal (§1.6) ────────────────────────────────────────────
  let sandboxOk = true;
  let sandboxMode: SandboxMode | 'skip' = 'skip';
  let healAttempts = 0;

  if (Object.keys(updatedFiles).length > 0 && !signal?.aborted) {
    // Track overall sandbox wall-time (fixes sandbox_done durationMs always-0 bug)
    const sandboxOverallStartMs = Date.now();

    try {
      const { pickSandboxMode } = await import('@/lib/sandbox/router');
      sandboxMode = await pickSandboxMode();
    } catch {
      sandboxMode = 'skip';
    }

    onEvent({ type: 'sandbox_start', mode: sandboxMode });

    if (sandboxMode === 'webcontainer') {
      try {
        const { WebContainerRunner } = await import('@/lib/sandbox/webcontainer');
        const runner = new WebContainerRunner();
        await runner.boot();

        const patches = Object.entries(updatedFiles).map(([path, content]) => ({
          path,
          content,
        }));
        await runner.refresh(patches);

        const tcResult = await runner.typecheck();
        sandboxOk = tcResult.exitCode === 0;

        // Auto-Heal loop (§1.6)
        if (!sandboxOk && debuggerAgent) {
          onEvent({
            type: 'heal_start',
            attempt: 1,
            maxAttempts: MAX_HEAL_ATTEMPTS,
          });

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
              return {
                ok: r.exitCode === 0,
                mode: 'webcontainer' as const,
                errors: r.errors,
                durationMs: r.durationMs,
              };
            },
            applyDiffs: async (healDiffs) => {
              allDiffs.push(...healDiffs);
              if (applyDiffs) {
                const freshFiles = await applyDiffs(healDiffs);
                Object.assign(updatedFiles, freshFiles);
              }
            },
            onToken: (agentId, token) =>
              onEvent({ type: 'agent_token', agentId, token }),
            signal,
          });

          sandboxOk  = healResult.ok;
          healAttempts = healResult.attempts;

          onEvent({
            type: 'heal_done',
            ok: healResult.ok,
            attempts: healResult.attempts,
          });

          // §1.6 — escalate on failure; user picks Roll back / Keep
          if (!healResult.ok) {
            onEvent({
              type: 'heal_failed_escalate',
              attempts: healResult.attempts,
              errorTail:
                healResult.finalErrors ??
                healResult.gaveUpReason ??
                'Auto-heal exhausted all attempts.',
            });
          }
        }

        await runner.dispose();
      } catch (err) {
        onEvent({
          type: 'error',
          message: `Sandbox error: ${(err as Error).message}`,
        });
        sandboxOk = false;
      }
    } else if (sandboxMode === 'cloud-mode' && githubContext) {
      // Cloud-mode: push to a temp verification branch and poll CI (§1.6 Mode 2)
      try {
        const { CloudSandbox } = await import('@/lib/sandbox/cloud');
        const verifyBranch = `verify/${githubContext.chatId.slice(0, 7)}-${Date.now().toString(36)}`;
        const cloudSandbox = new CloudSandbox({
          githubToken:  githubContext.token,
          owner:        githubContext.owner,
          repo:         githubContext.repo,
          baseBranch:   githubContext.defaultBranch,
          verifyBranch,
        });

        const patches = Object.entries(updatedFiles).map(([path, content]) => ({
          path,
          content,
        }));
        const cloudResult = await cloudSandbox.run(patches);
        sandboxOk = cloudResult.ok;

        if (!sandboxOk && debuggerAgent && cloudResult.errors.length > 0) {
          onEvent({
            type: 'heal_start',
            attempt: 1,
            maxAttempts: MAX_HEAL_ATTEMPTS,
          });

          const { runHealLoop } = await import('@/lib/heal/loop');
          const healResult = await runHealLoop({
            initialSandboxResult: cloudResult,
            currentDiffs: allDiffs,
            blueprint: blueprint ?? null,
            debuggerAgent,
            userPrompt,
            // Cloud re-run: push the healed diffs to a new verification branch
            // and poll CI — this is the correct behaviour for cloud-mode heal.
            runSandbox: async (healPatches) => {
              const verifyHealBranch = `verify/${githubContext.chatId.slice(0, 7)}-heal-${Date.now().toString(36)}`;
              const healCloudSandbox = new CloudSandbox({
                githubToken:  githubContext.token,
                owner:        githubContext.owner,
                repo:         githubContext.repo,
                baseBranch:   githubContext.defaultBranch,
                verifyBranch: verifyHealBranch,
              });
              return healCloudSandbox.run(
                // C1: healPatches is FilePatch[] ({path, content}[]), not a tuple — pass directly
                healPatches,
              );
            },
            applyDiffs: async (healDiffs) => {
              allDiffs.push(...healDiffs);
              if (applyDiffs) {
                const freshFiles = await applyDiffs(healDiffs);
                Object.assign(updatedFiles, freshFiles);
              }
            },
            onToken: (agentId, token) =>
              onEvent({ type: 'agent_token', agentId, token }),
            signal,
          });

          sandboxOk    = healResult.ok;
          healAttempts = healResult.attempts;

          onEvent({
            type: 'heal_done',
            ok: healResult.ok,
            attempts: healResult.attempts,
          });

          if (!healResult.ok) {
            onEvent({
              type: 'heal_failed_escalate',
              attempts: healResult.attempts,
              errorTail:
                healResult.finalErrors ??
                healResult.gaveUpReason ??
                'Auto-heal exhausted all attempts.',
            });
          }
        }
      } catch (err) {
        onEvent({
          type: 'error',
          message: `Cloud sandbox error: ${(err as Error).message}`,
        });
        // Don't block PR on transient cloud errors — surface warning via sandbox_done
        sandboxOk = true;
      }
    }
    // 'skip' mode or missing githubContext for cloud → sandboxOk stays true

    onEvent({
      type: 'sandbox_done',
      ok: sandboxOk,
      mode: sandboxMode,
      durationMs: Date.now() - sandboxOverallStartMs,  // fixed: was always 0
    });

    if (runId) {
      await updateRun(runId, {
        sandboxMode,
        healAttempts,
      }).catch(() => {});
    }
  }

  // ── Push PR (§1.7) ────────────────────────────────────────────────────────
  if (githubContext && Object.keys(updatedFiles).length > 0 && !signal?.aborted) {
    try {
      const { pushChangeSet } = await import('@/lib/github/push');
      const changedFiles = Object.entries(updatedFiles).map(([path, content]) => ({
        path,
        content,
      }));

      const prRecord = await pushChangeSet({
        githubToken:       githubContext.token,
        owner:             githubContext.owner,
        repo:              githubContext.repo,
        defaultBranch:     githubContext.defaultBranch,
        chatId:            githubContext.chatId,
        userPrompt,
        changedFiles,
        diffs:             allDiffs,
        existingPRNumber:  githubContext.existingPRNumber,
      });

      onEvent({
        type: 'pr_opened',
        prNumber:   prRecord.prNumber,
        prUrl:      prRecord.prUrl,
        branch:     prRecord.branch,
        previewUrl: prRecord.previewUrl,
      });

      if (runId) {
        await updateRun(runId, {
          prNumber:   prRecord.prNumber,
          prUrl:      prRecord.prUrl,
          previewUrl: prRecord.previewUrl,
        }).catch(() => {});
      }
    } catch (err) {
      const errMsg = (err as Error).message ?? '';

      // §1.7 conflict handling: non-fast-forward push (main moved since blueprint built).
      // PRD requires: auto-fetch latest main → rebuild blueprint → re-run Reviewer.
      // If conflicts are unresolvable → escalate to user.
      const isConflict =
        errMsg.includes('non-fast-forward') ||
        errMsg.includes('Update is not a fast forward') ||
        errMsg.includes('422');

      if (isConflict) {
        onEvent({
          type: 'error',
          message:
            '⚠️ PR push conflict: the default branch moved since your blueprint was built. ' +
            'Auto-fetching latest main and rebuilding blueprint…',
        });

        // §1.7 Step 1: attempt to auto-fetch latest default branch and rebuild blueprint
        let conflictResolved = false;
        try {
          const { fetchLatestBlueprint } = await import('@/lib/blueprint/builder');
          const freshBlueprint = await fetchLatestBlueprint({
            githubToken:   githubContext.token,
            owner:         githubContext.owner,
            repo:          githubContext.repo,
            defaultBranch: githubContext.defaultBranch,
          });

          if (freshBlueprint) {
            // §1.7 Step 2: re-run Reviewer against fresh blueprint to detect conflicts
            if (reviewerAgent && allDiffs.length > 0) {
              // Use last chain index's color for the conflict re-review agent_start event
              const conflictColorIndex = (chain.length > 0 ? chain.length - 1 : 0) % AGENT_COLOR_COUNT;
              onEvent({
                type: 'agent_start',
                agentId:   reviewerAgent.id,
                agentName: `${reviewerAgent.name} (conflict re-review)`,
                emoji:     reviewerAgent.emoji,
                colorIndex: conflictColorIndex,
              });

              let conflictReviewedDiffs = allDiffs;
              await _runReviewerPass({
                agent:        reviewerAgent,
                systemPrompt: buildXMLPrompt({
                  name:          reviewerAgent.name,
                  role:          reviewerAgent.role || 'reviewer',
                  systemPrompt:  reviewerAgent.systemPrompt,
                  brainNotes:    reviewerAgent.brainNotes,
                  routeOutputTo: null,
                  isReviewer:    true,
                }),
                allDiffs,
                blueprintContext: formatBlueprintContext(
                  selectRelevantContext(freshBlueprint, userPrompt),
                ),
                userPrompt,
                coderAgent,
                chatHistory,
                colorIndex: conflictColorIndex,
                onEvent,
                signal,
                runId,
                onDiffsReplaced: (d) => { conflictReviewedDiffs = d; },
              });

              // §1.7 Step 3: retry PR push with conflict-reviewed diffs
              const { pushChangeSet } = await import('@/lib/github/push');
              const retryFiles = Object.entries(updatedFiles).map(([path, content]) => ({
                path,
                content,
              }));

              const retryPR = await pushChangeSet({
                githubToken:       githubContext.token,
                owner:             githubContext.owner,
                repo:              githubContext.repo,
                defaultBranch:     githubContext.defaultBranch,
                chatId:            githubContext.chatId,
                userPrompt,
                changedFiles:      retryFiles,
                diffs:             conflictReviewedDiffs,
                existingPRNumber:  githubContext.existingPRNumber,
              });

              onEvent({
                type: 'pr_opened',
                prNumber:   retryPR.prNumber,
                prUrl:      retryPR.prUrl,
                branch:     retryPR.branch,
                previewUrl: retryPR.previewUrl,
              });

              if (runId) {
                await updateRun(runId, {
                  prNumber:   retryPR.prNumber,
                  prUrl:      retryPR.prUrl,
                  previewUrl: retryPR.previewUrl,
                }).catch(() => {});
              }

              conflictResolved = true;
            }
          }
        } catch (retryErr) {
          // Auto-resolution failed — fall through to user escalation below
        }

        // §1.7 Step 4: if auto-resolution failed, escalate to user
        if (!conflictResolved) {
          onEvent({
            type: 'error',
            message:
              'Auto-resolution failed: the changes conflict with edits on the default branch. ' +
              'Please click [Rebuild Blueprint] in the chat header, review the conflicts manually, ' +
              'then re-send your prompt.',
          });
        }
      } else {
        onEvent({
          type: 'error',
          message: `PR creation failed: ${errMsg}`,
        });
      }
    }
  }

  // ── Finalise run record ───────────────────────────────────────────────────
  if (runId) {
    const finalStatus =
      signal?.aborted
        ? 'cancelled'
        : !sandboxOk && healAttempts >= MAX_HEAL_ATTEMPTS
        ? 'heal-failed'
        : 'success';

    // Capture the last known error tail on heal-failed so the run record is queryable
    const errorTailForRecord =
      finalStatus === 'heal-failed' ? 'Auto-heal exhausted all attempts.' : undefined;

    await finishRun(runId, finalStatus, errorTailForRecord ? { errorTail: errorTailForRecord } : undefined).catch(() => {});
    onEvent({ type: 'run_complete', runId, status: finalStatus });
  }

  onEvent({ type: 'all_complete' });
}

// ── Top-level pipeline error handler ─────────────────────────────────────────
//
// This wrapper catches any unhandled error that escapes _runPipeline so the
// UI always receives a typed event and the run is properly finished.
// Bug #B31: quota exhaustion is surfaced as a distinct isQuotaExhausted banner.

async function _runPipelineSafe(config: OrchestrationConfig): Promise<void> {
  try {
    await _runPipeline(config);
  } catch (err: unknown) {
    const isQuotaExhausted =
      (err as { isQuotaExhausted?: boolean }).isQuotaExhausted === true ||
      (err instanceof Error &&
        (err.message.toLowerCase().includes('quota') ||
          err.message.toLowerCase().includes('resource_exhausted')));

    config.onEvent({
      type: 'error',
      message: isQuotaExhausted
        ? 'All Gemini API keys have hit their daily quota. ' +
          'Add another key in Settings → API Keys, or wait until midnight PT for the reset.'
        : `Unexpected pipeline error: ${(err as Error).message ?? String(err)}`,
      isQuotaExhausted,
    });

    // Best-effort: finish any open run record
    if (config.chatId) {
      try {
        // We don't have the runId in this scope, so use chatId to find the open run
        // The recorder.ts finishOpenRun(chatId) API handles this gracefully
        const { finishOpenRun } = await import('@/lib/runs/recorder');
        await finishOpenRun(config.chatId, 'error', {
          errorTail: (err as Error).message ?? String(err),
        });
      } catch {
        // Non-critical — ignore recorder errors in the error handler
      }
    }
  }
}

/**
 * Runs one full Coder iteration:
 *   1. Call Coder (with sizeValidator retry loop — §1.3)
 *   2. Run Impact Engine (§1.4) — serialised follow-ups
 *   3. Run Reviewer loop (§1.5) — up to MAX_REVIEW_LOOPS
 *
 * All accumulated diffs are passed back via `onDiffsAccumulated`.
 */
interface CoderIterationOptions {
  agent: Agent;
  systemPrompt: string;
  userContent: string;
  chatHistory: ChatMessage[];
  blueprint: RepoBlueprint | null;
  blueprintContext: string;
  coderAgent: Agent;
  reviewerAgent: Agent | null;
  /** Current accumulated diffs (used for Reviewer context) */
  allDiffs: SearchReplaceBlock[];
  userPrompt: string;
  /** M7: iteration is passed for display purposes but not used internally yet */
  iteration: number;
  colorIndex: number;
  onEvent: (e: OrchestrationEvent) => void;
  signal?: AbortSignal;
  runId: string | null;
  onDiffsAccumulated: (diffs: SearchReplaceBlock[]) => void | Promise<void>;
  /** H4: optional callback to capture the coder's final output text for the next agent */
  onOutputCaptured?: (output: string) => void;
}

async function _runCoderIteration(opts: CoderIterationOptions): Promise<void> {
  const {
    agent,
    systemPrompt,
    userContent,
    chatHistory,
    blueprint,
    blueprintContext,
    coderAgent,
    reviewerAgent,
    allDiffs: existingDiffs,
    userPrompt,
    colorIndex,
    onEvent,
    signal,
    runId,
    onDiffsAccumulated,
    onOutputCaptured,
  } = opts;

  // ── sizeValidator retry loop (§1.3) ────────────────────────────────────────
  let coderOutput = '';
  let sizeAttempt  = 0;
  let extraPrompt  = '';
  let iterationDiffs: SearchReplaceBlock[] = [];

  while (sizeAttempt < MAX_SIZE_RETRIES) {
    if (signal?.aborted) return;

    const promptWithRetry = extraPrompt
      ? `${userContent}\n\n${extraPrompt}`
      : userContent;

    const coderStartMs = Date.now();
    coderOutput = await callAgent({
      agent,
      systemPrompt,
      userContent: promptWithRetry,
      chatHistory,
      onToken: (t) => onEvent({ type: 'agent_token', agentId: agent.id, token: t }),
      signal,
      onEvent,
    });

    const coderDuration = Date.now() - coderStartMs;

    onEvent({
      type: 'agent_complete',
      agentId: agent.id,
      fullText: coderOutput,
      totalTokens: estimateTokens(coderOutput),
      durationMs: coderDuration,
    });

    if (runId) {
      await addAgentEntry(runId, {
        name:      agent.name,
        model:     agent.model ?? DEFAULT_MODEL,
        tokensIn:  estimateTokens(promptWithRetry + systemPrompt),
        tokensOut: estimateTokens(coderOutput),
        durationMs: coderDuration,
      }).catch(() => {});
    }

    const blocks = parseAllBlocks(coderOutput);

    // Size validation — §1.3
    if (blueprint && blocks.length > 0) {
      const validation = validateDiffSize(blocks, blueprint);
      if (!validation.ok) {
        extraPrompt = buildSurgicalRetryPrompt(validation);
        sizeAttempt++;

        // Surface as a soft warning on final retry failure
        if (sizeAttempt >= MAX_SIZE_RETRIES) {
          onEvent({
            type: 'error',
            message: `Coder size-validation failed after ${MAX_SIZE_RETRIES} retries: ${validation.message ?? 'oversized diff'}. Applying diff anyway — please review manually.`,
          });
          // H5: actually apply the diffs as promised in the message above
          iterationDiffs = blocks;
          break;
        }
        continue; // retry
      }
    }

    iterationDiffs = blocks;

    // ── Emit diffs extracted ──────────────────────────────────────────────
    if (hasDiffBlocks(coderOutput)) {
      const displayDiffs = parseDiffBlocks(coderOutput);
      if (displayDiffs.length > 0) {
        onEvent({
          type: 'diffs_extracted',
          agentId: agent.id,
          agentName: agent.name,
          diffs: displayDiffs,
        });
      }
    }

    break; // size validation passed — exit retry loop
  }

  // H4: surface coder output to caller so next agent in chain has context
  if (onOutputCaptured) {
    onOutputCaptured(coderOutput);
  }

  // ── Impact Engine (§1.4) ───────────────────────────────────────────────────
  if (blueprint && iterationDiffs.length > 0) {
    try {
      const impact = analyzeImpact(iterationDiffs, blueprint);

      if (impact.affectedFiles.length > 0) {
        onEvent({
          type: 'impact_found',
          summary:       formatImpactSummary(impact),
          affectedFiles: impact.affectedFiles.map((f) => f.path),
          riskScore:     impact.riskScore,
        });

        // Serialised follow-up Coder calls for each affected file
        for (const affected of impact.affectedFiles) {
          if (signal?.aborted) break;

          const followUpPrompt = buildFollowUpPrompt(affected, userPrompt);
          const followUpBaseContent = blueprintContext
            ? `${blueprintContext}\n\n${followUpPrompt}`
            : followUpPrompt;

          const followUpSystemPrompt = buildXMLPrompt({
            name:          coderAgent.name,
            role:          coderAgent.role || coderAgent.name,
            systemPrompt:  coderAgent.systemPrompt,
            brainNotes:    coderAgent.brainNotes,
            routeOutputTo: null,
            isReviewer:    false,
          });

          // Bug 2: Impact Engine follow-up calls need the SAME §1.3 retry loop
          // as the primary Coder path — not a silent single-shot drop.
          let followUpSizeAttempt = 0;
          let followUpExtraPrompt = '';
          let validatedFollowUpDiffs: SearchReplaceBlock[] = [];

          while (followUpSizeAttempt < MAX_SIZE_RETRIES) {
            if (signal?.aborted) break;

            const followUpUserContent = followUpExtraPrompt
              ? `${followUpBaseContent}\n\n${followUpExtraPrompt}`
              : followUpBaseContent;

            const followUpStartMs = Date.now();

            onEvent({
              type: 'agent_start',
              agentId:   coderAgent.id,
              agentName: followUpSizeAttempt === 0
                ? `${coderAgent.name} (follow-up: ${affected.path})`
                : `${coderAgent.name} (follow-up retry ${followUpSizeAttempt}: ${affected.path})`,
              emoji:     coderAgent.emoji,
              colorIndex,
            });

            const followUpOutput = await callAgent({
              agent:      coderAgent,
              systemPrompt: followUpSystemPrompt,
              userContent: followUpUserContent,
              chatHistory,
              onToken: (t) =>
                onEvent({ type: 'agent_token', agentId: coderAgent.id, token: t }),
              signal,
              onEvent,
            });

            const followUpDuration = Date.now() - followUpStartMs;

            onEvent({
              type: 'agent_complete',
              agentId:     coderAgent.id,
              fullText:    followUpOutput,
              totalTokens: estimateTokens(followUpOutput),
              durationMs:  followUpDuration,
            });

            if (runId) {
              await addAgentEntry(runId, {
                name:       `${coderAgent.name} (impact follow-up)`,
                model:      coderAgent.model ?? DEFAULT_MODEL,
                tokensIn:   estimateTokens(followUpUserContent + followUpSystemPrompt),
                tokensOut:  estimateTokens(followUpOutput),
                durationMs: followUpDuration,
              }).catch(() => {});
            }

            const followUpDiffs = parseAllBlocks(followUpOutput);

            // §1.3 size validation — retry if oversized, same as primary Coder
            if (blueprint && followUpDiffs.length > 0) {
              const followUpValidation = validateDiffSize(followUpDiffs, blueprint);
              if (!followUpValidation.ok) {
                followUpExtraPrompt = buildSurgicalRetryPrompt(followUpValidation);
                followUpSizeAttempt++;

                if (followUpSizeAttempt >= MAX_SIZE_RETRIES) {
                  onEvent({
                    type: 'error',
                    message:
                      `Impact follow-up for ${affected.path} failed size-validation after ` +
                      `${MAX_SIZE_RETRIES} retries: ${followUpValidation.message ?? 'oversized diff'}. ` +
                      `Applying anyway — please review manually.`,
                  });
                  // Apply as promised (consistent with H5 fix on primary path)
                  validatedFollowUpDiffs = followUpDiffs;
                  break;
                }
                continue; // retry
              }
            }

            validatedFollowUpDiffs = followUpDiffs;

            if (hasDiffBlocks(followUpOutput) && validatedFollowUpDiffs.length > 0) {
              const displayFollowUpDiffs = parseDiffBlocks(followUpOutput);
              if (displayFollowUpDiffs.length > 0) {
                onEvent({
                  type: 'diffs_extracted',
                  agentId:   coderAgent.id,
                  agentName: `${coderAgent.name} (impact follow-up)`,
                  diffs:     displayFollowUpDiffs,
                });
              }
            }

            break; // size validation passed
          }

          if (validatedFollowUpDiffs.length > 0) {
            iterationDiffs.push(...validatedFollowUpDiffs);
          }
        }
      }
    } catch {
      // Impact Engine is non-critical — don't abort pipeline on analysis error
    }
  }

  // ── Reviewer loop (§1.5) ───────────────────────────────────────────────────
  const combinedDiffsForReview = [...existingDiffs, ...iterationDiffs];

  if (reviewerAgent && combinedDiffsForReview.length > 0) {
    let reviewedDiffs = iterationDiffs;

    await _runReviewerPass({
      agent:        reviewerAgent,
      systemPrompt: buildXMLPrompt({
        name:          reviewerAgent.name,
        role:          reviewerAgent.role || 'reviewer',
        systemPrompt:  reviewerAgent.systemPrompt,
        brainNotes:    reviewerAgent.brainNotes,
        routeOutputTo: null,
        isReviewer:    true,
      }),
      allDiffs:       combinedDiffsForReview,
      blueprintContext,
      userPrompt,
      coderAgent,
      chatHistory,
      colorIndex,
      onEvent,
      signal,
      runId,
      onDiffsReplaced: (d) => { reviewedDiffs = d; },
    });

    await onDiffsAccumulated(reviewedDiffs);
  } else {
    await onDiffsAccumulated(iterationDiffs);
  }
}

// ── Reviewer pass helper ──────────────────────────────────────────────────────

interface ReviewerPassOptions {
  agent: Agent;
  systemPrompt: string;
  allDiffs: SearchReplaceBlock[];
  blueprintContext: string;
  userPrompt: string;
  coderAgent: Agent;
  chatHistory: ChatMessage[];
  // H3: removed `loop` — it was never read inside the function; local `let loop = 0` was always used
  colorIndex: number;
  onEvent: (e: OrchestrationEvent) => void;
  signal?: AbortSignal;
  runId: string | null;
  /** Called with the final (possibly corrected) diff set */
  onDiffsReplaced: (diffs: SearchReplaceBlock[]) => void;
}

async function _runReviewerPass(opts: ReviewerPassOptions): Promise<void> {
  const {
    agent,
    systemPrompt,
    allDiffs,
    blueprintContext,
    userPrompt,
    coderAgent,
    chatHistory,
    colorIndex,
    onEvent,
    signal,
    runId,
    onDiffsReplaced,
  } = opts;

  let currentDiffs     = [...allDiffs];
  let reviewPass       = false;
  let loop             = 0;
  let reviewerFeedback = '';

  while (!reviewPass && loop < MAX_REVIEW_LOOPS && !signal?.aborted) {
    loop++;

    onEvent({
      type: 'agent_start',
      agentId:   agent.id,
      agentName: loop > 1 ? `${agent.name} (loop ${loop})` : agent.name,
      emoji:     agent.emoji,
      colorIndex,
    });

    // Build reviewer context — diffs + user prompt + optional previous feedback
    const diffSection = currentDiffs
      .map(
        (d) =>
          `${d.filePath}\n<<<<<<< SEARCH\n${d.search}\n=======\n${d.replace}\n>>>>>>> REPLACE`,
      )
      .join('\n\n');

    const reviewerContext =
      `User request: "${userPrompt}"\n\n` +
      (blueprintContext ? `${blueprintContext}\n\n` : '') +
      `Diffs to review:\n${diffSection}` +
      (reviewerFeedback
        ? `\n\nPrevious review feedback (apply this context on re-review):\n${reviewerFeedback}`
        : '');

    const reviewStartMs = Date.now();

    // C4: use callAgent instead of streamAgentCall — gets model fallback chain,
    //     auto-continuation, quota annotation, and maxRetries handling
    const reviewOutput = await callAgent({
      agent,
      systemPrompt,
      userContent: reviewerContext,
      chatHistory,
      onToken: (t) => onEvent({ type: 'agent_token', agentId: agent.id, token: t }),
      signal,
      temperatureOverride: 0.1,
      maxOutputTokensOverride: 2048,
      onEvent,
    });

    const reviewDuration = Date.now() - reviewStartMs;

    onEvent({
      type: 'agent_complete',
      agentId:     agent.id,
      fullText:    reviewOutput,
      totalTokens: estimateTokens(reviewOutput),
      durationMs:  reviewDuration,
    });

    if (runId) {
      await addAgentEntry(runId, {
        name:       loop > 1 ? `${agent.name} (loop ${loop})` : agent.name,
        model:      agent.model ?? DEFAULT_MODEL,
        tokensIn:   estimateTokens(reviewerContext + systemPrompt),
        tokensOut:  estimateTokens(reviewOutput),
        durationMs: reviewDuration,
      }).catch(() => {});
    }

    const trimmedReview = reviewOutput.trim();

    // FIX 4 — ROBUST PASS DETECTION:
    // Gemini Flash frequently wraps its verdict in markdown bold (**PASS**)
    // or emits a leading newline before the word.  A strict `startsWith('PASS')`
    // would misclassify those as FAIL, burning unnecessary review loops.
    //
    // Detection rules (in order of priority):
    //   1. First non-empty line stripped of markdown bold markers is exactly "PASS"
    //   2. First non-empty line STARTS WITH "PASS" (e.g. "PASS — looks good")
    // Anything else is treated as FAIL.
    const firstMeaningfulLine = trimmedReview
      .split('\n')
      .map((l) => l.trim().replace(/^\*{1,2}|\*{1,2}$/g, '').trim()) // strip ** wrapping
      .find((l) => l.length > 0) ?? '';

    const isPass =
      firstMeaningfulLine === 'PASS' ||
      firstMeaningfulLine.toUpperCase().startsWith('PASS');

    if (isPass) {
      reviewPass = true;
      onEvent({ type: 'reviewer_pass', loop });
    } else {
      reviewerFeedback = reviewOutput;
      onEvent({ type: 'reviewer_fail', loop, feedback: reviewOutput });

      // Coder retry with Reviewer feedback
      const coderSystemPrompt = buildXMLPrompt({
        name:          coderAgent.name,
        role:          coderAgent.role || coderAgent.name,
        systemPrompt:  coderAgent.systemPrompt,
        brainNotes:    coderAgent.brainNotes,
        routeOutputTo: null,
        isReviewer:    false,
      });

      const fixPrompt =
        `Original user request: "${userPrompt}"\n\n` +
        (blueprintContext ? `${blueprintContext}\n\n` : '') +
        `Reviewer feedback (attempt ${loop}):\n${reviewerFeedback}\n\n` +
        `Fix the issues and re-emit the corrected Aider SEARCH/REPLACE diffs.`;

      onEvent({
        type: 'agent_start',
        agentId:   coderAgent.id,
        agentName: `${coderAgent.name} (fix loop ${loop})`,
        emoji:     coderAgent.emoji,
        colorIndex,
      });

      const fixStartMs = Date.now();
      const fixOutput  = await callAgent({
        agent:        coderAgent,
        systemPrompt: coderSystemPrompt,
        userContent:  fixPrompt,
        chatHistory,
        onToken: (t) =>
          onEvent({ type: 'agent_token', agentId: coderAgent.id, token: t }),
        signal,
        onEvent,
      });

      const fixDuration = Date.now() - fixStartMs;

      onEvent({
        type: 'agent_complete',
        agentId:     coderAgent.id,
        fullText:    fixOutput,
        totalTokens: estimateTokens(fixOutput),
        durationMs:  fixDuration,
      });

      if (runId) {
        await addAgentEntry(runId, {
          name:       `${coderAgent.name} (reviewer-fix ${loop})`,
          model:      coderAgent.model ?? DEFAULT_MODEL,
          tokensIn:   estimateTokens(fixPrompt + coderSystemPrompt),
          tokensOut:  estimateTokens(fixOutput),
          durationMs: fixDuration,
        }).catch(() => {});
      }

      const fixDiffs = parseAllBlocks(fixOutput);
      if (fixDiffs.length > 0) {
        // REVIEWER MERGE — block-level precision (Bug 1 fix):
        //
        // Old approach (file-level) was DESTRUCTIVE:
        //   If App.tsx had 3 correct blocks + 1 broken block, and fix-Coder
        //   returned only the corrected block 3, the old filter wiped ALL
        //   blocks for App.tsx from currentDiffs and replaced them with just
        //   the 1 fix block — silently discarding the 2 correct blocks.
        //
        // New approach (block-level by search anchor):
        //   Match each fixDiff block against existing blocks by (filePath +
        //   search anchor).  If a match is found, replace only that block.
        //   Blocks in currentDiffs with no matching anchor in fixDiffs are
        //   kept exactly as they are — cross-file AND within-file safety.
        const fixMap = new Map<string, SearchReplaceBlock>();
        for (const fd of fixDiffs) {
          // Key: filePath + search anchor (first 120 chars of search to survive minor edits)
          const anchor = fd.search.trim().slice(0, 120);
          fixMap.set(`${fd.filePath}||${anchor}`, fd);
        }

        // Build merged list: replace matched blocks, keep everything else
        const merged: SearchReplaceBlock[] = currentDiffs.map((existing) => {
          const anchor = existing.search.trim().slice(0, 120);
          const key = `${existing.filePath}||${anchor}`;
          return fixMap.has(key) ? fixMap.get(key)! : existing;
        });

        // Append any fix blocks whose search anchor had no prior match
        // (Reviewer asked to add a net-new block — rare but valid)
        const existingAnchors = new Set(
          currentDiffs.map((d) => `${d.filePath}||${d.search.trim().slice(0, 120)}`),
        );
        for (const fd of fixDiffs) {
          const key = `${fd.filePath}||${fd.search.trim().slice(0, 120)}`;
          if (!existingAnchors.has(key)) merged.push(fd);
        }

        currentDiffs = merged;

        if (hasDiffBlocks(fixOutput)) {
          const displayFixDiffs = parseDiffBlocks(fixOutput);
          if (displayFixDiffs.length > 0) {
            onEvent({
              type: 'diffs_extracted',
              agentId:   coderAgent.id,
              agentName: `${coderAgent.name} (reviewer-fix ${loop})`,
              diffs:     displayFixDiffs,
            });
          }
        }
      }
    }
  }

  // M6: only emit "couldn't approve" if loops exhausted — not if user cancelled
  if (!reviewPass && !signal?.aborted) {
    onEvent({
      type: 'error',
      message: `Reviewer couldn't approve after ${MAX_REVIEW_LOOPS} loops. Partial diffs shown — review manually before merging.`,
    });
  }

  onDiffsReplaced(currentDiffs);
}
