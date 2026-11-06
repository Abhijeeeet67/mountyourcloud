import type { ProviderKind } from '../types/domain';
import { clientEnv } from './env';

export type OAuthSupportedProvider = 'gdrive' | 'dropbox' | 'onedrive' | 'box' | 'pcloud';

let clientSessionToken: string | null = null;

export function setClientSessionToken(token: string | null): void {
  clientSessionToken = token;
  if (typeof window !== 'undefined') {
    try {
      if (token) {
        localStorage.setItem('myc_session_token', token);
      } else {
        localStorage.removeItem('myc_session_token');
      }
    } catch {
      // Ignore storage errors
    }
  }
}

export function getClientSessionToken(): string | null {
  if (clientSessionToken) return clientSessionToken;
  if (typeof window !== 'undefined') {
    try {
      return localStorage.getItem('myc_session_token');
    } catch {
      return null;
    }
  }
  return null;
}

export function getAuthorizedHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { ...(extra || {}) };
  const tok = getClientSessionToken();
  if (tok) {
    headers['Authorization'] = `Bearer ${tok}`;
  }
  return headers;
}

export interface OAuthConfig {
  label: string;
  authUrl: string;
  defaultScopes: string;
  envClientIdKey: string;
  tokenEndpoint?: string;
  description: string;
}

export const OAUTH_CONFIGS: Record<OAuthSupportedProvider, OAuthConfig> = {
  gdrive: {
    label: 'Google Drive',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    defaultScopes:
      'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.readonly',
    envClientIdKey: 'gdriveClientId',
    description: 'Official Google Drive REST API v3 OAuth 2.0 PKCE authorization.',
  },
  dropbox: {
    label: 'Dropbox',
    authUrl: 'https://www.dropbox.com/oauth2/authorize',
    defaultScopes: 'files.metadata.read files.content.read files.content.write',
    envClientIdKey: 'dropboxKey',
    description: 'Official Dropbox API v2 OAuth 2.0 PKCE authorization.',
  },
  onedrive: {
    label: 'Microsoft OneDrive',
    authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    defaultScopes: 'Files.ReadWrite User.Read offline_access',
    envClientIdKey: 'onedriveClientId',
    description: 'Microsoft Graph OAuth 2.0 personal & business drive authorization.',
  },
  box: {
    label: 'Box',
    authUrl: 'https://account.box.com/api/oauth2/authorize',
    defaultScopes: 'root_readwrite',
    envClientIdKey: 'boxClientId',
    description: 'Box Content Cloud OAuth 2.0 authorization.',
  },
  pcloud: {
    label: 'pCloud',
    authUrl: 'https://my.pcloud.com/oauth2/authorize',
    defaultScopes: '',
    envClientIdKey: 'pcloudClientId',
    description: 'pCloud Swiss Vault OAuth 2.0 authorization.',
  },
};

export function getDefaultProviderClientId(provider: OAuthSupportedProvider): string {
  switch (provider) {
    case 'gdrive':
      return clientEnv.googleClientId;
    case 'onedrive':
      return clientEnv.onedriveClientId;
    case 'dropbox':
      return clientEnv.dropboxClientId;
    case 'box':
      return clientEnv.boxClientId;
    case 'pcloud':
      return clientEnv.pcloudClientId;
  }
}

export function isOAuthSupported(kind: ProviderKind): kind is OAuthSupportedProvider {
  return kind in OAUTH_CONFIGS;
}

export function generateRandomString(length = 32): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array)
    .map((x) => chars[x % chars.length])
    .join('');
}

export function openCenteredPopup(url: string, title: string, w = 600, h = 720): Window | null {
  if (typeof window === 'undefined') return null;
  const dualScreenLeft = window.screenLeft ?? window.screenX ?? 0;
  const dualScreenTop = window.screenTop ?? window.screenY ?? 0;
  const width = window.innerWidth ?? document.documentElement.clientWidth ?? screen.width;
  const height = window.innerHeight ?? document.documentElement.clientHeight ?? screen.height;
  const systemZoom = width / (window.screen.availWidth || width);
  const left = (width - w) / 2 / systemZoom + dualScreenLeft;
  const top = (height - h) / 2 / systemZoom + dualScreenTop;

  return window.open(
    url,
    title,
    `scrollbars=yes,width=${w / systemZoom},height=${h / systemZoom},top=${top},left=${left},status=no,menubar=no,toolbar=no`
  );
}

function isAllowedMessageOrigin(origin: string): boolean {
  if (!origin) return false;
  if (typeof window !== 'undefined' && origin === window.location.origin) return true;
  return origin.endsWith('.run.app') || origin.includes('localhost');
}

/**
 * Starts a secure server-side Authorization Code flow with PKCE in a popup window
 */
export async function startServerOAuthFlow(
  provider: string,
  options?: { mode?: 'login' | 'connect' }
): Promise<{
  accountId: string;
  provider: string;
  email?: string;
  displayName: string;
  sessionToken?: string;
}> {
  const query = options?.mode === 'login' ? '?mode=login' : '';
  const res = await fetch(`/api/oauth/${encodeURIComponent(provider)}/authorize${query}`, {
    headers: getAuthorizedHeaders(),
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to initiate OAuth authorization for ${provider}`);
  }
  const data = await res.json();
  const { url, name } = data;

  const popup = openCenteredPopup(url, `Connect ${name || provider}`);
  if (!popup) {
    throw new Error(
      'Popup was blocked by your browser. Please allow popups for MountYourClouds to complete OAuth sign-in.'
    );
  }

  return new Promise((resolve, reject) => {
    let checkInterval: ReturnType<typeof setInterval> | null = null;

    const cleanup = () => {
      window.removeEventListener('message', messageHandler);
      if (checkInterval) clearInterval(checkInterval);
    };

    const messageHandler = (event: MessageEvent) => {
      if (!isAllowedMessageOrigin(event.origin)) return;
      const msg = event.data;
      if (!msg) return;

      if (msg.type === 'MOUNTYOURCLOUDS_OAUTH_SUCCESS') {
        cleanup();
        if (msg.sessionToken) {
          setClientSessionToken(msg.sessionToken);
        }
        resolve({
          accountId: msg.accountId,
          provider: msg.provider,
          email: msg.email,
          displayName: msg.displayName,
          sessionToken: msg.sessionToken,
        });
      } else if (msg.type === 'MOUNTYOURCLOUDS_OAUTH_ERROR') {
        cleanup();
        reject(new Error(msg.error || 'OAuth authorization failed'));
      }
    };

    window.addEventListener('message', messageHandler);

    checkInterval = setInterval(() => {
      if (popup.closed) {
        cleanup();
        reject(new Error('Sign-in popup was closed before completing authorization.'));
      }
    }, 800);

    setTimeout(() => {
      cleanup();
      if (!popup.closed) popup.close();
      reject(new Error('OAuth sign-in timed out. Please try again.'));
    }, 180_000);
  });
}

export async function startOAuthDance(params: {
  provider: OAuthSupportedProvider;
  clientId?: string;
  redirectUri?: string;
}): Promise<{ accessToken: string; state: string; provider: OAuthSupportedProvider }> {
  const config = OAUTH_CONFIGS[params.provider];
  if (!config) {
    throw new Error(`Unsupported OAuth provider: ${params.provider}`);
  }

  const clientId = (params.clientId || getDefaultProviderClientId(params.provider)).trim();
  if (!clientId) {
    throw new Error(
      `Please configure a Client ID for ${config.label} to initiate OAuth authorization.`
    );
  }

  const redirectUri =
    params.redirectUri || `${window.location.origin}${window.location.pathname}#/oauth/callback`;

  const state = `myc_${params.provider}_${generateRandomString(16)}`;
  sessionStorage.setItem('myc_oauth_state', state);
  sessionStorage.setItem('myc_oauth_provider', params.provider);

  const authUrl = new URL(config.authUrl);
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'token');
  authUrl.searchParams.set('state', state);
  if (config.defaultScopes) {
    authUrl.searchParams.set('scope', config.defaultScopes);
  }

  if (params.provider === 'gdrive') {
    authUrl.searchParams.set('include_granted_scopes', 'true');
    authUrl.searchParams.set('prompt', 'select_account consent');
  }

  const popup = openCenteredPopup(authUrl.toString(), `Connect ${config.label}`);
  if (!popup) {
    throw new Error(
      'Popup was blocked by your browser. Please allow popups for MountYourClouds to complete OAuth sign-in.'
    );
  }

  return new Promise((resolve, reject) => {
    let checkInterval: ReturnType<typeof setInterval> | null = null;

    const messageHandler = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;

      const data = event.data;
      if (!data || data.type !== 'MOUNTYOURCLOUDS_OAUTH_SUCCESS') return;

      if (data.state && data.state !== state) {
        window.removeEventListener('message', messageHandler);
        if (checkInterval) clearInterval(checkInterval);
        reject(new Error('OAuth security state validation mismatch.'));
        return;
      }

      window.removeEventListener('message', messageHandler);
      if (checkInterval) clearInterval(checkInterval);

      if (data.accessToken) {
        resolve({
          accessToken: data.accessToken,
          state: data.state || state,
          provider: params.provider,
        });
      } else if (data.error) {
        reject(new Error(`OAuth sign-in error: ${data.error_description || data.error}`));
      } else {
        reject(new Error('No access token received from authorization server.'));
      }
    };

    window.addEventListener('message', messageHandler);

    checkInterval = setInterval(() => {
      if (popup.closed) {
        if (checkInterval) clearInterval(checkInterval);
        window.removeEventListener('message', messageHandler);
        reject(new Error('Sign-in popup was closed before completing authorization.'));
      }
    }, 800);

    setTimeout(() => {
      if (checkInterval) clearInterval(checkInterval);
      window.removeEventListener('message', messageHandler);
      if (!popup.closed) popup.close();
      reject(new Error('OAuth sign-in timed out. Please try again.'));
    }, 180_000);
  });
}

export function parseS3CredentialsText(text: string): {
  accessKeyId: string;
  secretAccessKey: string;
  region?: string;
  bucket?: string;
  endpoint?: string;
} | null {
  const clean = text.trim();
  if (!clean) return null;

  if (clean.startsWith('{') && clean.endsWith('}')) {
    try {
      const obj = JSON.parse(clean);
      if (obj.accessKeyId && obj.secretAccessKey) {
        return {
          accessKeyId: String(obj.accessKeyId).trim(),
          secretAccessKey: String(obj.secretAccessKey).trim(),
          region: obj.region ? String(obj.region).trim() : undefined,
          bucket: obj.bucket ? String(obj.bucket).trim() : undefined,
          endpoint: obj.endpoint ? String(obj.endpoint).trim() : undefined,
        };
      }
    } catch {
      // Continue
    }
  }

  const accessKeyMatch = clean.match(/(?:aws_)?access_key_id\s*[:=]\s*([^\s]+)/i);
  const secretKeyMatch = clean.match(/(?:aws_)?secret_access_key\s*[:=]\s*([^\s]+)/i);
  const regionMatch = clean.match(/(?:aws_default_)?region\s*[:=]\s*([^\s]+)/i);
  const bucketMatch = clean.match(/bucket\s*[:=]\s*([^\s]+)/i);
  const endpointMatch = clean.match(/endpoint\s*[:=]\s*([^\s]+)/i);

  if (accessKeyMatch && secretKeyMatch) {
    return {
      accessKeyId: accessKeyMatch[1],
      secretAccessKey: secretKeyMatch[1],
      region: regionMatch ? regionMatch[1] : undefined,
      bucket: bucketMatch ? bucketMatch[1] : undefined,
      endpoint: endpointMatch ? endpointMatch[1] : undefined,
    };
  }

  if (/^[A-Za-z0-9_-]{10,}:[A-Za-z0-9/+=_-]{16,}$/.test(clean)) {
    const [k, s] = clean.split(':');
    return { accessKeyId: k, secretAccessKey: s };
  }

  return null;
}

export function getSmartWebDavDefaults(
  kind: ProviderKind,
  username: string
): { basePath: string; defaultEndpoint: string } {
  const cleanUser = username.trim() || 'user';
  switch (kind) {
    case 'nextcloud':
      return {
        basePath: `/remote.php/dav/files/${cleanUser}`,
        defaultEndpoint: 'https://cloud.example.com',
      };
    case 'owncloud':
      return {
        basePath: '/remote.php/webdav',
        defaultEndpoint: 'https://owncloud.example.com',
      };
    case 'synology':
      return {
        basePath: '/webdav',
        defaultEndpoint: 'https://nas.local:5006/webdav',
      };
    case 'qnap':
      return {
        basePath: '/webdav',
        defaultEndpoint: 'https://qnap.local:5001/webdav',
      };
    case 'hetzner':
      return {
        basePath: '/',
        defaultEndpoint: `https://${cleanUser}.your-storagebox.de`,
      };
    case 'koofr':
      return {
        basePath: '/dav/Koofr',
        defaultEndpoint: 'https://app.koofr.net/dav/Koofr',
      };
    default:
      return {
        basePath: '/vault',
        defaultEndpoint: 'https://dav.example.com/webdav',
      };
  }
}
