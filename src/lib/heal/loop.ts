/**
 * Auto-Error-Heal Loop — Phase 5 §4.2 / §1.6
 *
 * Pipeline:
 *   1. Run sandbox (WebContainer or Cloud-mode)
 *   2. If errors → call Debugger agent with error context + blueprint snippets
 *   3. Apply Debugger's diffs on top of existing changes
 *   4. Repeat up to MAX_HEAL_ATTEMPTS = 3
 *   5. On final failure → return HealResult with ok=false for user escalation
 *
 * §1.6 invariants:
 *   - Never reverts unrelated changes
 *   - On 3 failures: user gets explicit card (no silent rollback)
 *   - Debugger receives ONLY: errors + recent diffs + blueprint snippets
 */

import type { SearchReplaceBlock } from '@/lib/diff/parser';
import type { RepoBlueprint } from '@/lib/blueprint/types';
import type { SandboxResult } from '@/lib/sandbox/types';
import type { FilePatch } from '@/lib/sandbox/types';
import { formatErrorsForDebugger, filterErrorsByFiles } from './errorParser';
import { selectRelevantContext, formatBlueprintContext } from '@/lib/blueprint/selector';
import { streamAgentCall, toGeminiMessages } from '@/lib/ai/streaming';
import { parseDiffBlocks, parseAllBlocks } from '@/lib/diff/parser';
import type { Agent } from '@/lib/store/agentStore';

/** Maximum heal attempts before giving up and surfacing to user — §1.6 */
const MAX_HEAL_ATTEMPTS = 3 as const;

export interface HealResult {
  ok: boolean;
  attempts: number;
  /** All diffs emitted across all heal attempts (accumulated) */
  allHealDiffs: SearchReplaceBlock[];
  /** Final error state (if ok=false) */
  finalErrors?: string;
  /** Reason string if Debugger gave up (gave_up) */
  gaveUpReason?: string;
}

export interface HealLoopOptions {
  initialSandboxResult: SandboxResult;
  currentDiffs: SearchReplaceBlock[];
  blueprint: RepoBlueprint | null;
  debuggerAgent: Agent;
  userPrompt: string;
  /** Called to run the sandbox again after diffs are applied */
  runSandbox: (patches: FilePatch[]) => Promise<SandboxResult>;
  /** Called to apply heal diffs to in-memory file state */
  applyDiffs: (diffs: SearchReplaceBlock[]) => Promise<void>;
  /** Stream token callback for UI updates */
  onToken: (agentId: string, token: string) => void;
  signal?: AbortSignal;
}

/**
 * Run the auto-heal loop.
 * Returns HealResult — caller decides what to show the user on failure.
 */
export async function runHealLoop(opts: HealLoopOptions): Promise<HealResult> {
  const {
    initialSandboxResult,
    currentDiffs,
    blueprint,
    debuggerAgent,
    userPrompt,
    runSandbox,
    applyDiffs,
    onToken,
    signal,
  } = opts;

  let attempt = 0;
  let lastResult = initialSandboxResult;
  let lastDiffs = [...currentDiffs];
  const allHealDiffs: SearchReplaceBlock[] = [];

  while (attempt < MAX_HEAL_ATTEMPTS) {
    if (signal?.aborted) {
      return { ok: false, attempts: attempt, allHealDiffs, finalErrors: 'Aborted' };
    }

    if (lastResult.ok) {
      return { ok: true, attempts: attempt, allHealDiffs };
    }

    attempt += 1;

    // Build Debugger context
    const recentDiffFiles = lastDiffs.map((d) => d.filePath).filter((p) => p !== 'unknown');
    const relevantErrors = filterErrorsByFiles(lastResult.errors, recentDiffFiles);
    const errorSummary = formatErrorsForDebugger(relevantErrors, recentDiffFiles);

    // Blueprint snippets for files in error stack
    let blueprintCtx = '';
    if (blueprint) {
      const sel = selectRelevantContext(blueprint, recentDiffFiles.join(' '));
      blueprintCtx = formatBlueprintContext(sel);
    }

    const diffContext = lastDiffs
      .slice(0, 10) // cap to avoid token overflow
      .map(
        (d) =>
          `${d.filePath}\n<<<<<<< SEARCH\n${d.search.slice(0, 400)}\n=======\n${d.replace.slice(0, 400)}\n>>>>>>> REPLACE`
      )
      .join('\n\n');

    const debuggerPrompt =
      `Auto-heal attempt ${attempt} / ${MAX_HEAL_ATTEMPTS}.\n\n` +
      `ERRORS:\n${errorSummary}\n\n` +
      `RECENT DIFFS (suspect):\n${diffContext}\n\n` +
      (blueprintCtx ? `BLUEPRINT CONTEXT:\n${blueprintCtx}\n\n` : '') +
      `Original user intent: "${userPrompt}"\n\n` +
      `Fix ONLY what the errors point at. Use SEARCH/REPLACE format. ` +
      `If you cannot fix it, emit <give_up>reason</give_up> and NO blocks.`;

    // Call Debugger agent
    let debuggerOutput = '';
    await streamAgentCall(
      {
        model: debuggerAgent.model,
        temperature: 0.1,
        maxOutputTokens: 4096,
        systemInstruction: debuggerAgent.systemPrompt,
      },
      [
        ...toGeminiMessages([]),
        { role: 'user' as const, parts: [{ text: debuggerPrompt }] },
      ],
      (event) => {
        if (event.type === 'token') {
          debuggerOutput += event.text;
          onToken(debuggerAgent.id, event.text);
        }
      }
    );

    // Check for give_up
    if (debuggerOutput.includes('<give_up>')) {
      const match = debuggerOutput.match(/<give_up>([\s\S]*?)<\/give_up>/);
      return {
        ok: false,
        attempts: attempt,
        allHealDiffs,
        gaveUpReason: match?.[1]?.trim() ?? 'Debugger gave up',
      };
    }

    // Parse heal diffs
    const healBlocks = parseAllBlocks(debuggerOutput);
    if (healBlocks.length === 0) {
      return {
        ok: false,
        attempts: attempt,
        allHealDiffs,
        finalErrors: errorSummary,
      };
    }

    // Apply heal diffs
    await applyDiffs(healBlocks);
    allHealDiffs.push(...healBlocks);
    lastDiffs = [...lastDiffs, ...healBlocks];

    // Re-run sandbox
    const patches: FilePatch[] = healBlocks.map((b) => ({
      path: b.filePath,
      content: b.replace,
    }));
    lastResult = await runSandbox(patches);
  }

  // Exhausted all attempts
  return {
    ok: false,
    attempts: MAX_HEAL_ATTEMPTS,
    allHealDiffs,
    finalErrors:
      lastResult.errors.map((e) => e.message).join('\n') ||
      'Unknown errors after max heal attempts',
  };
}

/** Max attempts constant exposed for UI */
export { MAX_HEAL_ATTEMPTS };
