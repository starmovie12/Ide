/**
 * App — v6 Phase 5 update
 * - Added /auth/github/callback route for OAuth (§4.6)
 * - Calls requestPersistentStorage() on boot (Bug #B24)
 */

import { useEffect } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import Settings from "@/pages/Settings";
import GitHubCallback from "@/pages/auth/GitHubCallback";
import { useDefaultAgentSeed } from "@/hooks/useDefaultAgentSeed";
import { requestPersistentStorage } from "@/lib/db/dexie";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/settings" component={Settings} />
      {/* Phase 5: GitHub OAuth callback — Bug #B1 COEP headers allow this */}
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
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
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
