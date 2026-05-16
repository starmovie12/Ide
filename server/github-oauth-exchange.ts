/**
 * Cloudflare Worker — GitHub OAuth Token Exchange
 * Phase 5 §4.6
 *
 * Exchanges a GitHub OAuth code for an access_token.
 * Never exposes GITHUB_CLIENT_SECRET to the browser.
 *
 * Deploy: `wrangler deploy server/github-oauth-exchange.ts`
 * Env vars (in wrangler.toml or CF dashboard):
 *   GITHUB_CLIENT_ID
 *   GITHUB_CLIENT_SECRET
 *   ALLOWED_ORIGINS  (comma-separated list of allowed origins)
 */

export interface Env {
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  /** Comma-separated allowed origins e.g. https://studio.example.com,http://localhost:5173 */
  ALLOWED_ORIGINS: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin') ?? '';
    const allowed = env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      if (!allowed.includes(origin)) {
        return new Response('Forbidden', { status: 403 });
      }
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    // Only allow POST
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    // Origin check
    if (!allowed.includes(origin)) {
      return new Response('Forbidden', { status: 403 });
    }

    // Parse and validate body
    let body: { code?: unknown };
    try {
      body = await request.json<{ code?: unknown }>();
    } catch {
      return new Response(
        JSON.stringify({ error: 'invalid_json' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } }
      );
    }

    const code = body?.code;
    if (typeof code !== 'string' || code.length === 0 || code.length > 200) {
      return new Response(
        JSON.stringify({ error: 'invalid_code' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } }
      );
    }

    // Exchange code for token with GitHub
    let tokenData: { access_token?: string; scope?: string; token_type?: string; error?: string };
    try {
      const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          client_id: env.GITHUB_CLIENT_ID,
          client_secret: env.GITHUB_CLIENT_SECRET,
          code,
        }),
      });
      tokenData = await tokenRes.json<typeof tokenData>();
    } catch (err) {
      return new Response(
        JSON.stringify({ error: 'github_unreachable', detail: String(err) }),
        { status: 502, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } }
      );
    }

    if (!tokenData.access_token || tokenData.error) {
      return new Response(
        JSON.stringify({ error: 'token_exchange_failed', detail: tokenData.error }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } }
      );
    }

    return new Response(
      JSON.stringify({
        token: tokenData.access_token,
        scope: tokenData.scope ?? '',
        token_type: tokenData.token_type ?? 'bearer',
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      }
    );
  },
};

function corsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}
