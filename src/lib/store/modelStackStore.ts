/**
 * Model Stack Store — Part 4 §3.5
 *
 * Owns the user's current Mind Stack (1, 2, or 3 minds) and the saved
 * configurations they fall back to when switching between counts via the
 * QuickStackSwitcher.
 *
 * Persisted: yes (localStorage via zustand/middleware).
 * Mid-task switches are legal (Part 4 §5.9) — the orchestrator re-reads
 * `activeStack` each Continuum iteration via `useModelStackStore.getState()`.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Mind, MindCount } from '@/lib/forge/modelGroups';
import { DEFAULT_STACKS } from '@/lib/forge/modelGroups';

export type SynthesisBias = 'auto' | 'coding' | 'prose';

export interface ModelStackState {
  /** Currently selected mind count (1 = Solo, 2 = Duo, 3 = Trio) */
  mindCount: MindCount;

  /** The stack that will be used for the NEXT operation. Length === mindCount. */
  activeStack: Mind[];

  /**
   * Per-count saved stacks. When user clicks the "2" pill in QuickStackSwitcher,
   * we restore savedStacks[2] without losing their carefully-picked Trio config.
   */
  savedStacks: Record<MindCount, Mind[]>;

  /** Round 3 aggregator bias for Duo Mind (auto | coding | prose) */
  synthesisBias: SynthesisBias;

  // ─── actions ──────────────────────────────────────────────────────

  /** Switch mind count, restoring whatever stack the user last saved at that count. */
  switchToCount: (n: MindCount) => void;

  /** Replace activeStack with a new arrangement (called from picker sheet). */
  setStack: (stack: Mind[]) => void;

  /** Persist a stack as the default for a given mind count. */
  setSavedStack: (n: MindCount, stack: Mind[]) => void;

  /** Update Duo Mind synthesis bias. */
  setSynthesisBias: (bias: SynthesisBias) => void;
}

export const useModelStackStore = create<ModelStackState>()(
  persist(
    (set, get) => ({
      mindCount: 1,
      activeStack: [...DEFAULT_STACKS[1].minds],
      savedStacks: {
        1: [...DEFAULT_STACKS[1].minds],
        2: [...DEFAULT_STACKS[2].minds],
        3: [...DEFAULT_STACKS[3].minds],
      },
      synthesisBias: 'auto',

      switchToCount: (n) => {
        const saved = get().savedStacks[n];
        // Defensive copy — never share references between savedStacks and activeStack,
        // otherwise an inline mutation to activeStack would leak into the saved slot.
        set({ mindCount: n, activeStack: saved.map((m) => ({ ...m })) });
      },

      setStack: (stack) => {
        // Mid-flight setStack: enforce that the stack length matches current mindCount.
        // If user picks a 3-mind stack while count is 2, we update count too — UI sends
        // them together but defensive code prevents store inconsistency.
        const len = stack.length as MindCount;
        if (len === 1 || len === 2 || len === 3) {
          set({
            mindCount: len,
            activeStack: stack.map((m) => ({ ...m })),
          });
        } else {
          // Bad length — ignore, log for dev awareness.
          // eslint-disable-next-line no-console
          console.warn('[modelStackStore] setStack ignored: invalid length', len);
        }
      },

      setSavedStack: (n, stack) => {
        set((state) => ({
          savedStacks: {
            ...state.savedStacks,
            [n]: stack.map((m) => ({ ...m })),
          },
        }));
      },

      setSynthesisBias: (bias) => set({ synthesisBias: bias }),
    }),
    {
      name: 'forge-model-stack',
      // Persist only the data — actions are recreated on rehydrate.
      partialize: (state) => ({
        mindCount: state.mindCount,
        activeStack: state.activeStack,
        savedStacks: state.savedStacks,
        synthesisBias: state.synthesisBias,
      }),
    },
  ),
);
