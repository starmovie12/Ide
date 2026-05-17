import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * v6.1 fixes (May 2026):
 *   FIX-K1 — APIKey.status now includes 'quota-exhausted'. Previously, when
 *            a 429 with RESOURCE_EXHAUSTED came back, the streaming layer
 *            tried to flag the key as quota-exhausted but the store only
 *            knew 'active'/'warning'/'dead', so the call silently downgraded
 *            to 'dead' after 3 errors — meaning a key with quota left was
 *            killed AND the cooldown until midnight PT was never set.
 *   FIX-K2 — markFailure now accepts an optional isQuotaExhausted flag
 *            (matching the signature streaming.ts has always tried to call).
 *            Quota-exhausted keys are parked with a cooldown to ~midnight PT
 *            and skipped by getNextAvailableKey until then.
 *   FIX-K3 — reserveCount lives on the key (per PRD §2.2) so that two
 *            concurrent agent calls don't both grab the same key from a
 *            single-key user. getNextAvailableKey picks the least-reserved
 *            active key, releaseKey decrements safely.
 *   FIX-K4 — cooldownUntil is honored. Burst rate-limit (429 without quota)
 *            sets a short cooldown using Retry-After if available.
 *   FIX-K5 — Daily reset uses US/Pacific midnight (Gemini quota boundary)
 *            instead of a sliding 24h window — so a key exhausted at 11pm PT
 *            unblocks at 12am PT, not 24h later.
 */

export type APIKeyStatus = 'active' | 'warning' | 'dead' | 'quota-exhausted';

export interface APIKey {
  id: string;
  key: string;
  label: string;
  status: APIKeyStatus;
  errorCount: number;
  errorTimestamps: number[]; // timestamps of errors in last 5 min window
  requestCount: number;
  dailyRequests: number;
  dailyResetAt: number; // timestamp of last daily reset (PT midnight)
  lastUsed: number | null;
  lastError: number | null;
  addedAt: number;
  /** in-flight call count — FIX-K3 (PRD Bug #B16) */
  reserveCount: number;
  /** epoch ms until which this key is unavailable (quota / burst rate-limit) — FIX-K4 */
  cooldownUntil: number | null;
}

export interface APIKeyState {
  keys: APIKey[];

  addKey: (key: string, label: string) => string;
  removeKey: (id: string) => void;
  updateKeyStatus: (id: string, status: APIKey['status']) => void;

  // Health tracking
  markFailure: (
    id: string,
    isQuotaExhausted?: boolean,
    retryAfterSeconds?: number | null
  ) => void;
  markSuccess: (id: string) => void;
  releaseKey: (id: string) => void;
  getNextAvailableKey: () => APIKey | null;
  getHealthStatus: (id: string) => 'green' | 'yellow' | 'red' | 'orange';

  // Test
  testKey: (id: string) => Promise<{ success: boolean; latencyMs: number; error?: string }>;

  // Internal
  _incrementRequest: (id: string) => void;
  _currentIndex: number;
}

const FIVE_MINUTES = 5 * 60 * 1000;
const ERROR_THRESHOLD_DEAD = 3;
const ERROR_THRESHOLD_WARNING = 1;
const DEFAULT_BURST_COOLDOWN_MS = 60 * 1000;

function recomputeStatus(key: APIKey): APIKey['status'] {
  const now = Date.now();
  // Only count errors in the last 5-minute window
  const recentErrors = key.errorTimestamps.filter((t) => now - t < FIVE_MINUTES);
  if (recentErrors.length >= ERROR_THRESHOLD_DEAD) return 'dead';
  if (recentErrors.length >= ERROR_THRESHOLD_WARNING) return 'warning';
  return 'active';
}

/**
 * Returns the epoch ms of the next US/Pacific midnight from `now`.
 * Gemini free-tier quota resets at midnight PT — FIX-K5.
 *
 * We compute by walking through Intl.DateTimeFormat to get the current PT
 * components, then constructing the next 00:00 boundary in PT and converting
 * back to UTC. This handles DST transitions correctly because we ask the OS
 * for the PT view rather than assuming a fixed offset.
 */
function nextPacificMidnight(now = Date.now()): number {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date(now)).reduce<Record<string, string>>((acc, p) => {
    if (p.type !== 'literal') acc[p.type] = p.value;
    return acc;
  }, {});
  const ptIso = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
  const ptNowMs = Date.parse(`${ptIso}Z`); // pretend PT wall-clock is UTC to get an offset reference
  const offsetFromUTC = ptNowMs - now;
  // Day count in PT
  const ptDayMs = Math.floor(ptNowMs / 86_400_000);
  const nextPtDayUtcMs = (ptDayMs + 1) * 86_400_000;
  return nextPtDayUtcMs - offsetFromUTC;
}

/**
 * Reset daily counters if we crossed the PT-midnight boundary since dailyResetAt.
 * FIX-K5 — replaces the prior "24h since last reset" sliding window.
 */
function resetDailyIfNeeded(key: APIKey): APIKey {
  const now = Date.now();
  // We mark `dailyResetAt` to the PT-midnight of the day we observed. If the
  // *next* PT midnight after dailyResetAt has already passed, reset.
  const nextResetAfter = nextPacificMidnight(key.dailyResetAt) - 86_400_000; // = PT midnight of the day dailyResetAt is in (end of that day)
  if (now >= nextResetAfter + 86_400_000) {
    return { ...key, dailyRequests: 0, dailyResetAt: now };
  }
  return key;
}

let _roundRobinIndex = 0;

export const useAPIKeyStore = create<APIKeyState>()(
  persist(
    (set, get) => ({
      keys: [],
      _currentIndex: 0,

      addKey: (key, label) => {
        const id = crypto.randomUUID();
        const now = Date.now();
        const newKey: APIKey = {
          id,
          key,
          label,
          status: 'active',
          errorCount: 0,
          errorTimestamps: [],
          requestCount: 0,
          dailyRequests: 0,
          dailyResetAt: now,
          lastUsed: null,
          lastError: null,
          addedAt: now,
          reserveCount: 0,
          cooldownUntil: null,
        };
        set((state) => ({ keys: [...state.keys, newKey] }));
        return id;
      },

      removeKey: (id) =>
        set((state) => ({ keys: state.keys.filter((k) => k.id !== id) })),

      updateKeyStatus: (id, status) =>
        set((state) => ({
          keys: state.keys.map((k) => (k.id === id ? { ...k, status } : k)),
        })),

      markFailure: (id, isQuotaExhausted = false, retryAfterSeconds = null) => {
        set((state) => {
          const now = Date.now();
          const keys = state.keys.map((k) => {
            if (k.id !== id) return k;

            // Always decrement reserveCount on any failure path — FIX-K3
            const reserveCount = Math.max(0, k.reserveCount - 1);
            const lastError = now;

            if (isQuotaExhausted) {
              // FIX-K1 / FIX-K2 / FIX-K5 — park until next PT midnight
              return {
                ...k,
                status: 'quota-exhausted' as APIKeyStatus,
                cooldownUntil: nextPacificMidnight(now),
                reserveCount,
                lastError,
                // Don't pollute errorTimestamps (those drive dead-key heuristic
                // for transient failures; quota is a different signal).
              };
            }

            // Burst rate-limit / generic error — short cooldown (Retry-After when given)
            const errorTimestamps = [...k.errorTimestamps, now].filter(
              (t) => now - t < FIVE_MINUTES
            );
            const burstCooldown =
              retryAfterSeconds && retryAfterSeconds > 0
                ? now + retryAfterSeconds * 1000
                : k.cooldownUntil; // keep existing cooldown if no Retry-After

            const updated: APIKey = {
              ...k,
              errorCount: k.errorCount + 1,
              errorTimestamps,
              lastError,
              reserveCount,
              cooldownUntil: burstCooldown,
            };
            return { ...updated, status: recomputeStatus(updated) };
          });
          return { keys };
        });
      },

      markSuccess: (id) => {
        set((state) => ({
          keys: state.keys.map((k) =>
            k.id === id
              ? {
                  ...k,
                  errorCount: 0,
                  errorTimestamps: [],
                  status: 'active' as APIKeyStatus,
                  lastUsed: Date.now(),
                  reserveCount: Math.max(0, k.reserveCount - 1),
                  cooldownUntil: null,
                }
              : k
          ),
        }));
      },

      releaseKey: (id) => {
        set((state) => ({
          keys: state.keys.map((k) =>
            k.id === id ? { ...k, reserveCount: Math.max(0, k.reserveCount - 1) } : k
          ),
        }));
      },

      getNextAvailableKey: () => {
        const now = Date.now();
        const { keys } = get();
        const available = keys.filter(
          (k) =>
            k.status !== 'dead' &&
            k.status !== 'quota-exhausted' &&
            (k.cooldownUntil === null || now >= k.cooldownUntil)
        );
        if (available.length === 0) return null;

        // Prefer least-reserved (FIX-K3 / PRD §2.2 — least-used wins). Falls back to
        // round-robin among the least-reserved set to keep the existing fairness.
        const minReserve = Math.min(...available.map((k) => k.reserveCount));
        const candidates = available.filter((k) => k.reserveCount === minReserve);
        const pick = candidates[_roundRobinIndex % candidates.length];
        _roundRobinIndex = (_roundRobinIndex + 1) % Math.max(candidates.length, 1);

        // Reserve in the store before returning. We do this with a targeted set()
        // so concurrent callers see the new reserveCount immediately.
        set((state) => ({
          keys: state.keys.map((k) =>
            k.id === pick.id
              ? {
                  ...k,
                  reserveCount: k.reserveCount + 1,
                  requestCount: k.requestCount + 1,
                  lastUsed: now,
                }
              : k
          ),
        }));

        // Return the just-updated record (re-read to ensure the caller sees
        // the new reserveCount in case they introspect it).
        return get().keys.find((k) => k.id === pick.id) ?? pick;
      },

      getHealthStatus: (id) => {
        const key = get().keys.find((k) => k.id === id);
        if (!key) return 'red';
        if (key.status === 'dead') return 'red';
        if (key.status === 'quota-exhausted') return 'orange';
        if (key.status === 'warning') return 'yellow';
        return 'green';
      },

      testKey: async (id) => {
        const key = get().keys.find((k) => k.id === id);
        if (!key) return { success: false, latencyMs: 0, error: 'Key not found' };

        const start = Date.now();
        try {
          const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(
              key.key
            )}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: [{ text: 'Hi' }] }],
                generationConfig: { maxOutputTokens: 1 },
              }),
            }
          );
          const latencyMs = Date.now() - start;
          if (response.ok) {
            // markSuccess decrements reserveCount; testKey did not reserve, so
            // we bump reserveCount first to keep the invariant balanced.
            set((state) => ({
              keys: state.keys.map((k) =>
                k.id === id ? { ...k, reserveCount: k.reserveCount + 1 } : k
              ),
            }));
            get().markSuccess(id);
            get()._incrementRequest(id);
            return { success: true, latencyMs };
          }

          const err = await response.json().catch(() => ({}));
          const errMsg =
            (err as { error?: { message?: string } })?.error?.message ?? '';
          const isQuota =
            response.status === 429 &&
            (errMsg.toLowerCase().includes('quota') ||
              errMsg.toLowerCase().includes('exhausted'));

          // Same balance trick — testKey didn't reserve, so we add then subtract
          // in markFailure to keep reserveCount at 0.
          set((state) => ({
            keys: state.keys.map((k) =>
              k.id === id ? { ...k, reserveCount: k.reserveCount + 1 } : k
            ),
          }));
          get().markFailure(id, isQuota, null);
          return {
            success: false,
            latencyMs,
            error: isQuota
              ? 'Quota exhausted (resets midnight PT)'
              : errMsg || `HTTP ${response.status}`,
          };
        } catch (e: unknown) {
          const latencyMs = Date.now() - start;
          set((state) => ({
            keys: state.keys.map((k) =>
              k.id === id ? { ...k, reserveCount: k.reserveCount + 1 } : k
            ),
          }));
          get().markFailure(id, false, null);
          return {
            success: false,
            latencyMs,
            error: e instanceof Error ? e.message : 'Network error',
          };
        }
      },

      _incrementRequest: (id) => {
        set((state) => ({
          keys: state.keys.map((k) => {
            if (k.id !== id) return k;
            const fresh = resetDailyIfNeeded(k);
            return {
              ...fresh,
              requestCount: fresh.requestCount + 1,
              dailyRequests: fresh.dailyRequests + 1,
              lastUsed: Date.now(),
            };
          }),
        }));
      },
    }),
    {
      name: 'api-key-storage',
      // Persisted state may pre-date FIX-K1/K3 — migrate older shape forward
      // so existing users don't crash on load. Only state slices are
      // persisted (zustand reattaches the action methods on rehydration),
      // so we only need to fix up `keys` and `_currentIndex` here.
      version: 2,
      migrate: (persisted: unknown, _version: number) => {
        const state = persisted as { keys?: unknown[]; _currentIndex?: number } | null;
        if (!state || !Array.isArray(state.keys)) {
          return { keys: [], _currentIndex: 0 } as unknown as APIKeyState;
        }
        // For each key, supply defaults for newly-added fields ONLY if the
        // persisted object is missing them. Spread the persisted key LAST
        // so it overrides defaults (TS would otherwise warn about
        // duplicate-key shadowing in the literal).
        const migratedKeys = state.keys.map((rawKey) => {
          const k = rawKey as Partial<APIKey>;
          return {
            reserveCount: 0,
            cooldownUntil: null,
            ...k,
          };
        }) as APIKey[];
        return {
          keys: migratedKeys,
          _currentIndex: state._currentIndex ?? 0,
        } as unknown as APIKeyState;
      },
    }
  )
);
