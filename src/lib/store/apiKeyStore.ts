import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface APIKey {
  id: string;
  key: string;
  label: string;
  status: 'active' | 'warning' | 'dead';
  errorCount: number;
  errorTimestamps: number[];  // timestamps of errors in last 5 min window
  requestCount: number;
  dailyRequests: number;
  dailyResetAt: number;       // timestamp of last daily reset
  lastUsed: number | null;
  lastError: number | null;
  addedAt: number;
}

export interface APIKeyState {
  keys: APIKey[];

  addKey: (key: string, label: string) => string;
  removeKey: (id: string) => void;
  updateKeyStatus: (id: string, status: APIKey['status']) => void;

  // Health tracking
  markFailure: (id: string) => void;
  markSuccess: (id: string) => void;
  getNextAvailableKey: () => APIKey | null;
  getHealthStatus: (id: string) => 'green' | 'yellow' | 'red';

  // Test
  testKey: (id: string) => Promise<{ success: boolean; latencyMs: number; error?: string }>;

  // Internal
  _incrementRequest: (id: string) => void;
  _currentIndex: number;
}

const FIVE_MINUTES = 5 * 60 * 1000;
const ERROR_THRESHOLD_DEAD = 3;
const ERROR_THRESHOLD_WARNING = 1;

function recomputeStatus(key: APIKey): APIKey['status'] {
  const now = Date.now();
  // Only count errors in the last 5-minute window
  const recentErrors = key.errorTimestamps.filter((t) => now - t < FIVE_MINUTES);
  if (recentErrors.length >= ERROR_THRESHOLD_DEAD) return 'dead';
  if (recentErrors.length >= ERROR_THRESHOLD_WARNING) return 'warning';
  return 'active';
}

function resetDailyIfNeeded(key: APIKey): APIKey {
  const oneDayMs = 24 * 60 * 60 * 1000;
  if (Date.now() - key.dailyResetAt >= oneDayMs) {
    return { ...key, dailyRequests: 0, dailyResetAt: Date.now() };
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

      markFailure: (id) => {
        set((state) => {
          const now = Date.now();
          const keys = state.keys.map((k) => {
            if (k.id !== id) return k;
            const errorTimestamps = [...k.errorTimestamps, now].filter((t) => now - t < FIVE_MINUTES);
            const updated = { ...k, errorCount: k.errorCount + 1, errorTimestamps, lastError: now };
            return { ...updated, status: recomputeStatus(updated) };
          });
          return { keys };
        });
      },

      markSuccess: (id) => {
        set((state) => ({
          keys: state.keys.map((k) =>
            k.id === id
              ? { ...k, errorCount: 0, errorTimestamps: [], status: 'active', lastUsed: Date.now() }
              : k
          ),
        }));
      },

      getNextAvailableKey: () => {
        const { keys } = get();
        const available = keys.filter((k) => k.status !== 'dead');
        if (available.length === 0) return null;
        const key = available[_roundRobinIndex % available.length];
        _roundRobinIndex = (_roundRobinIndex + 1) % available.length;
        return key;
      },

      getHealthStatus: (id) => {
        const key = get().keys.find((k) => k.id === id);
        if (!key) return 'red';
        if (key.status === 'dead') return 'red';
        if (key.status === 'warning') return 'yellow';
        return 'green';
      },

      testKey: async (id) => {
        const key = get().keys.find((k) => k.id === id);
        if (!key) return { success: false, latencyMs: 0, error: 'Key not found' };

        const start = Date.now();
        try {
          const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key.key}`,
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
            get().markSuccess(id);
            get()._incrementRequest(id);
            return { success: true, latencyMs };
          } else {
            const err = await response.json().catch(() => ({}));
            const isRateLimit = response.status === 429;
            get().markFailure(id);
            return {
              success: false,
              latencyMs,
              error: isRateLimit ? 'Rate limited' : (err?.error?.message ?? `HTTP ${response.status}`),
            };
          }
        } catch (e: unknown) {
          const latencyMs = Date.now() - start;
          get().markFailure(id);
          return { success: false, latencyMs, error: e instanceof Error ? e.message : 'Network error' };
        }
      },

      _incrementRequest: (id) => {
        set((state) => ({
          keys: state.keys.map((k) => {
            if (k.id !== id) return k;
            const fresh = resetDailyIfNeeded(k);
            return { ...fresh, requestCount: fresh.requestCount + 1, dailyRequests: fresh.dailyRequests + 1, lastUsed: Date.now() };
          }),
        }));
      },
    }),
    {
      name: 'api-key-storage',
      // Keys stored in localStorage (zustand persist) — IndexedDB sync is additive
    }
  )
);
