/**
 * Forge Model Groups — Part 4 §3.2
 *
 * Catalog of providers + models the Mind Stack picker offers.
 * Inherits Part 2 §2 catalogue concept but flattened for Focus Forge.
 *
 * The `provider` field is what the Duo Mind routing layer uses to decide
 * how to call the model (Gemini REST vs Puter.js bridge vs OpenRouter REST).
 *
 * IMPORTANT: This file is the SINGLE SOURCE OF TRUTH for the picker UI.
 * The orchestrator adapter (Phase 5.10.H) reads from here when constructing
 * Duo Mind round calls.
 */

export type ProviderId =
  | 'gemini'
  | 'deepseek_puter'
  | 'puter_claude'
  | 'openrouter_free';

export type ModelTier = 'free' | 'free-reduced' | 'paid';

export interface ForgeModel {
  /** Stable ID — used as discriminator in zustand state */
  id: string;
  /** Human-readable label shown in picker */
  display: string;
  /** Provider that knows how to call this model */
  provider: ProviderId;
  /** Pricing/quota tier — drives UI badging in picker */
  tier: ModelTier;
  /** True if call goes through Puter.js bridge (user pays via Puter, no key in this app) */
  viaPuter: boolean;
  /** Recommended role: 'coding' favors DeepSeek, 'prose' favors Gemini */
  bestFor: ReadonlyArray<'coding' | 'prose' | 'critique' | 'synthesis'>;
}

/**
 * Provider → models mapping. Kept flat & const so the picker can render
 * without runtime gymnastics.
 */
export const FORGE_MODEL_GROUPS = {
  gemini: [
    {
      id: 'gemini-3.1-flash-lite',
      display: 'Gemini 3.1 Flash Lite',
      provider: 'gemini',
      tier: 'free',
      viaPuter: false,
      bestFor: ['coding', 'critique'],
    },
    {
      id: 'gemini-3-flash-preview',
      display: 'Gemini 3 Flash',
      provider: 'gemini',
      tier: 'free',
      viaPuter: false,
      bestFor: ['coding', 'prose', 'critique', 'synthesis'],
    },
    {
      id: 'gemini-2.5-flash',
      display: 'Gemini 2.5 Flash',
      provider: 'gemini',
      tier: 'free-reduced',
      viaPuter: false,
      bestFor: ['prose', 'critique'],
    },
  ],
  deepseek_puter: [
    {
      id: 'deepseek-v4-flash',
      display: 'DeepSeek V4 Flash (Puter)',
      provider: 'deepseek_puter',
      tier: 'paid',
      viaPuter: true,
      bestFor: ['coding', 'synthesis'],
    },
    {
      id: 'deepseek-v4-pro',
      display: 'DeepSeek V4 Pro (Puter)',
      provider: 'deepseek_puter',
      tier: 'paid',
      viaPuter: true,
      bestFor: ['coding', 'synthesis', 'critique'],
    },
  ],
  puter_claude: [
    {
      id: 'claude-sonnet-4-puter',
      display: 'Claude Sonnet (Puter)',
      provider: 'puter_claude',
      tier: 'paid',
      viaPuter: true,
      bestFor: ['prose', 'synthesis', 'critique', 'coding'],
    },
  ],
  openrouter_free: [
    {
      id: 'deepseek-v3.1-or-free',
      display: 'DeepSeek V3.1 (OpenRouter free)',
      provider: 'openrouter_free',
      tier: 'free',
      viaPuter: false,
      bestFor: ['coding', 'critique'],
    },
  ],
} as const satisfies Record<ProviderId, ReadonlyArray<ForgeModel>>;

/** A single "Mind" in a Mind Stack — a provider + chosen model from that provider. */
export interface Mind {
  provider: ProviderId;
  model: string;
}

export type MindCount = 1 | 2 | 3;

export interface MindStackDefaults {
  minds: Mind[];
  /** For Duo: drives Round 3 aggregator pick. For Solo: ignored. */
  synthesisBias?: 'auto' | 'coding' | 'prose';
  /** For Trio: resolves 1-1-1 split. */
  plurality?: 'majority';
}

/**
 * Defaults applied on first run. User picks override via picker;
 * choices persist in modelStackStore.
 */
export const DEFAULT_STACKS: Record<MindCount, MindStackDefaults> = {
  1: {
    minds: [{ provider: 'gemini', model: 'gemini-3-flash-preview' }],
  },
  2: {
    minds: [
      { provider: 'gemini', model: 'gemini-3-flash-preview' },
      { provider: 'puter_claude', model: 'claude-sonnet-4-puter' },
    ],
    synthesisBias: 'auto',
  },
  3: {
    minds: [
      { provider: 'gemini', model: 'gemini-3-flash-preview' },
      { provider: 'deepseek_puter', model: 'deepseek-v4-pro' },
      { provider: 'puter_claude', model: 'claude-sonnet-4-puter' },
    ],
    plurality: 'majority',
  },
};

/** Flat array of every model — useful for picker rendering loops. */
export const ALL_FORGE_MODELS: ReadonlyArray<ForgeModel> = Object.values(
  FORGE_MODEL_GROUPS,
).flat();

/** Lookup helper used by orchestrator to find display label / tier for a Mind. */
export function lookupModel(mind: Mind): ForgeModel | null {
  const group = FORGE_MODEL_GROUPS[mind.provider];
  if (!group) return null;
  return group.find((m) => m.id === mind.model) ?? null;
}

/** Convenience: human label for a Mind (provider + model display). */
export function mindLabel(mind: Mind): string {
  const m = lookupModel(mind);
  return m ? m.display : `${mind.provider}/${mind.model}`;
}
