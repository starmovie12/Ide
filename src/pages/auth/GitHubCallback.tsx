/**
 * GitHub OAuth Callback Page — Phase 5 §4.6
 * Receives the OAuth code from GitHub, exchanges it for a token via the
 * Cloudflare Worker, stores the token, then redirects back to the app.
 */

import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { useBlueprintStore } from '@/lib/store/blueprintStore';
import { fetchGitHubUser } from '@/lib/github/oauth';

type CallbackStatus =
  | { phase: 'exchanging' }
  | { phase: 'success'; login: string }
  | { phase: 'error'; message: string };

export default function GitHubCallback() {
  const [, navigate] = useLocation();
  const [status, setStatus] = useState<CallbackStatus>({ phase: 'exchanging' });
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const params = new URLSearchParams(window.location.search);
    const code  = params.get('code');
    const state = params.get('state');
    const error = params.get('error');

    if (error) {
      setStatus({ phase: 'error', message: `GitHub denied access: ${error}` });
      return;
    }

    if (!code) {
      setStatus({ phase: 'error', message: 'No OAuth code received from GitHub.' });
      return;
    }

    const exchangeUrl = import.meta.env.VITE_OAUTH_EXCHANGE_URL as string | undefined;

    if (!exchangeUrl) {
      setStatus({
        phase: 'error',
        message: 'VITE_OAUTH_EXCHANGE_URL is not configured. Set it in your .env file.',
      });
      return;
    }

    void (async () => {
      try {
        const res = await fetch(exchangeUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, state }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error((body as { error?: string }).error ?? `Exchange failed (${res.status})`);
        }

        const data = (await res.json()) as { token: string; scope: string };
        const token = data.token;

        // Fetch GitHub user info
        const user = await fetchGitHubUser(token);

        // Persist to blueprint store (token + user)
        const { setGitHubToken } = useBlueprintStore.getState();
        setGitHubToken(token, user);

        setStatus({ phase: 'success', login: user.login });

        // Redirect back to home after a short pause
        setTimeout(() => navigate('/'), 1200);
      } catch (err) {
        setStatus({
          phase: 'error',
          message: err instanceof Error ? err.message : 'Unknown error during OAuth exchange.',
        });
      }
    })();
  }, [navigate]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100dvh',
        background: 'var(--bg-base)',
        color: 'var(--text-primary)',
        gap: '16px',
        fontFamily: 'var(--font-body, system-ui)',
      }}
    >
      {status.phase === 'exchanging' && (
        <>
          <div
            aria-label="Connecting to GitHub"
            style={{
              width: 40,
              height: 40,
              border: '3px solid var(--border-default)',
              borderTopColor: 'var(--color-primary)',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }}
          />
          <p style={{ color: 'var(--text-secondary)', fontSize: 15 }}>
            Connecting to GitHub…
          </p>
        </>
      )}

      {status.phase === 'success' && (
        <>
          <span style={{ fontSize: 36 }}>✅</span>
          <p style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 16 }}>
            Connected as @{status.login}
          </p>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Redirecting…</p>
        </>
      )}

      {status.phase === 'error' && (
        <>
          <span style={{ fontSize: 36 }}>❌</span>
          <p style={{ color: 'var(--color-destructive)', fontWeight: 600, fontSize: 15, maxWidth: 400, textAlign: 'center' }}>
            {status.message}
          </p>
          <button
            onClick={() => navigate('/')}
            style={{
              marginTop: 8,
              padding: '8px 20px',
              background: 'var(--color-primary)',
              color: 'var(--text-on-primary)',
              border: 'none',
              borderRadius: 'var(--radius-base)',
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            Back to Studio
          </button>
        </>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
