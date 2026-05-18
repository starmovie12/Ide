/**
 * App — Part 4 §1.2 update
 *
 * Adds Focus Forge as the new primary route at "/":
 *   - When useFocusForgeFlag() returns true (default), "/" mounts FocusForge.
 *   - When false (toggled off in Settings → Advanced → "Legacy Studio mode"),
 *     "/" mounts the legacy Home page.
 *   - "/forge" always mounts FocusForge (deep-linkable).
 *   - "/legacy" always mounts the legacy Home (so power users can pin it).
 *
 * No legacy files are deleted — Home.tsx, ChatFooter.tsx, AgentPillBar.tsx,
 * etc. all stay on disk and remain accessible at /legacy. Per Ail's "kuch
 * bhi file delete nahi karenge" rule.
 *
 * Previous behavior preserved:
 *   - GitHub OAuth callback at /auth/github/callback
 *   - requestPersistentStorage() on boot (Bug #B24)
 *   - useDefaultAgentSeed() agent seeding
 */

import { useEffect } from 'react';
import { Switch, Route, Router as WouterRouter } from 'wouter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import Home from '@/pages/Home';
import Settings from '@/pages/Settings';
import GitHubCallback from '@/pages/auth/GitHubCallback';
import FocusForge from '@/pages/FocusForge';
import { useDefaultAgentSeed } from '@/hooks/useDefaultAgentSeed';
import { requestPersistentStorage } from '@/lib/db/dexie';
import { useFocusForgeFlag } from '@/lib/flags/focusMode';

const queryClient = new QueryClient();

function Router() {
  const isFocusMode = useFocusForgeFlag();

  return (
    <Switch>
      {/* "/" is FocusForge by default, Home if user opted out. */}
      <Route path="/" component={isFocusMode ? FocusForge : Home} />

      {/* Always-on routes — let users deep-link to either UI explicitly. */}
      <Route path="/forge" component={FocusForge} />
      <Route path="/legacy" component={Home} />

      <Route path="/settings" component={Settings} />
      <Route path="/auth/github/callback" component={GitHubCallback} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AppBootstrap({ children }: { children: React.ReactNode }) {
  useDefaultAgentSeed();

  /** Bug #B24 — Request persistent IndexedDB storage on first boot to prevent
   *  iOS Safari from evicting user data under storage pressure. */
  useEffect(() => {
    void requestPersistentStorage();
  }, []);

  return <>{children}</>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <AppBootstrap>
            <Router />
          </AppBootstrap>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
