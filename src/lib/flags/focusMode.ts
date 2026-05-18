/**
 * Focus Forge Feature Flag — Part 4 §1.3
 *
 * Controls whether the user sees Focus Forge (single-chat) at `/`
 * or the Legacy Studio (Part 2 multi-agent UI).
 *
 * Default = ON (Focus Forge is the new primary experience).
 * Toggle in Settings → Advanced → "Legacy Studio mode".
 *
 * Non-reactive read via localStorage so it can be used at route-mount time
 * before any React tree exists. Setting forces a reload to remount routes
 * cleanly (different component trees, different stores wired up).
 */

const FLAG_KEY = 'focusForgeActive';

/**
 * Read flag synchronously. Safe at route mount time.
 * Defaults to true so first-time users land in Focus Forge.
 */
export function isFocusForgeActive(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const raw = window.localStorage.getItem(FLAG_KEY);
    return raw !== 'false';
  } catch {
    // localStorage can throw in private-browsing edge cases
    return true;
  }
}

/**
 * React hook wrapper. Re-reads on mount — does not subscribe to storage
 * events (a flag flip always reloads, so subscription is wasted work).
 */
export function useFocusForgeFlag(): boolean {
  return isFocusForgeActive();
}

/**
 * Persist new flag value and reload so route components remount with the
 * correct shell. NEVER call this in render; always inside a click handler.
 */
export function setFocusForge(active: boolean): void {
  try {
    window.localStorage.setItem(FLAG_KEY, String(active));
  } catch {
    // Storage full / private mode — silently ignore; toggle is best-effort UX.
  }
  // Hard reload guarantees the route tree remounts with the right home page.
  window.location.reload();
}
