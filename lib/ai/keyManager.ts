/**
 * KeyManager — multi-key rotation + failover
 * v6 updates:
 *   Bug #B16 — reserveCount pre-emptive lock prevents two concurrent calls
 *              grabbing the same key simultaneously
 *   Bug #B31 — quota-exhausted keys are cooled down separately from dead keys
 */

export type KeyStatus = 'active' | 'warning' | 'dead' | 'quota-exhausted';
export type HealthColor = 'green' | 'yellow' | 'red' | 'orange';

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
  /** Bug #B16 — in-flight count; incremented before awaiting, decremented after */
  reserveCount: number;
  /** When quota-exhausted, this is estimated reset time (midnight PT) */
  cooldownUntil: number | null;
}

const FIVE_MINUTES = 5 * 60 * 1000;
/** Quota reset: Gemini resets at midnight US/Pacific — we estimate 24h from exhaustion */
const QUOTA_RESET_ESTIMATE_MS = 24 * 60 * 60 * 1000;
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
    reserveCount: 0,      // Bug #B16
    cooldownUntil: null,
  }));
  currentIndex = 0;
}

/**
 * Get the next available key (round-robin, skips dead / quota-exhausted / cooling keys).
 * Bug #B16: increments reserveCount BEFORE returning so a concurrent caller won't pick
 * the same key if it is already at its RPM concurrency limit.
 */
export function getNextKey(): ManagedKey | null {
  if (keys.length === 0) return null;

  const now = Date.now();
  const available = keys.filter(
    (k) =>
      k.status !== 'dead' &&
      k.status !== 'quota-exhausted' &&
      (k.cooldownUntil === null || now > k.cooldownUntil)
  );

  if (available.length === 0) return null;

  const key = available[currentIndex % available.length];
  currentIndex = (currentIndex + 1) % available.length;

  // Bug #B16 — pre-emptive reserve so concurrent callers see it as "in-use"
  key.reserveCount += 1;
  key.requestCount += 1;
  key.lastUsed = now;
  return key;
}

/** Release the in-flight reserve after a call completes (success or error) */
export function releaseKey(id: string): void {
  const key = keys.find((k) => k.id === id);
  if (!key) return;
  key.reserveCount = Math.max(0, key.reserveCount - 1);
}

/** Mark a key as having errored */
export function markFailure(id: string, isQuotaExhausted = false): void {
  const key = keys.find((k) => k.id === id);
  if (!key) return;

  releaseKey(id);

  const now = Date.now();
  key.lastError = now;
  key.errorCount += 1;

  if (isQuotaExhausted) {
    // Quota-exhausted: cool down until estimated reset (midnight PT ~ 24h from now)
    key.status = 'quota-exhausted';
    key.cooldownUntil = now + QUOTA_RESET_ESTIMATE_MS;
    return;
  }

  key.errorTimestamps = [...key.errorTimestamps, now].filter((t) => now - t < FIVE_MINUTES);
  key.status = computeStatus(key);
}

/** Mark a key as healthy */
export function markSuccess(id: string): void {
  const key = keys.find((k) => k.id === id);
  if (!key) return;
  releaseKey(id);
  key.errorCount = 0;
  key.errorTimestamps = [];
  key.status = 'active';
  key.cooldownUntil = null;
  key.lastUsed = Date.now();
}

export function getHealthStatus(id: string): HealthColor {
  const key = keys.find((k) => k.id === id);
  if (!key) return 'red';
  if (key.status === 'dead') return 'red';
  if (key.status === 'quota-exhausted') return 'orange';
  if (key.status === 'warning') return 'yellow';
  return 'green';
}

/**
 * How many RPD remain across all active keys (rough UI estimate).
 * Returns null if no keys have usage data.
 */
export function totalFlashRpdRemaining(): number {
  return keys
    .filter((k) => k.status === 'active' || k.status === 'warning')
    .reduce((sum, k) => sum + Math.max(0, 1500 - k.requestCount), 0);
}

/** Send a minimal real request to verify a key works */
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
    if (response.ok) return { success: true, latencyMs };

    const err = await response.json().catch(() => ({}));
    const errMsg = (err as { error?: { message?: string } })?.error?.message ?? '';
    const isQuota =
      response.status === 429 &&
      (errMsg.toLowerCase().includes('quota') || errMsg.toLowerCase().includes('exhausted'));

    return {
      success: false,
      latencyMs,
      error: isQuota
        ? 'Quota exhausted (resets midnight PT)'
        : errMsg || `HTTP ${response.status}`,
    };
  } catch (e: unknown) {
    return {
      success: false,
      latencyMs: Date.now() - start,
      error: e instanceof Error ? e.message : 'Network error',
    };
  }
}

// Backward-compat aliases
export const reportKeyError = markFailure;
export const reportKeySuccess = markSuccess;

export function getKeyStatuses(): Array<{
  id: string;
  status: KeyStatus;
  requestCount: number;
  reserveCount: number;
  cooldownUntil: number | null;
}> {
  return keys.map((k) => ({
    id: k.id,
    status: k.status,
    requestCount: k.requestCount,
    reserveCount: k.reserveCount,
    cooldownUntil: k.cooldownUntil,
  }));
}

export function activeKeyCount(): number {
  const now = Date.now();
  return keys.filter(
    (k) =>
      k.status !== 'dead' &&
      k.status !== 'quota-exhausted' &&
      (k.cooldownUntil === null || now > k.cooldownUntil)
  ).length;
}

function computeStatus(key: ManagedKey): KeyStatus {
  const now = Date.now();
  const recent = key.errorTimestamps.filter((t) => now - t < FIVE_MINUTES).length;
  if (recent >= DEAD_THRESHOLD) return 'dead';
  if (recent >= WARNING_THRESHOLD) return 'warning';
  return 'active';
}
