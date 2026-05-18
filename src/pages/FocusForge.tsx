/**
 * FocusForge Page — Part 4 §1.6
 *
 * The main page component for Focus Forge. Composes:
 *   - ForgeTopBar (top)
 *   - ForgeChatStream (middle)
 *   - ForgeStatusBar (small bar above composer, shown only when active op)
 *   - ForgeComposer (bottom)
 *
 * For Phase 5.10.A delivery the page is FUNCTIONAL but NOT wired to a real
 * orchestrator. The Send button dispatches a turn into chatStore (the same
 * one Legacy Studio uses) so the user can see their message appear and the
 * shell renders correctly. Phase 5.10.H will replace the `dispatchTurn`
 * helper here with the Continuum + Duo Mind orchestrator adapter.
 *
 * What is intentionally NOT here for Phase 5.10.A:
 *   - FileTheater side panel (Part 3 §8 — depends on Continuum artifact store)
 *   - Push-to-GitHub button (Phase 5.10.I)
 *   - PWA install banner (Phase 5.10.J)
 * These mount-points are left as comments so reviewer + future Claude can
 * see exactly where they slot in.
 */

import { useLocation } from 'wouter';
import { useCallback } from 'react';
import { ForgeTopBar } from '@/components/forge/ForgeTopBar';
import { ForgeChatStream } from '@/components/forge/ForgeChatStream';
import { ForgeComposer, type ForgeSendRequest } from '@/components/forge/ForgeComposer';
import { ForgeStatusBar } from '@/components/forge/ForgeStatusBar';
import { useChatStore } from '@/lib/store/chatStore';

export default function FocusForge() {
  const [, navigate] = useLocation();

  const activeChatId = useChatStore((s) => s.activeChatId);
  const createChat = useChatStore((s) => s.createChat);
  const addMessage = useChatStore((s) => s.addMessage);

  /**
   * Phase 5.10.A stub: just record the user's turn into chatStore so the
   * shell loop works end-to-end. Replace with `orchestratorAdapter.dispatch()`
   * in Phase 5.10.H once Continuum + Duo Mind are wired.
   */
  const dispatchTurn = useCallback(
    (req: ForgeSendRequest) => {
      let chatId = activeChatId;
      if (!chatId) {
        chatId = createChat('Forge — ' + req.prompt.slice(0, 40));
      }
      addMessage(chatId, {
        role: 'user',
        content: req.prompt,
      });

      // Placeholder Ustaad response so the user gets visual feedback that
      // their turn registered. This entire block disappears when the real
      // orchestrator lands.
      addMessage(chatId, {
        role: 'agent',
        agentId: 'ustaad',
        agentName: 'Ustaad',
        agentEmoji: '🪶',
        agentColorIndex: 0,
        content:
          'Focus Forge shell ready. The Continuum + Duo Mind orchestrator wires up in Phase 5.10.H — at that point this placeholder is replaced with the real streaming Ustaad response.',
      });
    },
    [activeChatId, addMessage, createChat],
  );

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-base)',
        color: 'var(--text-primary)',
        fontFamily: 'var(--font-body, "Inter", -apple-system, sans-serif)',
      }}
    >
      <ForgeTopBar
        onOpenSettings={() => navigate('/settings')}
        // RepoPicker and Sidebar handlers wire up in Phase 5.10.E and 5.10.B+1.
        // Until then, the chips remain visible but tapping them is a no-op —
        // we don't open ad-hoc UIs that we can't yet support.
        onOpenRepoPicker={() => {
          // Phase 5.10.E will open a proper repo picker sheet. For now,
          // direct the user to the legacy GitHub UI in Settings.
          navigate('/settings');
        }}
        onOpenSidebar={() => {
          // Phase 5.10.B+ will add a chat-list drawer. For now, no-op.
        }}
      />

      <main
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          // Inline keyframes for the streaming pulse used in ForgeChatStream.
          // Kept in a <style> tag in main rather than in index.css to keep this
          // Phase delivery self-contained — index.css edits are out of scope.
        }}
      >
        <style>{`
          @keyframes forge-pulse {
            0% { opacity: 0.35; transform: scale(1); }
            50% { opacity: 1; transform: scale(1.25); }
            100% { opacity: 0.35; transform: scale(1); }
          }
          @media (prefers-reduced-motion: reduce) {
            @keyframes forge-pulse {
              0%, 100% { opacity: 1; transform: scale(1); }
            }
          }
        `}</style>

        <ForgeChatStream />

        {/* FileTheater side panel mounts here in Phase 5.10.H (Part 3 §8). */}
      </main>

      {/* ForgeStatusBar is intentionally invisible when no op is active.
         When Phase 5.10.G lands, the orchestrator will surface progress
         here. */}
      <ForgeStatusBar />

      <ForgeComposer onSend={dispatchTurn} />
    </div>
  );
}
