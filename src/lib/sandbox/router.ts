/**
 * Sandbox Router — Phase 5 §4.1
 * Picks the appropriate sandbox mode: WebContainer (desktop) or Cloud-mode (mobile/Firefox).
 * Friction Vector 1: phone has 2GB RAM → WebContainers OOM → cloud-mode fallback.
 */

import type { SandboxMode } from './types';

/**
 * Determines the best sandbox mode for the current browser environment.
 *
 * Decision matrix:
 *   - SharedArrayBuffer unavailable → cloud-mode (browser policy / no COEP)
 *   - Not crossOriginIsolated       → cloud-mode (COEP/COOP headers not set)
 *   - deviceMemory < 4GB            → cloud-mode (mobile RAM risk)
 *   - Otherwise                     → webcontainer
 */
export async function pickSandboxMode(): Promise<SandboxMode> {
  // SAB required by WebContainers API
  if (typeof SharedArrayBuffer === 'undefined') return 'cloud-mode';

  // COEP + COOP must be active
  if (!window.crossOriginIsolated) return 'cloud-mode';

  // Heuristic: mobile devices typically report < 4GB via navigator.deviceMemory
  const mem = (navigator as { deviceMemory?: number }).deviceMemory;
  if (mem !== undefined && mem < 4) return 'cloud-mode';

  // Final check: can we import the WebContainers API?
  try {
    // Dynamic import so bundler tree-shakes on platforms that don't need it
    await import('@webcontainer/api');
    return 'webcontainer';
  } catch {
    return 'cloud-mode';
  }
}

/**
 * Returns a user-facing badge label for the current sandbox mode.
 * Displayed in the chat header.
 */
export function sandboxBadgeLabel(mode: SandboxMode): string {
  switch (mode) {
    case 'webcontainer':
      return '📦 WebContainer';
    case 'cloud-mode':
      return '🌐 Cloud verify';
    case 'skip':
      return '⚠️ Skip verify';
  }
}

/**
 * Tooltip copy for the sandbox mode badge.
 */
export function sandboxBadgeTooltip(mode: SandboxMode): string {
  switch (mode) {
    case 'webcontainer':
      return 'Code runs in a local WebContainer in your browser. Fast, private.';
    case 'cloud-mode':
      return (
        "Your browser doesn't support local sandboxes (mobile / Firefox / missing SAB). " +
        'Verification happens via your GitHub CI / Vercel build instead. Slower but works everywhere.'
      );
    case 'skip':
      return (
        'No CI detected on this repo. Skipping sandbox verification. ' +
        'Please review the PR manually before merging.'
      );
  }
}
