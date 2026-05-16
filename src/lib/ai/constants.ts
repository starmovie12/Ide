export const GEMINI_MODELS = {
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
    recommendedFor: ['manager', 'designer', 'coder', 'reviewer'],
  },
  'gemini-2.5-flash': {
    id: 'gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    tier: 'free' as const,
    rpd: 1500, rpm: 15, tpm: 1_000_000,
    contextWindow: 1_000_000,
    multimodal: true,
    recommendedFor: ['fallback'],
  },
  'gemini-2.5-flash-lite': {
    id: 'gemini-2.5-flash-lite',
    label: 'Gemini 2.5 Flash-Lite',
    tier: 'free' as const,
    rpd: 1500, rpm: 30, tpm: 1_000_000,
    contextWindow: 1_000_000,
    multimodal: false,
    recommendedFor: ['blueprint-summarizer', 'simple-tasks'],
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
  'gemini-3.1-pro-preview': {
    id: 'gemini-3.1-pro-preview',
    label: 'Gemini 3.1 Pro (Preview)',
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
    label: 'Gemini 2.5 Pro (Legacy)',
    tier: 'paid' as const,
    contextWindow: 2_000_000,
    multimodal: true,
    rpd: 50, rpm: 5, tpm: 250_000,
    recommendedFor: ['cheapest-pro'],
  },
} as const;

export type GeminiModelId = keyof typeof GEMINI_MODELS;

export const FREE_MODELS = Object.values(GEMINI_MODELS).filter((m) => m.tier === 'free');
export const PAID_MODELS = Object.values(GEMINI_MODELS).filter((m) => m.tier === 'paid');

export const DEFAULT_MODEL = 'gemini-2.5-flash';
export const BLUEPRINT_MODEL = 'gemini-2.5-flash-lite';
export const FALLBACK_MODEL = 'gemini-2.5-flash';

export const AGENT_DEFAULT_MODELS = {
  manager: DEFAULT_MODEL,
  designer: DEFAULT_MODEL,
  coder: DEFAULT_MODEL,
  reviewer: DEFAULT_MODEL,
  debugger: DEFAULT_MODEL,
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
</responsibilities>
<output_format>
1. Brief summary of what needs to change
2. List of files that will be modified and why
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
</editing_rules>
<output_format>
For each file, emit:
// file: path/to/file.ext
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
1. Does each SEARCH block actually exist in the file?
2. Does the REPLACE block syntax-validate (no obvious errors)?
3. Does the change actually do what the user asked?
4. Does it follow project conventions?
5. No new lint issues? No unused imports? No unused variables?
6. If a function signature changed, are all callers also updated?
</checks>
<output_format>
If all checks pass:
PASS

If any check fails:
FAIL
Issue: [specific check that failed]
Suggestion: [exact fix Coder should make]
</output_format>`,
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
You fix runtime and build errors caused by recent code changes.
</role>
<approach>
1. Parse the error: find file, line, message
2. Identify root cause from the recent diffs
3. Emit MINIMAL fix using the same SEARCH/REPLACE format
4. Never revert unrelated changes — only fix what the error points to
</approach>
<output_format>
Same SEARCH/REPLACE format as Coder.
After diffs, emit:
<fix_summary>1 sentence: what was wrong, what the fix does</fix_summary>
</output_format>`,
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
- Use Tailwind CSS or CSS-in-JS consistently with the project style
- Ensure accessibility: ARIA labels, keyboard nav, focus management
- Handle all states: loading, empty, error, hover, active, disabled
- Use design tokens/CSS variables rather than raw color values
- Write responsive layouts that work on mobile and desktop
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
