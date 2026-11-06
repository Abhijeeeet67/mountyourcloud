import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  createSessionToken,
  encryptToken,
  generatePkcePair,
  generateSignedOAuthState,
  verifyAndUnpackOAuthState,
  verifyRazorpaySignature,
  verifyRazorpaySubscriptionSignature,
  verifyRazorpayWebhookSignature,
  verifySessionToken,
} from './crypto.ts';
import {
  OAUTH_PROVIDERS,
  getOAuthProvider,
  resolveProviderClientId,
  resolveProviderClientSecret,
} from './providers.ts';
import { getSupabaseAdminClient, serverAccountStore } from './store.ts';

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string, limit = 180, windowMs = 60_000): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }
  entry.count += 1;
  return entry.count <= limit;
}

function getAppBaseUrl(req: IncomingMessage): string {
  const forwardedHost = req.headers['x-forwarded-host'];
  const hostHeader =
    (Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost) || req.headers.host || '';
  if (hostHeader && hostHeader.includes('.run.app')) {
    return `https://${hostHeader.split(',')[0].trim()}`;
  }
  if (process.env.APP_URL?.trim()) {
    return process.env.APP_URL.trim().replace(/\/$/, '');
  }
  const host = hostHeader || 'localhost:3000';
  const proto = req.headers['x-forwarded-proto'] || (host.includes('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

function parseCookies(cookieHeader?: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const pair of cookieHeader.split(';')) {
    const idx = pair.indexOf('=');
    if (idx > 0) {
      const k = pair.slice(0, idx).trim();
      const v = pair.slice(idx + 1).trim();
      out[k] = decodeURIComponent(v);
    }
  }
  return out;
}

export interface AuthenticatedRequestUser {
  userId: string;
  email: string;
  displayName: string;
  isAdmin: boolean;
}

export function isConfiguredAdminUser(user: { userId: string; email: string }): boolean {
  const adminEnv = process.env.MOUNTYOURCLOUDS_ADMIN_USER_ID?.trim();
  if (!adminEnv) return false;
  const candidates = adminEnv
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return (
    candidates.includes(user.userId.toLowerCase()) ||
    candidates.includes(user.email.toLowerCase())
  );
}

/**
 * Synchronous token check used for signed session JWTs and cookies.
 * Never trusts x-user-id or unverified headers.
 */
export function authenticateRequest(req: IncomingMessage): AuthenticatedRequestUser | null {
  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    const verified = verifySessionToken(token);
    if (verified) {
      return {
        ...verified,
        isAdmin: isConfiguredAdminUser(verified),
      };
    }
  }

  const cookies = parseCookies(req.headers.cookie);
  if (cookies.myc_session) {
    const verified = verifySessionToken(cookies.myc_session);
    if (verified) {
      return {
        ...verified,
        isAdmin: isConfiguredAdminUser(verified),
      };
    }
  }

  return null;
}

/**
 * Asynchronous authentication supporting both signed backend session tokens
 * and live Supabase Auth JWTs verified via Supabase Admin client.
 */
export async function authenticateRequestAsync(
  req: IncomingMessage
): Promise<AuthenticatedRequestUser | null> {
  const syncUser = authenticateRequest(req);
  if (syncUser) return syncUser;

  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    const sb = getSupabaseAdminClient();
    if (sb && token.split('.').length === 3) {
      try {
        const { data, error } = await sb.auth.getUser(token);
        if (!error && data.user) {
          const u = data.user;
          const email = (u.email || 'user@mountyourclouds.com').toLowerCase();
          const displayName =
            u.user_metadata?.full_name ||
            u.user_metadata?.name ||
            email.split('@')[0];

          let isAdmin = isConfiguredAdminUser({ userId: u.id, email });
          if (!isAdmin) {
            const { data: adminRow } = await sb
              .from('admin_users')
              .select('role')
              .eq('user_id', u.id)
              .maybeSingle();
            if (adminRow) isAdmin = true;
          }

          await serverAccountStore.upsertUserProfile({
            id: u.id,
            email,
            displayName,
            provider: u.app_metadata?.provider || 'email',
            emailVerified: Boolean(u.email_confirmed_at),
          });

          return {
            userId: u.id,
            email,
            displayName,
            isAdmin,
          };
        }
      } catch {
        // Invalid Supabase token
      }
    }
  }

  return null;
}

function setSecurityAndCorsHeaders(req: IncomingMessage, res: ServerResponse): void {
  const origin = req.headers.origin;
  const appUrl = getAppBaseUrl(req);
  const allowedOrigin =
    origin && (origin === appUrl || origin.startsWith('http://localhost:')) ? origin : appUrl;

  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-razorpay-signature');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
}

function sendJson(req: IncomingMessage, res: ServerResponse, statusCode: number, data: unknown): void {
  res.statusCode = statusCode;
  setSecurityAndCorsHeaders(req, res);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}

function sendHtml(req: IncomingMessage, res: ServerResponse, html: string): void {
  res.statusCode = 200;
  setSecurityAndCorsHeaders(req, res);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(html);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function readRawBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error('Request body too large.'));
      }
    });
    req.on('end', () => resolve(raw));
    req.on('error', reject);
  });
}

async function readJsonBody<T = Record<string, any>>(req: IncomingMessage): Promise<T> {
  const raw = await readRawBody(req);
  if (!raw.trim()) return {} as T;
  return JSON.parse(raw) as T;
}

const PLAN_PRICING_INR: Record<'free' | 'pro' | 'ultra', { monthly: number; annual: number; name: string }> = {
  free: { monthly: 0, annual: 0, name: 'FREE' },
  pro: { monthly: 199, annual: Math.round(199 * 12 * 0.8), name: 'PRO' },
  ultra: { monthly: 499, annual: Math.round(499 * 12 * 0.8), name: 'ULTRA' },
};

export async function handleOAuthRequest(
  req: IncomingMessage,
  res: ServerResponse,
  urlPath: string
): Promise<boolean> {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    setSecurityAndCorsHeaders(req, res);
    res.end();
    return true;
  }

  const clientIp =
    (typeof req.headers['x-forwarded-for'] === 'string'
      ? req.headers['x-forwarded-for'].split(',')[0]
      : req.socket?.remoteAddress) || 'local';

  if (!checkRateLimit(clientIp)) {
    sendJson(req, res, 429, { error: 'Too many requests. Please try again in a minute.' });
    return true;
  }

  const parsedUrl = new URL(req.url || '/', 'http://localhost');
  const pathname = (urlPath || parsedUrl.pathname).split('?')[0];

  // =========================================================================
  // 0. HEALTH & READINESS ENDPOINT (/api/health)
  // =========================================================================
  if (pathname === '/api/health' && req.method === 'GET') {
    const rzp = await serverAccountStore.getMaskedRazorpayGatewayStatus();
    const providersReady = Object.values(OAUTH_PROVIDERS)
      .filter((p) => Boolean(resolveProviderClientId(p)))
      .map((p) => p.id);

    sendJson(req, res, 200, {
      ok: true,
      service: 'MountYourClouds Production API',
      timestamp: Date.now(),
      supabaseConfigured: Boolean(
        (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL) &&
          (process.env.SUPABASE_SECRET_KEY ||
            process.env.SUPABASE_SERVICE_ROLE_KEY ||
            process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
            process.env.VITE_SUPABASE_ANON_KEY)
      ),
      adminConfigured: Boolean(process.env.MOUNTYOURCLOUDS_ADMIN_USER_ID?.trim()),
      razorpay: {
        enabled: rzp.enabled,
        activeMode: rzp.activeMode,
        activeKeyId: rzp.activeKeyId,
        testConfigured: rzp.test.configured,
        liveConfigured: rzp.live.configured,
      },
      oauthProvidersReady: providersReady,
    });
    return true;
  }

  // =========================================================================
  // 1. AUTHENTICATION & SESSION ENDPOINTS (/api/auth/*)
  // =========================================================================
  if (pathname === '/api/auth/session' && req.method === 'POST') {
    try {
      const body = await readJsonBody<{
        userId?: string;
        email?: string;
        displayName?: string;
        provider?: string;
      }>(req);
      const email = (body.email || '').trim().toLowerCase();
      const displayName = (body.displayName || email.split('@')[0] || 'User').trim();
      const userId = (body.userId || email).trim();

      if (!email || !email.includes('@')) {
        sendJson(req, res, 400, { error: 'Valid email is required to establish a session.' });
        return true;
      }

      await serverAccountStore.upsertUserProfile({
        id: userId,
        email,
        displayName,
        provider: body.provider || 'email',
        emailVerified: true,
      });

      const token = createSessionToken({ userId, email, displayName });
      const isSecure = getAppBaseUrl(req).startsWith('https://');
      res.setHeader(
        'Set-Cookie',
        `myc_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=${
          isSecure ? 'None; Secure' : 'Lax'
        }; Max-Age=604800`
      );

      const isAdmin = isConfiguredAdminUser({ userId, email });
      sendJson(req, res, 200, {
        ok: true,
        token,
        user: { userId, email, displayName, isAdmin },
      });
      return true;
    } catch {
      sendJson(req, res, 400, { error: 'Invalid session request payload.' });
      return true;
    }
  }

  if (pathname === '/api/auth/logout' && req.method === 'POST') {
    res.setHeader('Set-Cookie', 'myc_session=; Path=/; HttpOnly; Max-Age=0');
    sendJson(req, res, 200, { ok: true });
    return true;
  }

  if (pathname === '/api/auth/me' && req.method === 'GET') {
    const user = await authenticateRequestAsync(req);
    if (!user) {
      sendJson(req, res, 401, { error: 'Not authenticated.' });
      return true;
    }
    sendJson(req, res, 200, { user });
    return true;
  }

  if (pathname === '/api/auth/account' && req.method === 'DELETE') {
    const user = await authenticateRequestAsync(req);
    if (!user) {
      sendJson(req, res, 401, { error: 'Authentication required to delete account.' });
      return true;
    }

    const accounts = await serverAccountStore.listAccounts(user.userId);
    for (const acc of accounts) {
      await serverAccountStore.deleteAccount(user.userId, acc.id).catch(() => {});
    }
    await serverAccountStore.updateUserStatus(user.userId, 'deleted');
    await serverAccountStore.appendAuditLog({
      actorUserId: user.userId,
      actorEmail: user.email,
      action: 'account.deleted',
      targetType: 'user',
      targetId: user.userId,
    });

    res.setHeader('Set-Cookie', 'myc_session=; Path=/; HttpOnly; Max-Age=0');
    sendJson(req, res, 200, { ok: true, deletedUserId: user.userId });
    return true;
  }

  // =========================================================================
  // 2. OAUTH PROVIDER & ACCOUNT ENDPOINTS (/api/oauth/*)
  // =========================================================================

  if (pathname === '/api/oauth/providers' && req.method === 'GET') {
    const appBaseUrl = getAppBaseUrl(req);
    const redirectUri = `${appBaseUrl}/api/oauth/callback`;
    const providers = Object.values(OAUTH_PROVIDERS).map((p) => {
      const clientId = resolveProviderClientId(p);
      const clientSecret = resolveProviderClientSecret(p);
      const hasClientId = Boolean(clientId);
      const hasClientSecret = Boolean(clientSecret);
      return {
        id: p.id,
        name: p.name,
        configured: hasClientId && (hasClientSecret || p.usePkce),
        hasClientId,
        hasClientSecret,
        clientIdEnv: p.clientIdEnv,
        clientSecretEnv: p.clientSecretEnv,
        redirectUri,
        scopes: p.defaultScopes,
      };
    });
    sendJson(req, res, 200, { providers, redirectUri });
    return true;
  }

  // GET /api/oauth/:provider/authorize
  const authorizeMatch = pathname.match(/^\/api\/oauth\/([a-zA-Z0-9_-]+)\/authorize$/);
  if (authorizeMatch && req.method === 'GET') {
    const isSocialLoginFlow = parsedUrl.searchParams.get('mode') === 'login';
    const user = await authenticateRequestAsync(req);
    if (!user && !isSocialLoginFlow) {
      sendJson(req, res, 401, {
        error: 'Authentication required. Please sign in before connecting a cloud account.',
        code: 'UNAUTHENTICATED',
      });
      return true;
    }

    const providerId = authorizeMatch[1];
    const provider = getOAuthProvider(providerId);

    if (!provider) {
      sendJson(req, res, 404, { error: `Unsupported OAuth provider: ${providerId}` });
      return true;
    }

    const clientId = resolveProviderClientId(provider);
    if (!clientId) {
      sendJson(req, res, 400, {
        error: `${provider.name} OAuth is not configured on the server (${provider.clientIdAliases.join(' or ')} missing).`,
        code: 'MISSING_CREDENTIALS',
      });
      return true;
    }

    const appBaseUrl = getAppBaseUrl(req);
    const redirectUri = `${appBaseUrl}/api/oauth/callback`;

    let codeChallenge: string | undefined = undefined;
    let codeVerifier: string | undefined = undefined;

    if (provider.usePkce) {
      const pkce = generatePkcePair();
      codeVerifier = pkce.verifier;
      codeChallenge = pkce.challenge;
    }

    const effectiveUserId = user?.userId || `oauth_login_${Date.now()}`;
    const state = generateSignedOAuthState({
      userId: effectiveUserId,
      provider: provider.id,
      codeVerifier,
    });

    // Extract nonce from state payload for server-side one-time transaction record
    try {
      const payloadPart = state.split('.')[0];
      const decoded = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8'));
      if (decoded.n) {
        await serverAccountStore.saveOAuthStateTransaction({
          nonce: decoded.n,
          userId: effectiveUserId,
          provider: provider.id,
          encryptedCodeVerifier: codeVerifier ? encryptToken(codeVerifier) : undefined,
          expiresAt: Date.now() + 10 * 60 * 1000,
          consumedAt: null,
          createdAt: Date.now(),
        });
      }
    } catch {
      // Non-fatal
    }

    const authUrl = new URL(provider.authUrl);
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('state', state);

    if (provider.defaultScopes.length > 0) {
      authUrl.searchParams.set('scope', provider.defaultScopes.join(' '));
    }

    if (codeChallenge) {
      authUrl.searchParams.set('code_challenge', codeChallenge);
      authUrl.searchParams.set('code_challenge_method', 'S256');
    }

    if (provider.extraAuthParams) {
      for (const [k, v] of Object.entries(provider.extraAuthParams)) {
        authUrl.searchParams.set(k, v);
      }
    }

    sendJson(req, res, 200, {
      url: authUrl.toString(),
      state,
      provider: provider.id,
      name: provider.name,
      redirectUri,
    });
    return true;
  }

  // GET /api/oauth/callback (and /api/oauth/callback/)
  if (
    (pathname === '/api/oauth/callback' || pathname === '/api/oauth/callback/') &&
    req.method === 'GET'
  ) {
    const code = parsedUrl.searchParams.get('code');
    const state = parsedUrl.searchParams.get('state');
    const errorParam = parsedUrl.searchParams.get('error');
    const errorDesc = parsedUrl.searchParams.get('error_description') || errorParam;
    const appBaseUrl = getAppBaseUrl(req);

    if (errorParam) {
      const safeErr = escapeHtml(String(errorDesc || 'Authorization declined'));
      sendHtml(
        req,
        res,
        `<html><body><script>
          if (window.opener) {
            window.opener.postMessage({ type: 'MOUNTYOURCLOUDS_OAUTH_ERROR', error: ${JSON.stringify(
              safeErr
            )} }, '*');
            window.close();
          } else {
            window.location.href = '/#/app/providers';
          }
        </script><p>Authorization error: ${safeErr}</p></body></html>`
      );
      return true;
    }

    if (!code || !state) {
      sendJson(req, res, 400, { error: 'Missing code or state in OAuth callback.' });
      return true;
    }

    try {
      const stateData = verifyAndUnpackOAuthState(state);
      await serverAccountStore.consumeOAuthStateTransaction(stateData.nonce, stateData.provider);

      const provider = getOAuthProvider(stateData.provider);
      if (!provider) {
        throw new Error(`Unknown provider in state: ${stateData.provider}`);
      }

      const clientId = resolveProviderClientId(provider);
      const clientSecret = resolveProviderClientSecret(provider);

      if (!clientId) {
        throw new Error(`Missing ${provider.clientIdEnv} on server.`);
      }

      const redirectUri = `${appBaseUrl}/api/oauth/callback`;

      const tokenBody: Record<string, string> = {
        grant_type: 'authorization_code',
        code,
        client_id: clientId,
        redirect_uri: redirectUri,
      };

      if (clientSecret) {
        tokenBody.client_secret = clientSecret;
      }

      if (stateData.codeVerifier) {
        tokenBody.code_verifier = stateData.codeVerifier;
      }

      const tokenHeaders: Record<string, string> = {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      };

      if (provider.id === 'dropbox' && clientSecret) {
        tokenHeaders['Authorization'] = `Basic ${Buffer.from(
          `${clientId}:${clientSecret}`
        ).toString('base64')}`;
      }

      const tokenRes = await fetch(provider.tokenUrl, {
        method: 'POST',
        headers: tokenHeaders,
        body: new URLSearchParams(tokenBody),
      });

      if (!tokenRes.ok) {
        const errBody = await tokenRes.text();
        throw new Error(`Token exchange failed (${tokenRes.status}): ${errBody}`);
      }

      const tokenData = await tokenRes.json();
      const accessToken = tokenData.access_token;
      const refreshToken = tokenData.refresh_token;
      const expiresInSec = Number(tokenData.expires_in) || 3600;
      const tokenExpiresAt = Date.now() + expiresInSec * 1000;
      const grantedScopes =
        typeof tokenData.scope === 'string'
          ? tokenData.scope.split(/[\s,]+/)
          : provider.defaultScopes;

      const userinfoRes = await fetch(provider.userinfoUrl, {
        method: provider.id === 'dropbox' ? 'POST' : 'GET',
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      let profile: { id: string; email?: string; displayName: string; avatarUrl?: string } = {
        id: `${provider.id}_${Date.now()}`,
        email: '',
        displayName: `${provider.name} Account`,
      };
      if (userinfoRes.ok) {
        const udata = await userinfoRes.json();
        profile = provider.extractProfile(udata);
      }

      const resolvedUserId = stateData.userId.startsWith('oauth_login_')
        ? (profile.email || `${provider.id}_${profile.id}`).toLowerCase()
        : stateData.userId;

      const accountId = `${provider.id}_${profile.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

      if (stateData.userId.startsWith('oauth_login_')) {
        await serverAccountStore.upsertUserProfile({
          id: resolvedUserId,
          email: (profile.email || `${resolvedUserId}@mountyourclouds.com`).toLowerCase(),
          displayName: profile.displayName,
          provider: provider.id,
          emailVerified: true,
        });
      }

      await serverAccountStore.saveAccountAndTokens(
        {
          id: accountId,
          userId: resolvedUserId,
          provider: provider.id,
          email: profile.email,
          displayName: profile.displayName,
          avatarUrl: profile.avatarUrl,
          status: 'active',
          scopes: grantedScopes,
          tokenExpiresAt,
          lastSyncedAt: Date.now(),
          errorMessage: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          accessToken,
          refreshToken,
          tokenExpiresAt,
          scopes: grantedScopes,
        }
      );

      await serverAccountStore.appendAuditLog({
        actorUserId: resolvedUserId,
        actorEmail: profile.email || resolvedUserId,
        action: 'cloud_account.connected',
        targetType: 'connected_cloud_account',
        targetId: accountId,
        metadata: { provider: provider.id, email: profile.email },
      });

      const sessionToken = createSessionToken({
        userId: resolvedUserId,
        email: (profile.email || `${resolvedUserId}@mountyourclouds.com`).toLowerCase(),
        displayName: profile.displayName,
      });

      const isSecure = appBaseUrl.startsWith('https://');
      res.setHeader(
        'Set-Cookie',
        `myc_session=${encodeURIComponent(sessionToken)}; Path=/; HttpOnly; SameSite=${
          isSecure ? 'None; Secure' : 'Lax'
        }; Max-Age=604800`
      );

      const safeProviderName = escapeHtml(provider.name);
      const safeDisplayName = escapeHtml(profile.displayName);

      sendHtml(
        req,
        res,
        `<html>
          <head><title>Authorization Successful</title></head>
          <body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#F5F5F7;color:#1D1D1F;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
            <div style="text-align:center;padding:2rem;background:#FFFFFF;border:1px solid #E5E5EA;border-radius:16px;box-shadow:0 8px 24px rgba(0,0,0,0.06);">
              <h2 style="color:#10B981;margin-top:0;">Cloud Account Connected</h2>
              <p style="color:#6E6E73;font-size:14px;">Successfully linked ${safeProviderName} (${safeDisplayName}).</p>
              <p style="font-size:12px;color:#86868B;">Returning to MountYourClouds…</p>
            </div>
            <script>
              try {
                if (window.opener) {
                  window.opener.postMessage({
                    type: 'MOUNTYOURCLOUDS_OAUTH_SUCCESS',
                    accountId: ${JSON.stringify(accountId)},
                    provider: ${JSON.stringify(provider.id)},
                    email: ${JSON.stringify(profile.email)},
                    displayName: ${JSON.stringify(profile.displayName)},
                    sessionToken: ${JSON.stringify(sessionToken)}
                  }, '*');
                  setTimeout(() => window.close(), 400);
                } else {
                  window.location.href = '/#/app/providers';
                }
              } catch (e) {
                window.location.href = '/#/app/providers';
              }
            </script>
          </body>
        </html>`
      );
      return true;
    } catch (err: unknown) {
      const msg = escapeHtml(err instanceof Error ? err.message : 'Unknown OAuth error');
      sendHtml(
        req,
        res,
        `<html><body style="background:#F5F5F7;color:#E11D48;font-family:-apple-system,sans-serif;padding:2rem;">
          <h3>Connection Error</h3>
          <p>${msg}</p>
          <script>
            try {
              if (window.opener) {
                window.opener.postMessage({
                  type: 'MOUNTYOURCLOUDS_OAUTH_ERROR',
                  error: ${JSON.stringify(msg)}
                }, '*');
              }
            } catch (e) {}
          </script>
          <button onclick="window.close()" style="padding:8px 16px;background:#1D1D1F;color:#fff;border:none;border-radius:8px;cursor:pointer;">Close</button>
        </body></html>`
      );
      return true;
    }
  }

  // GET /api/oauth/accounts
  if (pathname === '/api/oauth/accounts' && req.method === 'GET') {
    const user = await authenticateRequestAsync(req);
    if (!user) {
      sendJson(req, res, 401, { error: 'Authentication required.' });
      return true;
    }
    const accounts = await serverAccountStore.listAccounts(user.userId);
    sendJson(req, res, 200, { accounts });
    return true;
  }

  // GET /api/oauth/accounts/:id/token
  const tokenMatch = pathname.match(/^\/api\/oauth\/accounts\/([a-zA-Z0-9_-]+)\/token$/);
  if (tokenMatch && req.method === 'GET') {
    const user = await authenticateRequestAsync(req);
    if (!user) {
      sendJson(req, res, 401, { error: 'Authentication required.' });
      return true;
    }

    const accountId = tokenMatch[1];
    const tokenRecord = await serverAccountStore.getTokenRecord(user.userId, accountId);

    if (!tokenRecord) {
      sendJson(req, res, 404, { error: 'Account not found or access denied.' });
      return true;
    }

    const now = Date.now();
    if (tokenRecord.tokenExpiresAt && tokenRecord.tokenExpiresAt - now < 60_000) {
      try {
        const refreshToken = await serverAccountStore.getDecryptedRefreshToken(
          user.userId,
          accountId
        );
        const provider = getOAuthProvider(tokenRecord.provider);

        if (refreshToken && provider) {
          const clientId = resolveProviderClientId(provider);
          const clientSecret = resolveProviderClientSecret(provider);

          const refreshBody: Record<string, string> = {
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: clientId || '',
          };
          if (clientSecret) {
            refreshBody.client_secret = clientSecret;
          }

          const refreshRes = await fetch(provider.tokenUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              Accept: 'application/json',
            },
            body: new URLSearchParams(refreshBody),
          });

          if (refreshRes.ok) {
            const rdata = await refreshRes.json();
            const newAccessToken = rdata.access_token;
            const newExpiresIn = Number(rdata.expires_in) || 3600;
            const newExpiresAt = Date.now() + newExpiresIn * 1000;

            await serverAccountStore.updateAccessToken(
              user.userId,
              accountId,
              newAccessToken,
              newExpiresAt,
              rdata.refresh_token
            );
            sendJson(req, res, 200, {
              accessToken: newAccessToken,
              expiresAt: newExpiresAt,
              provider: tokenRecord.provider,
            });
            return true;
          }
        }
      } catch (rErr) {
        console.error('Failed to auto-refresh token:', rErr);
      }
    }

    const decryptedAccessToken = await serverAccountStore.getDecryptedAccessToken(
      user.userId,
      accountId
    );
    if (!decryptedAccessToken) {
      sendJson(req, res, 500, { error: 'Failed to decrypt access token.' });
      return true;
    }

    sendJson(req, res, 200, {
      accessToken: decryptedAccessToken,
      expiresAt: tokenRecord.tokenExpiresAt,
      provider: tokenRecord.provider,
    });
    return true;
  }

  // POST /api/oauth/accounts/:id/refresh
  const refreshMatch = pathname.match(/^\/api\/oauth\/accounts\/([a-zA-Z0-9_-]+)\/refresh$/);
  if (refreshMatch && req.method === 'POST') {
    const user = await authenticateRequestAsync(req);
    if (!user) {
      sendJson(req, res, 401, { error: 'Authentication required.' });
      return true;
    }

    const accountId = refreshMatch[1];
    const tokenRecord = await serverAccountStore.getTokenRecord(user.userId, accountId);

    if (!tokenRecord) {
      sendJson(req, res, 404, { error: 'Account not found.' });
      return true;
    }

    const refreshToken = await serverAccountStore.getDecryptedRefreshToken(
      user.userId,
      accountId
    );
    const provider = getOAuthProvider(tokenRecord.provider);

    if (!refreshToken || !provider) {
      sendJson(req, res, 400, { error: 'No refresh token available. Reconnection required.' });
      return true;
    }

    const clientId = resolveProviderClientId(provider);
    const clientSecret = resolveProviderClientSecret(provider);

    const refreshBody: Record<string, string> = {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId || '',
    };
    if (clientSecret) refreshBody.client_secret = clientSecret;

    const refreshRes = await fetch(provider.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams(refreshBody),
    });

    if (!refreshRes.ok) {
      const errText = await refreshRes.text();
      await serverAccountStore.updateAccountStatus(
        user.userId,
        accountId,
        'expired',
        `Refresh failed: ${errText}`
      );
      sendJson(req, res, 400, { error: `Failed to refresh token: ${errText}` });
      return true;
    }

    const rdata = await refreshRes.json();
    const newExpiresAt = Date.now() + (Number(rdata.expires_in) || 3600) * 1000;
    await serverAccountStore.updateAccessToken(
      user.userId,
      accountId,
      rdata.access_token,
      newExpiresAt,
      rdata.refresh_token
    );

    sendJson(req, res, 200, {
      ok: true,
      accessToken: rdata.access_token,
      expiresAt: newExpiresAt,
    });
    return true;
  }

  // POST /api/oauth/accounts/:id/disconnect
  const disconnectMatch = pathname.match(/^\/api\/oauth\/accounts\/([a-zA-Z0-9_-]+)\/disconnect$/);
  if (disconnectMatch && req.method === 'POST') {
    const user = await authenticateRequestAsync(req);
    if (!user) {
      sendJson(req, res, 401, { error: 'Authentication required.' });
      return true;
    }

    const accountId = disconnectMatch[1];
    const tokenRecord = await serverAccountStore.getTokenRecord(user.userId, accountId);

    if (tokenRecord) {
      const accessToken = await serverAccountStore.getDecryptedAccessToken(user.userId, accountId);
      const provider = getOAuthProvider(tokenRecord.provider);
      if (provider?.revokeUrl && accessToken) {
        try {
          await fetch(provider.revokeUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ token: accessToken }),
          });
        } catch {
          // Best-effort revocation
        }
      }
      await serverAccountStore.deleteAccount(user.userId, accountId);
      await serverAccountStore.appendAuditLog({
        actorUserId: user.userId,
        actorEmail: user.email,
        action: 'cloud_account.disconnected',
        targetType: 'connected_cloud_account',
        targetId: accountId,
      });
    }

    sendJson(req, res, 200, { ok: true, disconnected: accountId });
    return true;
  }

  // =========================================================================
  // 3. RAZORPAY BILLING, SUBSCRIPTIONS & WEBHOOK ENDPOINTS (/api/billing/*)
  // =========================================================================

  if (pathname === '/api/billing/subscription' && req.method === 'GET') {
    const user = await authenticateRequestAsync(req);
    if (!user) {
      sendJson(req, res, 401, { error: 'Authentication required.' });
      return true;
    }

    const sub = await serverAccountStore.getSubscription(user.userId);
    const activeGateway = await serverAccountStore.getActiveRazorpayCredentials();

    sendJson(req, res, 200, {
      subscription: sub,
      razorpayConfigured: activeGateway.enabled,
      razorpayMode: activeGateway.mode,
      razorpayKeyId: activeGateway.enabled ? activeGateway.keyId : null,
      razorpayPlanIds: activeGateway.planIds,
    });
    return true;
  }

  // POST /api/billing/create-order (Creates a Razorpay Recurring Subscription when Plan ID is configured, with automatic fallback to Order)
  if (
    (pathname === '/api/billing/create-order' || pathname === '/api/billing/create-subscription') &&
    req.method === 'POST'
  ) {
    const user = await authenticateRequestAsync(req);
    if (!user) {
      sendJson(req, res, 401, { error: 'Authentication required.' });
      return true;
    }

    const body = await readJsonBody<{
      planId?: 'free' | 'pro' | 'ultra';
      billingCycle?: 'monthly' | 'annual';
      razorpayPlanId?: string;
      preferOrder?: boolean;
    }>(req);

    const planId = body.planId || 'pro';
    const billingCycle = body.billingCycle || 'monthly';

    if (planId === 'free') {
      const sub = await serverAccountStore.getSubscription(user.userId);
      sub.planId = 'free';
      sub.billingCycle = billingCycle;
      sub.status = 'active';
      sub.cancelledAt = null;
      await serverAccountStore.saveSubscription(sub);
      sendJson(req, res, 200, { ok: true, subscription: sub, freeTier: true });
      return true;
    }

    const activeGateway = await serverAccountStore.getActiveRazorpayCredentials();
    if (!activeGateway.enabled || !activeGateway.keyId || !activeGateway.keySecret) {
      sendJson(req, res, 400, {
        error:
          'Razorpay payment gateway is not enabled or configured. Ensure RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are set or configured in Admin Dashboard → Settings → Payment Gateway → Razorpay.',
        code: 'PAYMENT_GATEWAY_NOT_CONFIGURED',
      });
      return true;
    }

    const pricing = PLAN_PRICING_INR[planId];
    const amountInr = billingCycle === 'annual' ? pricing.annual : pricing.monthly;
    const amountPaise = amountInr * 100;
    const authBasic = Buffer.from(`${activeGateway.keyId}:${activeGateway.keySecret}`).toString(
      'base64'
    );

    // Check if an explicit Razorpay Subscription Plan ID is configured for recurring billing
    const configuredRzpPlanId = (
      body.razorpayPlanId ||
      (planId === 'pro'
        ? billingCycle === 'annual'
          ? activeGateway.planIds.proAnnual
          : activeGateway.planIds.proMonthly
        : billingCycle === 'annual'
        ? activeGateway.planIds.ultraAnnual
        : activeGateway.planIds.ultraMonthly) ||
      ''
    ).trim();

    try {
      // 1. Try recurring Razorpay Subscription if a Plan ID is configured and preferOrder is not forced
      if (configuredRzpPlanId && !body.preferOrder) {
        const subRes = await fetch('https://api.razorpay.com/v1/subscriptions', {
          method: 'POST',
          headers: {
            Authorization: `Basic ${authBasic}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            plan_id: configuredRzpPlanId,
            total_count: billingCycle === 'annual' ? 5 : 60,
            quantity: 1,
            customer_notify: 1,
            notes: {
              userId: user.userId,
              email: user.email,
              planId,
              billingCycle,
            },
          }),
        });

        if (subRes.ok) {
          const rzpSub = await subRes.json();
          await serverAccountStore.savePaymentOrder({
            orderId: rzpSub.id,
            userId: user.userId,
            planId,
            billingCycle,
            amountPaise,
            currency: 'INR',
            mode: activeGateway.mode,
            status: 'created',
            subscriptionId: rzpSub.id,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });

          sendJson(req, res, 200, {
            subscriptionId: rzpSub.id,
            orderId: rzpSub.id,
            razorpayPlanId: configuredRzpPlanId,
            amountPaise,
            currency: 'INR',
            keyId: activeGateway.keyId,
            mode: activeGateway.mode,
            planId,
            billingCycle,
          });
          return true;
        } else if (pathname === '/api/billing/create-subscription') {
          const errText = await subRes.text();
          throw new Error(`Razorpay Subscription API error (${subRes.status}): ${errText}`);
        }
        // If /api/billing/create-order was called and the Plan ID subscription endpoint failed,
        // automatically fall back to creating a standard Razorpay Order below!
      }

      // Create verified Razorpay Order in Paise
      const orderRes = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST',
        headers: {
          Authorization: `Basic ${authBasic}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: amountPaise,
          currency: 'INR',
          receipt: `myc_${user.userId.slice(0, 10)}_${Date.now()}`,
          notes: {
            userId: user.userId,
            email: user.email,
            planId,
            billingCycle,
          },
        }),
      });

      if (!orderRes.ok) {
        const errText = await orderRes.text();
        throw new Error(`Razorpay Order API error (${orderRes.status}): ${errText}`);
      }

      const orderData = await orderRes.json();
      await serverAccountStore.savePaymentOrder({
        orderId: orderData.id,
        userId: user.userId,
        planId,
        billingCycle,
        amountPaise,
        currency: 'INR',
        mode: activeGateway.mode,
        status: 'created',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      sendJson(req, res, 200, {
        orderId: orderData.id,
        amountPaise: orderData.amount,
        currency: orderData.currency,
        keyId: activeGateway.keyId,
        mode: activeGateway.mode,
        planId,
        billingCycle,
      });
      return true;
    } catch (err) {
      sendJson(req, res, 502, {
        error: err instanceof Error ? err.message : 'Failed to create Razorpay checkout session.',
      });
      return true;
    }
  }

  // POST /api/billing/verify-payment
  if (pathname === '/api/billing/verify-payment' && req.method === 'POST') {
    const user = await authenticateRequestAsync(req);
    if (!user) {
      sendJson(req, res, 401, { error: 'Authentication required.' });
      return true;
    }

    const activeGateway = await serverAccountStore.getActiveRazorpayCredentials();
    if (!activeGateway.keySecret) {
      sendJson(req, res, 400, { error: 'Razorpay secret not configured on server.' });
      return true;
    }

    const body = await readJsonBody<{
      razorpay_order_id?: string;
      razorpay_subscription_id?: string;
      razorpay_payment_id?: string;
      razorpay_signature?: string;
    }>(req);

    const orderId = (body.razorpay_order_id || body.razorpay_subscription_id || '').trim();
    const paymentId = (body.razorpay_payment_id || '').trim();
    const signature = (body.razorpay_signature || '').trim();

    const orderRecord = await serverAccountStore.getPaymentOrder(orderId);
    if (!orderRecord || orderRecord.userId !== user.userId) {
      sendJson(req, res, 404, { error: 'Order record not found for current user.' });
      return true;
    }

    const isValid = body.razorpay_subscription_id
      ? verifyRazorpaySubscriptionSignature(
          body.razorpay_subscription_id,
          paymentId,
          signature,
          activeGateway.keySecret
        )
      : verifyRazorpaySignature(orderId, paymentId, signature, activeGateway.keySecret);

    if (!isValid) {
      orderRecord.status = 'failed';
      orderRecord.failureReason = 'Invalid HMAC signature';
      orderRecord.updatedAt = Date.now();
      await serverAccountStore.savePaymentOrder(orderRecord);
      sendJson(req, res, 400, { error: 'Razorpay payment signature verification failed.' });
      return true;
    }

    orderRecord.status = 'paid';
    orderRecord.paymentId = paymentId;
    orderRecord.signatureVerified = true;
    orderRecord.updatedAt = Date.now();
    await serverAccountStore.savePaymentOrder(orderRecord);

    const sub = await serverAccountStore.getSubscription(user.userId);
    const now = Date.now();
    const periodDays = orderRecord.billingCycle === 'annual' ? 365 : 30;
    const amountInr = Math.round(orderRecord.amountPaise / 100);

    sub.planId = orderRecord.planId;
    sub.billingCycle = orderRecord.billingCycle;
    sub.status = 'active';
    sub.razorpayOrderId = orderId;
    sub.razorpayPaymentId = paymentId;
    if (body.razorpay_subscription_id) {
      sub.razorpaySubscriptionId = body.razorpay_subscription_id;
    }
    sub.currentPeriodStart = now;
    sub.currentPeriodEnd = now + periodDays * 24 * 60 * 60 * 1000;
    sub.cancelledAt = null;
    sub.invoices.unshift({
      id: `INV-${new Date().getFullYear()}-${String(sub.invoices.length + 1).padStart(4, '0')}`,
      issuedAt: now,
      description: `${PLAN_PRICING_INR[orderRecord.planId].name} Plan (${orderRecord.billingCycle}) — Verified Razorpay Payment`,
      amountInr,
      paymentId,
      orderId,
      status: 'paid',
    });

    await serverAccountStore.saveSubscription(sub);
    await serverAccountStore.appendAuditLog({
      actorUserId: user.userId,
      actorEmail: user.email,
      action: 'subscription.payment_verified',
      targetType: 'subscription',
      targetId: orderId,
      metadata: {
        planId: orderRecord.planId,
        billingCycle: orderRecord.billingCycle,
        amountInr,
        paymentId,
        mode: activeGateway.mode,
      },
    });

    sendJson(req, res, 200, { ok: true, subscription: sub });
    return true;
  }

  // POST /api/billing/webhook (Idempotent Razorpay Webhook Processor)
  if (pathname === '/api/billing/webhook' && req.method === 'POST') {
    const rawBody = await readRawBody(req);
    const signature = (req.headers['x-razorpay-signature'] as string | undefined) || '';
    const eventIdHeader = (req.headers['x-razorpay-event-id'] as string | undefined) || '';

    const activeGateway = await serverAccountStore.getActiveRazorpayCredentials();
    if (!activeGateway.webhookSecret) {
      sendJson(req, res, 400, { error: 'Razorpay webhook secret is not configured.' });
      return true;
    }

    if (!verifyRazorpayWebhookSignature(rawBody, signature, activeGateway.webhookSecret)) {
      sendJson(req, res, 400, { error: 'Invalid Razorpay webhook signature.' });
      return true;
    }

    let eventPayload: any;
    try {
      eventPayload = JSON.parse(rawBody);
    } catch {
      sendJson(req, res, 400, { error: 'Malformed webhook JSON.' });
      return true;
    }

    const eventId =
      eventIdHeader ||
      eventPayload.id ||
      `${eventPayload.event}_${eventPayload.created_at || Date.now()}`;
    const eventType = String(eventPayload.event || 'unknown');

    // Enforce idempotency: never apply duplicate webhook events twice
    if (await serverAccountStore.hasProcessedWebhookEvent(eventId)) {
      sendJson(req, res, 200, { ok: true, duplicate: true, eventId });
      return true;
    }

    await serverAccountStore.recordWebhookEvent(eventId, eventType);

    const paymentEntity = eventPayload.payload?.payment?.entity;
    const subscriptionEntity = eventPayload.payload?.subscription?.entity;
    const notes = paymentEntity?.notes || subscriptionEntity?.notes || {};
    const targetUserId = notes.userId;
    const targetPlanId = (notes.planId as 'free' | 'pro' | 'ultra') || 'pro';
    const targetCycle = (notes.billingCycle as 'monthly' | 'annual') || 'monthly';

    if (targetUserId) {
      const sub = await serverAccountStore.getSubscription(targetUserId);
      const now = Date.now();

      if (
        eventType === 'payment.captured' ||
        eventType === 'subscription.activated' ||
        eventType === 'subscription.charged'
      ) {
        const amountPaise = Number(paymentEntity?.amount || 0);
        const amountInr = Math.round(amountPaise / 100);
        const paymentId = paymentEntity?.id || `wh_${eventId}`;
        const alreadyInvoiced = sub.invoices.some((inv) => inv.paymentId === paymentId);

        sub.planId = targetPlanId;
        sub.billingCycle = targetCycle;
        sub.status = 'active';
        sub.cancelledAt = null;
        sub.currentPeriodStart = now;
        sub.currentPeriodEnd =
          now + (targetCycle === 'annual' ? 365 : 30) * 24 * 60 * 60 * 1000;

        if (!alreadyInvoiced && amountInr > 0) {
          sub.invoices.unshift({
            id: `INV-${new Date().getFullYear()}-${String(sub.invoices.length + 1).padStart(4, '0')}`,
            issuedAt: now,
            description: `${PLAN_PRICING_INR[targetPlanId].name} Plan (${targetCycle}) — Webhook ${eventType}`,
            amountInr,
            paymentId,
            status: 'paid',
          });
        }
        await serverAccountStore.saveSubscription(sub);
      } else if (eventType === 'subscription.cancelled' || eventType === 'subscription.halted') {
        sub.status = eventType === 'subscription.halted' ? 'halted' : 'cancelled';
        sub.cancelledAt = now;
        await serverAccountStore.saveSubscription(sub);
      } else if (eventType === 'payment.failed') {
        sub.status = 'past_due';
        await serverAccountStore.saveSubscription(sub);
      }
    }

    sendJson(req, res, 200, { ok: true, eventId, eventType });
    return true;
  }

  // POST /api/billing/cancel
  if (pathname === '/api/billing/cancel' && req.method === 'POST') {
    const user = await authenticateRequestAsync(req);
    if (!user) {
      sendJson(req, res, 401, { error: 'Authentication required.' });
      return true;
    }

    const sub = await serverAccountStore.getSubscription(user.userId);
    sub.status = 'cancelled';
    sub.cancelledAt = Date.now();
    await serverAccountStore.saveSubscription(sub);

    await serverAccountStore.appendAuditLog({
      actorUserId: user.userId,
      actorEmail: user.email,
      action: 'subscription.cancelled',
      targetType: 'subscription',
      targetId: user.userId,
      metadata: { previousPlan: sub.planId },
    });

    sendJson(req, res, 200, { ok: true, subscription: sub });
    return true;
  }

  // =========================================================================
  // 4. OWNER ADMINISTRATOR ENDPOINTS (/api/admin/*)
  // =========================================================================
  if (pathname.startsWith('/api/admin')) {
    const user = await authenticateRequestAsync(req);
    if (!user) {
      sendJson(req, res, 401, { error: 'Authentication required.' });
      return true;
    }
    if (!user.isAdmin) {
      sendJson(req, res, 403, {
        error:
          'Forbidden: Administrator privileges required. Set MOUNTYOURCLOUDS_ADMIN_USER_ID on the server to your Supabase Auth user ID or email.',
      });
      return true;
    }

    if (pathname === '/api/admin/overview' && req.method === 'GET') {
      const [users, accounts, subs, orders, rzpStatus, auditLogs] = await Promise.all([
        serverAccountStore.listUserProfiles(),
        serverAccountStore.listAllConnectedAccounts(),
        serverAccountStore.listAllSubscriptions(),
        serverAccountStore.listPaymentOrders(),
        serverAccountStore.getMaskedRazorpayGatewayStatus(),
        serverAccountStore.listAuditLogs(50),
      ]);

      const paidOrders = orders.filter((o) => o.status === 'paid');
      const totalRevenueInr = paidOrders.reduce(
        (sum, o) => sum + Math.round(o.amountPaise / 100),
        0
      );

      const oauthProviders = Object.values(OAUTH_PROVIDERS).map((p) => ({
        id: p.id,
        name: p.name,
        configured: Boolean(resolveProviderClientId(p)),
        clientIdEnv: p.clientIdEnv,
        clientSecretEnv: p.clientSecretEnv,
      }));

      sendJson(req, res, 200, {
        metrics: {
          totalUsers: users.length,
          activeConnectedAccounts: accounts.filter((a) => a.status === 'active').length,
          paidSubscriptions: subs.filter((s) => s.planId !== 'free' && s.status === 'active').length,
          totalRevenueInr,
        },
        users,
        connectedAccounts: accounts,
        subscriptions: subs,
        payments: orders,
        razorpay: rzpStatus,
        oauthProviders,
        auditLogs,
      });
      return true;
    }

    if (pathname === '/api/admin/razorpay' && req.method === 'GET') {
      const status = await serverAccountStore.getMaskedRazorpayGatewayStatus();
      const appBaseUrl = getAppBaseUrl(req);
      sendJson(req, res, 200, {
        razorpay: status,
        webhookUrl: `${appBaseUrl}/api/billing/webhook`,
      });
      return true;
    }

    if (pathname === '/api/admin/razorpay' && req.method === 'POST') {
      try {
        const body = await readJsonBody<{
          enabled?: boolean;
          activeMode?: 'test' | 'live';
          confirmLiveMode?: boolean;
          targetEnvironment?: 'test' | 'live';
          keyId?: string;
          keySecret?: string;
          webhookSecret?: string;
          planIdProMonthly?: string;
          planIdProAnnual?: string;
          planIdUltraMonthly?: string;
          planIdUltraAnnual?: string;
        }>(req);

        const updatedStatus = await serverAccountStore.updateRazorpayGatewaySettings({
          ...body,
          updatedBy: user.userId,
        });

        await serverAccountStore.appendAuditLog({
          actorUserId: user.userId,
          actorEmail: user.email,
          action: 'admin.razorpay_settings_updated',
          targetType: 'integration_settings',
          targetId: 'razorpay',
          metadata: {
            enabled: updatedStatus.enabled,
            activeMode: updatedStatus.activeMode,
            targetEnvironment: body.targetEnvironment || updatedStatus.activeMode,
          },
        });

        const appBaseUrl = getAppBaseUrl(req);
        sendJson(req, res, 200, {
          ok: true,
          razorpay: updatedStatus,
          webhookUrl: `${appBaseUrl}/api/billing/webhook`,
        });
        return true;
      } catch (err) {
        sendJson(req, res, 400, {
          error: err instanceof Error ? err.message : 'Failed to update Razorpay settings.',
        });
        return true;
      }
    }

    if (pathname === '/api/admin/razorpay/validate' && req.method === 'POST') {
      const body = await readJsonBody<{ environment?: 'test' | 'live' }>(req);
      const targetEnv = body.environment || 'test';
      const settings = await serverAccountStore.getRazorpayGatewaySettings();
      const envCreds = settings[targetEnv];

      if (!envCreds.keyId || !envCreds.encryptedKeySecret) {
        sendJson(req, res, 400, {
          error: `Please save ${targetEnv.toUpperCase()} Key ID and Key Secret before running validation.`,
        });
        return true;
      }

      try {
        const active = await serverAccountStore.getActiveRazorpayCredentials();
        const authBasic = Buffer.from(`${active.keyId}:${active.keySecret}`).toString('base64');
        const probeRes = await fetch('https://api.razorpay.com/v1/orders?count=1', {
          headers: { Authorization: `Basic ${authBasic}` },
        });

        const isValid = probeRes.ok;
        const updatedStatus = await serverAccountStore.updateRazorpayGatewaySettings({
          targetEnvironment: targetEnv,
          validationStatus: isValid ? 'valid' : 'invalid',
          lastValidatedAt: Date.now(),
          updatedBy: user.userId,
        });

        if (!isValid) {
          const errText = await probeRes.text();
          sendJson(req, res, 400, {
            ok: false,
            error: `Razorpay API rejected credentials (${probeRes.status}): ${errText}`,
            razorpay: updatedStatus,
          });
          return true;
        }

        await serverAccountStore.appendAuditLog({
          actorUserId: user.userId,
          actorEmail: user.email,
          action: 'admin.razorpay_credentials_validated',
          targetType: 'integration_settings',
          targetId: `razorpay_${targetEnv}`,
        });

        sendJson(req, res, 200, {
          ok: true,
          message: `Razorpay ${targetEnv.toUpperCase()} credentials verified against live Razorpay API.`,
          razorpay: updatedStatus,
        });
        return true;
      } catch (err) {
        sendJson(req, res, 502, {
          ok: false,
          error: err instanceof Error ? err.message : 'Network error reaching Razorpay API.',
        });
        return true;
      }
    }

    const userStatusMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)\/status$/);
    if (userStatusMatch && req.method === 'POST') {
      const targetUserId = decodeURIComponent(userStatusMatch[1]);
      const body = await readJsonBody<{ status?: 'active' | 'suspended' | 'deleted' }>(req);
      const nextStatus = body.status || 'active';
      const updated = await serverAccountStore.updateUserStatus(targetUserId, nextStatus);
      await serverAccountStore.appendAuditLog({
        actorUserId: user.userId,
        actorEmail: user.email,
        action: `admin.user_${nextStatus}`,
        targetType: 'user',
        targetId: targetUserId,
      });
      sendJson(req, res, 200, { ok: true, user: updated });
      return true;
    }
  }

  return false;
}
