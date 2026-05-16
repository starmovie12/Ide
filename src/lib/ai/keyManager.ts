/**
 * KeyManager — multi-key rotation + failover class
 * Phase 2: Full implementation with testKey, health windows, round-robin
 */

export type KeyStatus = 'active' | 'warning' | 'dead';
export type HealthColor = 'green' | 'yellow' | 'red';

export interface ManagedKey {
  id: string;
  key: string;
  label: string;
  status: KeyStatus;
  requestCount: number;
  errorCount: number;
  errorTimestamps: number[];
  lastUsed: number | null;
  lastError: number | null;
}

const FIVE_MINUTES = 5 * 60 * 1000;
const DEAD_THRESHOLD = 3;
const WARNING_THRESHOLD = 1;

let keys: ManagedKey[] = [];
let currentIndex = 0;

export function loadKeys(
  rawKeys: Array<{ id: string; key: string; label: string; status: KeyStatus }>
): void {
  keys = rawKeys.map((k) => ({
    ...k,
    requestCount: 0,
    errorCount: 0,
    errorTimestamps: [],
    lastUsed: null,
    lastError: null,
  }));
  currentIndex = 0;
}

/** Get the next available key (round-robin, skips dead keys) */
export function getNextKey(): ManagedKey | null {
  if (keys.length === 0) return null;
  const available = keys.filter((k) => k.status !== 'dead');
  if (available.length === 0) return null;
  const key = available[currentIndex % available.length];
  currentIndex = (currentIndex + 1) % available.length;
  key.requestCount += 1;
  key.lastUsed = Date.now();
  return key;
}

/** Mark a key as having errored. Optional second arg (isRateLimited) accepted for compat but unused. */
export function markFailure(id: string, _isRateLimited?: boolean): void {
  const key = keys.find((k) => k.id === id);
  if (!key) return;
  const now = Date.now();
  key.errorTimestamps = [...key.errorTimestamps, now].filter((t) => now - t < FIVE_MINUTES);
  key.errorCount += 1;
  key.lastError = now;
  key.status = computeStatus(key);
}

/** Mark a key as healthy again */
export function markSuccess(id: string): void {
  const key = keys.find((k) => k.id === id);
  if (!key) return;
  key.errorCount = 0;
  key.errorTimestamps = [];
  key.status = 'active';
  key.lastUsed = Date.now();
}

/** Get color-coded health for UI */
export function getHealthStatus(id: string): HealthColor {
  const key = keys.find((k) => k.id === id);
  if (!key) return 'red';
  if (key.status === 'dead') return 'red';
  if (key.status === 'warning') return 'yellow';
  return 'green';
}

/**
 * Send a minimal real request to Gemini to verify a key works.
 * Uses 1-token output to minimise cost.
 */
export async function testKey(
  key: string
): Promise<{ success: boolean; latencyMs: number; error?: string }> {
  const start = Date.now();
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
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
      return { success: true, latencyMs };
    }
    const err = await response.json().catch(() => ({}));
    const isRateLimit = response.status === 429;
    return {
      success: false,
      latencyMs,
      error: isRateLimit
        ? 'Rate limited (429)'
        : ((err as { error?: { message?: string } })?.error?.message ?? `HTTP ${response.status}`),
    };
  } catch (e: unknown) {
    return {
      success: false,
      latencyMs: Date.now() - start,
      error: e instanceof Error ? e.message : 'Network error',
    };
  }
}

// ── Backward-compat aliases used by streaming.ts ──
export const reportKeyError = markFailure;
export const reportKeySuccess = markSuccess;

/** Get current state snapshot (for UI update) */
export function getKeyStatuses(): Array<{ id: string; status: KeyStatus; requestCount: number }> {
  return keys.map((k) => ({ id: k.id, status: k.status, requestCount: k.requestCount }));
}

/** How many active keys remain */
export function activeKeyCount(): number {
  return keys.filter((k) => k.status !== 'dead').length;
}

// ── Internal helpers ──

function computeStatus(key: ManagedKey): KeyStatus {
  const now = Date.now();
  const recent = key.errorTimestamps.filter((t) => now - t < FIVE_MINUTES).length;
  if (recent >= DEAD_THRESHOLD) return 'dead';
  if (recent >= WARNING_THRESHOLD) return 'warning';
  return 'active';
}
