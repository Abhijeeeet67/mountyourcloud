import { createClient, type Session, type SupabaseClient, type User } from '@supabase/supabase-js';
import { clientEnv } from './env';
import { openCenteredPopup, setClientSessionToken } from './oauth';

export const SUPABASE_URL = clientEnv.supabaseUrl;
export const SUPABASE_PUBLISHABLE_KEY = clientEnv.supabasePublishableKey;

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);

const OAUTH_REDIRECT_STORAGE_KEY = 'myc_post_oauth_redirect';

let wasOAuthCallbackInUrl = false;
let urlNormalized = false;

/**
 * Normalizes the URL before Supabase client initialization so that HashRouter
 * and Supabase's implicit (#access_token=...) or PKCE (?code=...) callback
 * parameters never collide (e.g. "#/app/overview#access_token=...").
 */
export function normalizeOAuthCallbackUrl(): void {
  if (typeof window === 'undefined' || urlNormalized) return;
  urlNormalized = true;

  const { pathname, search, hash } = window.location;

  // Handle double-hash when Supabase appends #access_token=... to a #/app/overview redirectTo URL
  if (hash.includes('#access_token=') || hash.includes('#error=')) {
    const secondHashIdx = hash.indexOf('#', 1);
    if (secondHashIdx !== -1) {
      const routePart = hash.slice(1, secondHashIdx);
      const tokenPart = hash.slice(secondHashIdx + 1);
      wasOAuthCallbackInUrl = true;
      if (routePart.startsWith('/')) {
        sessionStorage.setItem(OAUTH_REDIRECT_STORAGE_KEY, routePart);
      } else {
        sessionStorage.setItem(OAUTH_REDIRECT_STORAGE_KEY, '/app/overview');
      }
      window.history.replaceState(null, '', `${pathname}${search}#${tokenPart}`);
      return;
    }
  }

  // Handle direct #access_token=... or ?code=... callback from Supabase OAuth
  if (
    hash.startsWith('#access_token=') ||
    hash.includes('&access_token=') ||
    hash.startsWith('#error=') ||
    search.includes('code=')
  ) {
    wasOAuthCallbackInUrl = true;
    if (!sessionStorage.getItem(OAUTH_REDIRECT_STORAGE_KEY)) {
      const targetRoute =
        pathname && pathname !== '/' && pathname.startsWith('/app')
          ? pathname
          : '/app/overview';
      sessionStorage.setItem(OAUTH_REDIRECT_STORAGE_KEY, targetRoute);
    }
  } else if (pathname && pathname.startsWith('/app/')) {
    sessionStorage.setItem(OAUTH_REDIRECT_STORAGE_KEY, pathname);
  }
}

export function consumePostOAuthRedirectTarget(): string | null {
  if (typeof window === 'undefined') return null;
  const target = sessionStorage.getItem(OAUTH_REDIRECT_STORAGE_KEY);
  if (target) {
    sessionStorage.removeItem(OAUTH_REDIRECT_STORAGE_KEY);
    return target.startsWith('/') ? target : `/${target}`;
  }
  if (wasOAuthCallbackInUrl) {
    wasOAuthCallbackInUrl = false;
    return '/app/overview';
  }
  return null;
}

export function getSupabaseOAuthRedirectUrl(targetRoute = '/app/overview'): string {
  if (typeof window === 'undefined') return '';
  const cleanRoute = targetRoute.startsWith('/') ? targetRoute : `/${targetRoute}`;
  return `${window.location.origin}/#${cleanRoute}`;
}

let supabaseInstance: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  if (!supabaseInstance) {
    normalizeOAuthCallbackUrl();

    supabaseInstance = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'mountyourclouds_supabase_auth',
      },
    });

    supabaseInstance.auth.onAuthStateChange((_event, session) => {
      setClientSessionToken(session?.access_token ?? null);
    });
  }
  return supabaseInstance;
}

export interface AuthenticatedUserProfile {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  provider: string;
  emailVerified: boolean;
  isAdmin: boolean;
  createdAt: number;
}

export function mapSupabaseUserToProfile(
  user: User,
  isAdmin = false
): AuthenticatedUserProfile {
  const meta = user.user_metadata ?? {};
  const appMeta = user.app_metadata ?? {};
  const email = user.email || meta.email || 'apple-private-relay@privaterelay.appleid.com';
  const displayName =
    meta.full_name ||
    meta.name ||
    meta.display_name ||
    (email.includes('@') ? email.split('@')[0] : 'MountYourClouds User');

  return {
    id: user.id,
    email,
    displayName,
    avatarUrl: meta.avatar_url || meta.picture,
    provider: appMeta.provider || 'email',
    emailVerified: Boolean(
      user.email_confirmed_at ||
        appMeta.provider === 'google' ||
        appMeta.provider === 'apple' ||
        appMeta.provider === 'azure'
    ),
    isAdmin,
    createdAt: user.created_at ? new Date(user.created_at).getTime() : Date.now(),
  };
}

export async function getActiveSupabaseSession(): Promise<Session | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  const { data } = await client.auth.getSession();
  let session: Session | null = data.session;

  // If returning from an OAuth redirect, wait briefly if Supabase is still exchanging/parsing the URL token
  if (!session && wasOAuthCallbackInUrl) {
    session = await new Promise<Session | null>((resolve) => {
      const timeout = setTimeout(async () => {
        sub.unsubscribe();
        const retry = await client.auth.getSession();
        resolve(retry.data.session);
      }, 1200);

      const {
        data: { subscription: sub },
      } = client.auth.onAuthStateChange((_event, nextSession) => {
        if (nextSession) {
          clearTimeout(timeout);
          sub.unsubscribe();
          resolve(nextSession);
        }
      });
    });
  }

  if (session?.access_token) {
    setClientSessionToken(session.access_token);

    const redirectTarget = consumePostOAuthRedirectTarget();
    if (redirectTarget && typeof window !== 'undefined') {
      window.history.replaceState(null, '', `/#${redirectTarget}`);
      if (window.location.hash !== `#${redirectTarget}`) {
        window.location.hash = `#${redirectTarget}`;
      }
    }

    // If this window was opened as an OAuth popup from inside an iframe, notify opener and close
    if (
      typeof window !== 'undefined' &&
      window.opener &&
      window.opener !== window &&
      (redirectTarget || wasOAuthCallbackInUrl)
    ) {
      try {
        window.opener.postMessage(
          {
            type: 'SUPABASE_OAUTH_SUCCESS',
            accessToken: session.access_token,
          },
          '*'
        );
        setTimeout(() => {
          window.close();
        }, 150);
      } catch {
        // Ignore cross-origin opener errors
      }
    }
  }

  return session;
}

export async function signInWithSocialProvider(
  provider: 'google' | 'apple' | 'onedrive'
): Promise<{ session: Session | null }> {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error(
      'Supabase Auth is not configured. Please ensure VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (or VITE_SUPABASE_ANON_KEY) are set.'
    );
  }

  const supabaseProvider = provider === 'onedrive' ? 'azure' : provider;
  const redirectTo = getSupabaseOAuthRedirectUrl('/app/overview');
  const inIframe = typeof window !== 'undefined' && window.self !== window.top;

  if (typeof window !== 'undefined') {
    sessionStorage.setItem(OAUTH_REDIRECT_STORAGE_KEY, '/app/overview');
  }

  const { data, error } = await client.auth.signInWithOAuth({
    provider: supabaseProvider,
    options: {
      redirectTo,
      skipBrowserRedirect: inIframe,
      queryParams:
        provider === 'google'
          ? { access_type: 'offline', prompt: 'select_account' }
          : undefined,
    },
  });

  if (error) {
    throw new Error(error.message);
  }

  // In a top-level browser tab, signInWithOAuth triggers a full-page redirect to data.url automatically
  if (!inIframe) {
    if (data?.url) {
      window.location.assign(data.url);
    }
    return { session: null };
  }

  // Inside an iframe (such as AI Studio preview), open Supabase OAuth URL in a popup to avoid X-Frame-Options blocks
  if (!data?.url) {
    throw new Error(`Failed to generate Supabase OAuth URL for ${provider}.`);
  }

  const popup = openCenteredPopup(data.url, `Sign in with ${provider}`);
  if (!popup) {
    throw new Error('Popup blocked. Please allow popups for this site to complete sign-in.');
  }

  return await new Promise<{ session: Session | null }>((resolve, reject) => {
    let settled = false;

    const finish = async () => {
      if (settled) return;
      settled = true;
      cleanup();
      const { data: sessionData } = await client.auth.getSession();
      if (sessionData.session?.access_token) {
        setClientSessionToken(sessionData.session.access_token);
      }
      resolve({ session: sessionData.session });
    };

    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'SUPABASE_OAUTH_SUCCESS') {
        void finish();
      }
    };

    const {
      data: { subscription: authSub },
    } = client.auth.onAuthStateChange((event, session) => {
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session) {
        void finish();
      }
    });

    const pollTimer = setInterval(async () => {
      if (popup.closed) {
        const { data: sessionData } = await client.auth.getSession();
        if (sessionData.session) {
          void finish();
        } else if (!settled) {
          settled = true;
          cleanup();
          reject(new Error('Sign-in window was closed before authentication completed.'));
        }
      }
    }, 500);

    const cleanup = () => {
      clearInterval(pollTimer);
      window.removeEventListener('message', onMessage);
      authSub.unsubscribe();
    };

    window.addEventListener('message', onMessage);
  });
}
