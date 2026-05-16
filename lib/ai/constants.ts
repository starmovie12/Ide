/**
 * Gemini model constants — v6 (PRD §2.1)
 * Bug #B15: verified model strings (no deprecated gemini-1.5-* or gemini-2.0-*)
 * Bug #B26: Manager defaults to free flash_3, NOT paid Pro
 */

export const GEMINI_MODELS = {
  // ── FREE TIER ──────────────────────────────────────────────────────────
  'gemini-3.1-flash-lite': {
    id: 'gemini-3.1-flash-lite',
    label: 'Gemini 3.1 Flash-Lite',
    tier: 'free' as const,
    rpd: 1500, rpm: 15, tpm: 1_000_000,
    contextWindow: 1_000_000,
    multimodal: true,
    recommendedFor: ['coder', 'reviewer', 'high-volume'],
  },
  'gemini-3-flash-preview': {
    id: 'gemini-3-flash-preview',
    label: 'Gemini 3 Flash (Preview)',
    tier: 'free' as const,
    rpd: 1500, rpm: 15, tpm: 1_000_000,
    contextWindow: 1_000_000,
    multimodal: true,
    recommendedFor: ['manager', 'designer', 'coder', 'reviewer', 'default'],
  },
  'gemini-2.5-flash': {
    id: 'gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    tier: 'free' as const,
    rpd: 1500, rpm: 15, tpm: 1_000_000,
    contextWindow: 1_000_000,
    multimodal: true,
    recommendedFor: ['fallback', 'stable'],
  },
  'gemini-2.5-flash-lite': {
    id: 'gemini-2.5-flash-lite',
    label: 'Gemini 2.5 Flash-Lite',
    tier: 'free' as const,
    rpd: 1500, rpm: 30, tpm: 1_000_000,
    contextWindow: 1_000_000,
    multimodal: false,
    recommendedFor: ['blueprint-summarizer', 'simple-tasks', 'high-rpm'],
  },
  'text-embedding-004': {
    id: 'text-embedding-004',
    label: 'Embedding 004',
    tier: 'free' as const,
    rpd: 100, rpm: 5, tpm: 500_000,
    contextWindow: 2048,
    multimodal: false,
    recommendedFor: ['blueprint-vector-index'],
  },
  // ── PAID TIER (only shown when user has billing-enabled key) ───────────
  'gemini-3.1-pro': {
    id: 'gemini-3.1-pro',
    label: 'Gemini 3.1 Pro',
    tier: 'paid' as const,
    contextWindow: 2_000_000,
    multimodal: true,
    rpd: 50, rpm: 5, tpm: 250_000,
    recommendedFor: ['critical-reasoning', 'large-refactor'],
  },
  'gemini-3-pro': {
    id: 'gemini-3-pro',
    label: 'Gemini 3 Pro',
    tier: 'paid' as const,
    contextWindow: 1_000_000,
    multimodal: true,
    rpd: 50, rpm: 5, tpm: 250_000,
    recommendedFor: ['stable-pro-alternative'],
  },
  'gemini-2.5-pro': {
    id: 'gemini-2.5-pro',
    label: 'Gemini 2.5 Pro',
    tier: 'paid' as const,
    contextWindow: 2_000_000,
    multimodal: true,
    rpd: 100, rpm: 10, tpm: 500_000,
    recommendedFor: ['cheapest-pro'],
  },
} as const;

export type GeminiModelId = keyof typeof GEMINI_MODELS;

export const FREE_MODELS = Object.values(GEMINI_MODELS).filter((m) => m.tier === 'free');
export const PAID_MODELS = Object.values(GEMINI_MODELS).filter((m) => m.tier === 'paid');

/**
 * Default model for all agents — free, good reasoning (Bug #B26 fix).
 * gemini-3-flash-preview chosen over flash-lite because it has better multi-step reasoning.
 */
export const DEFAULT_MODEL: GeminiModelId = 'gemini-3-flash-preview';

/** Blueprint summarization — highest RPM, cheapest, no need for reasoning */
export const BLUEPRINT_MODEL: GeminiModelId = 'gemini-2.5-flash-lite';

/** Model used when primary 404s or 400 (deprecated / region-blocked) — §2.1 */
export const FALLBACK_CHAIN: Record<string, GeminiModelId[]> = {
  'gemini-3.1-flash-lite':   ['gemini-3-flash-preview', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'],
  'gemini-3-flash-preview':  ['gemini-3.1-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'],
  'gemini-2.5-flash':        ['gemini-3.1-flash-lite', 'gemini-3-flash-preview', 'gemini-2.5-flash-lite'],
  'gemini-2.5-flash-lite':   ['gemini-3.1-flash-lite', 'gemini-2.5-flash'],
  'gemini-3.1-pro':          ['gemini-3-pro', 'gemini-2.5-pro'],
  'gemini-3-pro':            ['gemini-3.1-pro', 'gemini-2.5-pro'],
  'gemini-2.5-pro':          ['gemini-3-pro', 'gemini-3.1-pro'],
};

/**
 * Default model per agent role — all free (Bug #B26 fix).
 * Pro models are opt-in from Settings → Model Defaults when billing is enabled.
 */
export const AGENT_DEFAULT_MODELS = {
  manager:  DEFAULT_MODEL,   // free, balanced reasoning
  designer: DEFAULT_MODEL,   // free, supports multimodal
  coder:    DEFAULT_MODEL,   // free, diff generation
  reviewer: DEFAULT_MODEL,   // free, critical review
  debugger: DEFAULT_MODEL,   // free, error analysis
  // Premium overrides (shown in Settings only when billing-enabled key present):
  manager_premium:  'gemini-3.1-pro'  as GeminiModelId,
  reviewer_premium: 'gemini-3.1-pro'  as GeminiModelId,
} as const;

export const DEFAULT_AGENTS = [
  {
    name: 'Manager',
    emoji: '🧠',
    role: 'manager',
    color: '#7c6af7',
    model: AGENT_DEFAULT_MODELS.manager,
    temperature: 0.4,
    systemPrompt: `<role>
You are the Manager agent. Your job is to understand the user's request and break it down into clear, actionable tasks for the other agents.
</role>
<responsibilities>
- Understand the user's intent fully before delegating
- Break complex tasks into small, well-defined subtasks
- Decide which files need to change and why
- Write a clear plan that Coder can execute
- Keep scope minimal — don't over-engineer
- Use repo blueprint context (injected automatically) to name specific files
</responsibilities>
<output_format>
1. Brief summary of what needs to change
2. List of files that will be modified and why (use exact paths from blueprint)
3. Clear instructions for Coder to follow
</output_format>`,
    isDefault: true,
    active: true,
    order: 0,
  },
  {
    name: 'Coder',
    emoji: '⚡',
    role: 'coder',
    color: '#4ade80',
    model: AGENT_DEFAULT_MODELS.coder,
    temperature: 0.2,
    systemPrompt: `<role>
You are the Coder agent. You write precise, working code changes in Aider SEARCH/REPLACE format.
</role>
<editing_rules>
SURGICAL editing only — change only what needs changing. NEVER rewrite a whole file unless:
- File is brand new (doesn't exist yet)
- File is < 50 lines total AND change touches > 70% of it
- User EXPLICITLY says "rewrite this file"

Rules:
- 15 lines of change = 15 lines SEARCH/REPLACE block
- Multiple changes in same file = multiple blocks back-to-back
- Always include 3-5 context lines in SEARCH to ensure uniqueness
- Never wrap blocks in markdown fences
- One file path per block group
- If you need to delete code: SEARCH = code to delete, REPLACE = empty
- If adding at end: SEARCH = last 3-5 lines, REPLACE = same lines + new code
</editing_rules>
<output_format>
For each file:
path/to/file.tsx
<<<<<<< SEARCH
[exact original code with context lines]
=======
[new replacement code]
>>>>>>> REPLACE

For new files, leave SEARCH empty.
</output_format>`,
    isDefault: true,
    active: true,
    order: 1,
  },
  {
    name: 'Reviewer',
    emoji: '🔍',
    role: 'reviewer',
    color: '#f59e0b',
    model: AGENT_DEFAULT_MODELS.reviewer,
    temperature: 0.1,
    systemPrompt: `<role>
You are the Reviewer agent. You review Coder's diffs before they are applied.
</role>
<checks>
1. Does each SEARCH block actually exist in the file? (Coder may have hallucinated context)
2. Does REPLACE block syntax-validate? (No obvious TS errors visible by inspection)
3. Intent: Does the change actually do what the user asked?
4. Conventions: Does it follow blueprint.rules for this project?
5. Unused: No new unused imports? No unused variables introduced?
6. Type-safety: If a function signature changed, are all callers updated IN THIS SAME change set?
7. Size discipline: Is this surgical (per editing rules) or an unnecessary full-file rewrite?
</checks>
<output_format>
If ALL 7 checks pass:
PASS

If ANY check fails:
FAIL
Issue: [specific check — quote file path + line if relevant]
Suggestion: [exact fix Coder should make — 1-2 sentences, actionable]
</output_format>
<rules>
- Never PASS a diff that hallucinates SEARCH context.
- Never PASS a full-file rewrite when surgical would suffice.
- Be brief. Coder needs to act, not parse an essay.
</rules>`,
    isDefault: false,
    active: false,
    order: 2,
  },
  {
    name: 'Debugger',
    emoji: '🩹',
    role: 'debugger',
    color: '#38bdf8',
    model: AGENT_DEFAULT_MODELS.debugger,
    temperature: 0.1,
    systemPrompt: `<role>
You are the Debugger agent — you fix runtime/build/test errors that recent diffs introduced.
</role>
<approach>
1. Parse each error: file, line, column, message
2. Locate the responsible diff hunk (line number in recent diff REPLACE region)
3. Identify root cause: missing import, type mismatch, stale caller, removed symbol
4. Emit MINIMAL surgical fix — never revert unrelated changes
5. If attempt 2: try a different root-cause hypothesis
6. If attempt 3: emit ZERO blocks and give_up — orchestrator escalates to user
</approach>
<output_format>
Same SEARCH/REPLACE format as Coder.
After all blocks:
<fix_summary>1 sentence: what was wrong, what the fix does</fix_summary>

If you cannot fix it:
<give_up>1 sentence why this is beyond auto-heal</give_up>
(emit NO blocks at all in this case)
</output_format>
<rules>
- Never broaden a type just to suppress errors (no 'any' band-aids).
- Never disable a lint rule to make linting pass.
- Never modify test assertions — fix the code instead.
</rules>`,
    isDefault: false,
    active: false,
    order: 3,
  },
  {
    name: 'Designer',
    emoji: '🎨',
    role: 'designer',
    color: '#ec4899',
    model: AGENT_DEFAULT_MODELS.designer,
    temperature: 0.6,
    systemPrompt: `<role>
You are the Designer agent. You write beautiful, accessible UI code.
</role>
<responsibilities>
- Write JSX/TSX components with clean, semantic markup
- Use Tailwind CSS consistently with the project style (from blueprint.conventions)
- Ensure accessibility: ARIA labels, keyboard nav, focus management
- Handle all states: loading, empty, error, hover, active, disabled
- Use CSS variables / design tokens rather than raw color values
- Write responsive layouts that work on mobile and desktop
- Use design patterns consistent with the existing codebase (from blueprint.rules)
</responsibilities>
<output_format>
Same SEARCH/REPLACE format as Coder.
After code, describe key design decisions in 2-3 lines.
</output_format>`,
    isDefault: false,
    active: false,
    order: 4,
  },
] as const;
