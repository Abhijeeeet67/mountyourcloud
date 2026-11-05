import type { IncomingMessage, ServerResponse } from 'node:http';
import { generatePkcePair, generateSignedOAuthState, verifyAndUnpackOAuthState } from './crypto.ts';
import { getOAuthProvider } from './providers.ts';
import { serverAccountStore } from './store.ts';

function getAppBaseUrl(req: IncomingMessage): string {
  if (process.env.APP_URL?.trim()) {
    return process.env.APP_URL.trim().replace(/\/$/, '');
  }
  const host = req.headers.host || 'localhost:3000';
  const proto = req.headers['x-forwarded-proto'] || 'http';
  return `${proto}://${host}`;
}

function getUserIdFromReq(req: IncomingMessage): string {
  // In production, extracted from verified session cookie / JWT token
  const headerUser = req.headers['x-user-id'];
  if (typeof headerUser === 'string' && headerUser.trim()) {
    return headerUser.trim();
  }
  return 'alex.rivera@mountyourclouds.demo';
}

function sendJson(res: ServerResponse, statusCode: number, data: unknown): void {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-user-id');
  res.end(JSON.stringify(data));
}

function sendHtml(res: ServerResponse, html: string): void {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(html);
}

export async function handleOAuthRequest(
  req: IncomingMessage,
  res: ServerResponse,
  urlPath: string
): Promise<boolean> {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-user-id');
    res.end();
    return true;
  }

  const parsedUrl = new URL(req.url || '/', 'http://localhost');
  const pathname = urlPath || parsedUrl.pathname;

  // 1. GET /api/oauth/:provider/authorize
  const authorizeMatch = pathname.match(/^\/api\/oauth\/([a-zA-Z0-9_-]+)\/authorize$/);
  if (authorizeMatch && req.method === 'GET') {
    const providerId = authorizeMatch[1];
    const provider = getOAuthProvider(providerId);

    if (!provider) {
      sendJson(res, 404, { error: `Unsupported OAuth provider: ${providerId}` });
      return true;
    }

    const clientId = process.env[provider.clientIdEnv]?.trim();
    if (!clientId) {
      sendJson(res, 400, {
        error: `Missing ${provider.clientIdEnv} in environment. Please configure it in .env or settings.`,
        code: 'MISSING_CREDENTIALS',
      });
      return true;
    }

    const userId = getUserIdFromReq(req);
    const appBaseUrl = getAppBaseUrl(req);
    const redirectUri = `${appBaseUrl}/api/oauth/callback`;

    let codeChallenge: string | undefined = undefined;
    let codeVerifier: string | undefined = undefined;

    if (provider.usePkce) {
      const pkce = generatePkcePair();
      codeVerifier = pkce.verifier;
      codeChallenge = pkce.challenge;
    }

    const state = generateSignedOAuthState({
      userId,
      provider: provider.id,
      codeVerifier,
    });

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

    sendJson(res, 200, {
      url: authUrl.toString(),
      state,
      provider: provider.id,
      name: provider.name,
    });
    return true;
  }

  // 2. GET /api/oauth/callback (Provider redirects here with ?code=...&state=...)
  if (pathname === '/api/oauth/callback' && req.method === 'GET') {
    const code = parsedUrl.searchParams.get('code');
    const state = parsedUrl.searchParams.get('state');
    const errorParam = parsedUrl.searchParams.get('error');
    const errorDesc = parsedUrl.searchParams.get('error_description') || errorParam;

    if (errorParam) {
      sendHtml(
        res,
        `<html><body><script>
          if (window.opener) {
            window.opener.postMessage({ type: 'MOUNTYOURCLOUDS_OAUTH_ERROR', error: ${JSON.stringify(errorDesc)} }, '*');
            window.close();
          } else {
            alert(${JSON.stringify(errorDesc)});
            window.location.href = '/#/app/providers';
          }
        </script><p>Authorization error: ${errorDesc}</p></body></html>`
      );
      return true;
    }

    if (!code || !state) {
      sendJson(res, 400, { error: 'Missing code or state in OAuth callback.' });
      return true;
    }

    try {
      const stateData = verifyAndUnpackOAuthState(state);
      const provider = getOAuthProvider(stateData.provider);
      if (!provider) {
        throw new Error(`Unknown provider in state: ${stateData.provider}`);
      }

      const clientId = process.env[provider.clientIdEnv]?.trim();
      const clientSecret = process.env[provider.clientSecretEnv]?.trim();

      if (!clientId) {
        throw new Error(`Missing ${provider.clientIdEnv} on server.`);
      }

      const appBaseUrl = getAppBaseUrl(req);
      const redirectUri = `${appBaseUrl}/api/oauth/callback`;

      // Perform server-side Authorization Code exchange
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

      // Dropbox uses HTTP Basic auth for client credentials if secret is present
      if (provider.id === 'dropbox' && clientSecret) {
        tokenHeaders['Authorization'] = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
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
      const grantedScopes = typeof tokenData.scope === 'string'
        ? tokenData.scope.split(/[\s,]+/)
        : provider.defaultScopes;

      // Fetch user identity profile
      const userinfoRes = await fetch(provider.userinfoUrl, {
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

      const accountId = `${provider.id}_${profile.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

      // Store account metadata & AES-256-GCM encrypted refresh token
      await serverAccountStore.saveAccountAndTokens(
        {
          id: accountId,
          userId: stateData.userId,
          provider: provider.id,
          email: profile.email,
          displayName: profile.displayName,
          avatarUrl: (profile as any).avatarUrl,
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

      // Render popup close helper
      sendHtml(
        res,
        `<html>
          <head><title>Authorization Successful</title></head>
          <body style="font-family:sans-serif;background:#090A0F;color:#F3F4F6;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
            <div style="text-align:center;padding:2rem;background:#131620;border:1px solid #1E2230;border-radius:8px;">
              <h2 style="color:#10B981;margin-top:0;">Account Connected!</h2>
              <p style="color:#8A94A6;font-size:14px;">Successfully linked ${provider.name} (${profile.displayName}).</p>
              <p style="font-size:12px;color:#6B7280;">Closing window…</p>
            </div>
            <script>
              try {
                if (window.opener) {
                  window.opener.postMessage({
                    type: 'MOUNTYOURCLOUDS_OAUTH_SUCCESS',
                    accountId: ${JSON.stringify(accountId)},
                    provider: ${JSON.stringify(provider.id)},
                    email: ${JSON.stringify(profile.email)},
                    displayName: ${JSON.stringify(profile.displayName)}
                  }, '*');
                  setTimeout(() => window.close(), 600);
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
      const msg = err instanceof Error ? err.message : 'Unknown OAuth error';
      sendHtml(
        res,
        `<html><body style="background:#090A0F;color:#F43F5E;font-family:sans-serif;padding:2rem;">
          <h3>Connection Error</h3>
          <p>${msg}</p>
          <button onclick="window.close()" style="padding:6px 12px;background:#1E2230;color:#fff;border:none;border-radius:4px;cursor:pointer;">Close</button>
        </body></html>`
      );
      return true;
    }
  }

  // 3. GET /api/oauth/accounts (Lists connected accounts for current user)
  if (pathname === '/api/oauth/accounts' && req.method === 'GET') {
    const userId = getUserIdFromReq(req);
    const accounts = await serverAccountStore.listAccounts(userId);
    sendJson(res, 200, { accounts });
    return true;
  }

  // 4. GET /api/oauth/accounts/:id/token (Fetches active access token with auto-refresh)
  const tokenMatch = pathname.match(/^\/api\/oauth\/accounts\/([a-zA-Z0-9_-]+)\/token$/);
  if (tokenMatch && req.method === 'GET') {
    const accountId = tokenMatch[1];
    const userId = getUserIdFromReq(req);
    const tokenRecord = await serverAccountStore.getTokenRecord(userId, accountId);

    if (!tokenRecord) {
      sendJson(res, 404, { error: 'Account not found or access denied.' });
      return true;
    }

    const now = Date.now();
    // Auto-refresh token if expired or expiring within 60 seconds
    if (tokenRecord.tokenExpiresAt && tokenRecord.tokenExpiresAt - now < 60_000) {
      try {
        const refreshToken = await serverAccountStore.getDecryptedRefreshToken(userId, accountId);
        const provider = getOAuthProvider(tokenRecord.provider);

        if (refreshToken && provider) {
          const clientId = process.env[provider.clientIdEnv]?.trim();
          const clientSecret = process.env[provider.clientSecretEnv]?.trim();

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
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
            body: new URLSearchParams(refreshBody),
          });

          if (refreshRes.ok) {
            const rdata = await refreshRes.json();
            const newAccessToken = rdata.access_token;
            const newExpiresIn = Number(rdata.expires_in) || 3600;
            const newExpiresAt = Date.now() + newExpiresIn * 1000;

            await serverAccountStore.updateAccessToken(userId, accountId, newAccessToken, newExpiresAt);
            sendJson(res, 200, {
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

    sendJson(res, 200, {
      accessToken: tokenRecord.accessToken,
      expiresAt: tokenRecord.tokenExpiresAt,
      provider: tokenRecord.provider,
    });
    return true;
  }

  // 5. POST /api/oauth/accounts/:id/refresh (Explicit token refresh)
  const refreshMatch = pathname.match(/^\/api\/oauth\/accounts\/([a-zA-Z0-9_-]+)\/refresh$/);
  if (refreshMatch && req.method === 'POST') {
    const accountId = refreshMatch[1];
    const userId = getUserIdFromReq(req);
    const tokenRecord = await serverAccountStore.getTokenRecord(userId, accountId);

    if (!tokenRecord) {
      sendJson(res, 404, { error: 'Account not found.' });
      return true;
    }

    const refreshToken = await serverAccountStore.getDecryptedRefreshToken(userId, accountId);
    const provider = getOAuthProvider(tokenRecord.provider);

    if (!refreshToken || !provider) {
      sendJson(res, 400, { error: 'No refresh token available. Reconnection required.' });
      return true;
    }

    const clientId = process.env[provider.clientIdEnv]?.trim();
    const clientSecret = process.env[provider.clientSecretEnv]?.trim();

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
      await serverAccountStore.updateAccountStatus(userId, accountId, 'expired', `Refresh failed: ${errText}`);
      sendJson(res, 400, { error: `Failed to refresh token: ${errText}` });
      return true;
    }

    const rdata = await refreshRes.json();
    const newExpiresAt = Date.now() + (Number(rdata.expires_in) || 3600) * 1000;
    await serverAccountStore.updateAccessToken(userId, accountId, rdata.access_token, newExpiresAt);

    sendJson(res, 200, {
      ok: true,
      accessToken: rdata.access_token,
      expiresAt: newExpiresAt,
    });
    return true;
  }

  // 6. POST /api/oauth/accounts/:id/disconnect (Revocation & disconnection)
  const disconnectMatch = pathname.match(/^\/api\/oauth\/accounts\/([a-zA-Z0-9_-]+)\/disconnect$/);
  if (disconnectMatch && req.method === 'POST') {
    const accountId = disconnectMatch[1];
    const userId = getUserIdFromReq(req);
    const tokenRecord = await serverAccountStore.getTokenRecord(userId, accountId);

    if (tokenRecord) {
      const provider = getOAuthProvider(tokenRecord.provider);
      if (provider?.revokeUrl) {
        try {
          await fetch(provider.revokeUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ token: tokenRecord.accessToken }),
          });
        } catch {
          // Best effort revocation
        }
      }
      await serverAccountStore.deleteAccount(userId, accountId);
    }

    sendJson(res, 200, { ok: true, disconnected: accountId });
    return true;
  }

  return false;
}
