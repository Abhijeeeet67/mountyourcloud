import { CheckCircle2, Cloud, KeyRound, Lock, Mail } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { APP_NAME, APP_TAGLINE } from '../lib/constants';
import {
  isSupabaseConfigured,
  mapSupabaseUserToProfile,
  signInWithSocialProvider,
} from '../lib/supabase';
import { useVaultStore } from '../store/useVaultStore';

type AuthTab = 'signin' | 'register' | 'reset';

export function AuthPage() {
  const navigate = useNavigate();
  const currentAccount = useVaultStore((s) => s.currentAccount);
  const loginWithPassword = useVaultStore((s) => s.loginWithPassword);
  const registerAccount = useVaultStore((s) => s.registerAccount);
  const requestPasswordResetEmail = useVaultStore((s) => s.requestPasswordResetEmail);
  const completeSocialOAuthLogin = useVaultStore((s) => s.completeSocialOAuthLogin);
  const addToast = useVaultStore((s) => s.addToast);

  const [tab, setTab] = useState<AuthTab>('signin');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [socialSubmitting, setSocialSubmitting] = useState<'google' | 'onedrive' | 'apple' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    if (currentAccount) {
      navigate('/app/overview', { replace: true });
    }
  }, [currentAccount, navigate]);

  const handleSocialAuth = async (provider: 'google' | 'onedrive' | 'apple') => {
    setError(null);
    setStatusMessage(null);
    setSocialSubmitting(provider);
    try {
      const { session } = await signInWithSocialProvider(provider);
      if (session?.user) {
        const profile = mapSupabaseUserToProfile(session.user);
        await completeSocialOAuthLogin({
          email: profile.email,
          displayName: profile.displayName,
          provider: profile.provider,
          sessionToken: session.access_token,
        });
        addToast({
          title: `Signed in with ${
            provider === 'google'
              ? 'Google'
              : provider === 'onedrive'
              ? 'Microsoft OneDrive'
              : 'Apple'
          }`,
          variant: 'success',
        });
        navigate('/app/overview', { replace: true });
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : `Failed to initiate ${provider} sign-in.`
      );
    } finally {
      setSocialSubmitting(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setStatusMessage(null);
    setSubmitting(true);

    try {
      if (tab === 'signin') {
        await loginWithPassword(email, password);
        addToast({ title: 'Signed in to MountYourClouds', variant: 'success' });
        navigate('/app/overview');
      } else if (tab === 'register') {
        const res = await registerAccount(email, displayName, password);
        if (res?.requiresEmailConfirmation) {
          setStatusMessage(
            `Verification email sent to ${email}. Please click the confirmation link in your inbox to activate your account.`
          );
          setTab('signin');
        } else {
          addToast({ title: 'Account created and signed in', variant: 'success' });
          navigate('/app/overview');
        }
      } else if (tab === 'reset') {
        const msg = await requestPasswordResetEmail(email, password);
        setStatusMessage(msg);
        setTab('signin');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F5F5F7] dark:bg-[#090A0F] text-[#1D1D1F] dark:text-[#F5F5F7]">
      {/* Header */}
      <header className="px-6 py-4 border-b border-[#E5E5EA] dark:border-[#1E2230] bg-white/80 dark:bg-[#090A0F]/80 backdrop-blur-md flex items-center justify-between gap-4">
        <Link to="/" className="flex items-center gap-2.5 font-semibold text-[15px]">
          <div className="w-8 h-8 rounded-xl bg-[#0071E3] flex items-center justify-center text-white shadow-sm">
            <Cloud className="w-4 h-4" />
          </div>
          <div>
            <span className="font-bold tracking-tight">{APP_NAME}</span>
            <span className="hidden sm:inline text-xs text-[#6E6E73] dark:text-[#86868B] ml-2">
              {APP_TAGLINE}
            </span>
          </div>
        </Link>
        <div className="flex items-center gap-4 text-xs text-[#6E6E73] dark:text-[#86868B]">
          <Link to="/security" className="hover:text-[#1D1D1F] dark:hover:text-white">
            Security
          </Link>
          <Link to="/pricing" className="hover:text-[#1D1D1F] dark:hover:text-white">
            Pricing
          </Link>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#131620] border border-[#E5E5EA] dark:border-[#1E2230] shadow-sm overflow-hidden">
          <div className="px-6 pt-6 pb-4 border-b border-[#E5E5EA] dark:border-[#1E2230]">
            <h1 className="text-xl font-bold tracking-tight">
              {tab === 'signin'
                ? 'Sign in to MountYourClouds'
                : tab === 'register'
                ? 'Create your MountYourClouds account'
                : 'Recover your account password'}
            </h1>
            <p className="text-xs text-[#6E6E73] dark:text-[#86868B] mt-1">
              {tab === 'signin'
                ? 'Access your connected cloud drives, transfers, and encrypted workspace.'
                : tab === 'register'
                ? 'Start on the FREE tier (2 cloud mounts, ₹0/mo) and upgrade anytime.'
                : isSupabaseConfigured
                ? 'Enter your account email to receive a password reset link.'
                : 'Enter your registered email and new password to update your credentials.'}
            </p>
          </div>

          <div className="p-6 space-y-5">
            {/* Social OAuth Buttons (Google, OneDrive & Apple) */}
            {tab !== 'reset' && (
              <div className="space-y-2.5">
                <button
                  type="button"
                  disabled={submitting || socialSubmitting !== null}
                  onClick={() => handleSocialAuth('google')}
                  className="w-full py-2.5 px-4 rounded-xl bg-[#F5F5F7] dark:bg-[#0E1017] hover:bg-[#E8E8ED] dark:hover:bg-[#1E2230] border border-[#E5E5EA] dark:border-[#1E2230] text-xs font-semibold flex items-center justify-center gap-2.5 transition-colors disabled:opacity-50"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      fill="#4285F4"
                      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.3 0 6.08-1.09 8.1-2.96l-3.88-3.05c-1.08.72-2.45 1.16-4.22 1.16-3.24 0-5.98-2.18-6.96-5.11H1.05v3.14C3.06 21.2 7.21 24 12 24z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.04 14.04c-.25-.72-.39-1.49-.39-2.29s.14-1.57.39-2.29V6.32H1.05C.38 7.66 0 9.18 0 10.75s.38 3.09 1.05 4.43l3.99-1.14z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.75c1.8 0 3.41.62 4.68 1.84l3.5-3.5C18.07 1.14 15.3 0 12 0 7.21 0 3.06 2.8 1.05 6.82l3.99 3.14c.98-2.93 3.72-5.21 6.96-5.21z"
                    />
                  </svg>
                  <span>
                    {socialSubmitting === 'google'
                      ? 'Opening Google Sign-In…'
                      : 'Continue with Google'}
                  </span>
                </button>

                <button
                  type="button"
                  disabled={submitting || socialSubmitting !== null}
                  onClick={() => handleSocialAuth('onedrive')}
                  className="w-full py-2.5 px-4 rounded-xl bg-[#F5F5F7] dark:bg-[#0E1017] hover:bg-[#E8E8ED] dark:hover:bg-[#1E2230] border border-[#E5E5EA] dark:border-[#1E2230] text-xs font-semibold flex items-center justify-center gap-2.5 transition-colors disabled:opacity-50"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                    <path fill="#F25022" d="M1 1h10v10H1z" />
                    <path fill="#7FBA00" d="M13 1h10v10H13z" />
                    <path fill="#00A4EF" d="M1 13h10v10H1z" />
                    <path fill="#FFB900" d="M13 13h10v10H13z" />
                  </svg>
                  <span>
                    {socialSubmitting === 'onedrive'
                      ? 'Opening Microsoft OneDrive…'
                      : 'Continue with Microsoft OneDrive'}
                  </span>
                </button>

                <button
                  type="button"
                  disabled={submitting || socialSubmitting !== null}
                  onClick={() => handleSocialAuth('apple')}
                  className="w-full py-2.5 px-4 rounded-xl bg-[#1D1D1F] dark:bg-white text-white dark:text-[#1D1D1F] hover:opacity-90 text-xs font-semibold flex items-center justify-center gap-2.5 transition-opacity disabled:opacity-50"
                >
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.53 4.08zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
                  </svg>
                  <span>
                    {socialSubmitting === 'apple'
                      ? 'Opening Apple Sign-In…'
                      : 'Sign in with Apple'}
                  </span>
                </button>

                <div className="relative flex py-1 items-center">
                  <div className="grow border-t border-[#E5E5EA] dark:border-[#1E2230]" />
                  <span className="shrink mx-3 text-[11px] uppercase tracking-wider text-[#6E6E73] dark:text-[#86868B]">
                    or continue with email
                  </span>
                  <div className="grow border-t border-[#E5E5EA] dark:border-[#1E2230]" />
                </div>
              </div>
            )}

            {/* Auth Mode Tabs */}
            <div
              role="tablist"
              aria-label="Authentication mode"
              className="grid grid-cols-3 p-1 rounded-xl bg-[#F5F5F7] dark:bg-[#090A0F] border border-[#E5E5EA] dark:border-[#1E2230] text-xs font-medium"
            >
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'signin'}
                onClick={() => {
                  setTab('signin');
                  setError(null);
                }}
                className={`py-1.5 rounded-lg transition-colors ${
                  tab === 'signin'
                    ? 'bg-white dark:bg-[#131620] text-[#1D1D1F] dark:text-white shadow-xs'
                    : 'text-[#6E6E73] dark:text-[#86868B]'
                }`}
              >
                Sign in
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'register'}
                onClick={() => {
                  setTab('register');
                  setError(null);
                }}
                className={`py-1.5 rounded-lg transition-colors ${
                  tab === 'register'
                    ? 'bg-white dark:bg-[#131620] text-[#1D1D1F] dark:text-white shadow-xs'
                    : 'text-[#6E6E73] dark:text-[#86868B]'
                }`}
              >
                Create account
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'reset'}
                onClick={() => {
                  setTab('reset');
                  setPassword('');
                  setError(null);
                }}
                className={`py-1.5 rounded-lg transition-colors ${
                  tab === 'reset'
                    ? 'bg-white dark:bg-[#131620] text-[#1D1D1F] dark:text-white shadow-xs'
                    : 'text-[#6E6E73] dark:text-[#86868B]'
                }`}
              >
                Reset password
              </button>
            </div>

            {statusMessage && (
              <div
                role="status"
                className="p-3 rounded-xl bg-[#10B981]/10 border border-[#10B981]/30 text-xs text-[#10B981] flex items-start gap-2"
              >
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{statusMessage}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="auth-email"
                  className="block text-xs font-medium text-[#6E6E73] dark:text-[#86868B] mb-1"
                >
                  Email address
                </label>
                <div className="relative">
                  <Mail className="w-3.5 h-3.5 text-[#6E6E73] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    id="auth-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#F5F5F7] dark:bg-[#0E1017] border border-[#E5E5EA] dark:border-[#1E2230] text-[13px] text-[#1D1D1F] dark:text-[#F5F5F7]"
                  />
                </div>
              </div>

              {tab === 'register' && (
                <div>
                  <label
                    htmlFor="auth-name"
                    className="block text-xs font-medium text-[#6E6E73] dark:text-[#86868B] mb-1"
                  >
                    Full Name
                  </label>
                  <input
                    id="auth-name"
                    type="text"
                    required
                    autoComplete="name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Your name"
                    className="w-full px-3 py-2 rounded-xl bg-[#F5F5F7] dark:bg-[#0E1017] border border-[#E5E5EA] dark:border-[#1E2230] text-[13px] text-[#1D1D1F] dark:text-[#F5F5F7]"
                  />
                </div>
              )}

              {(tab !== 'reset' || !isSupabaseConfigured) && (
                <div>
                  <label
                    htmlFor="auth-password"
                    className="block text-xs font-medium text-[#6E6E73] dark:text-[#86868B] mb-1"
                  >
                    {tab === 'reset'
                      ? 'New Password (minimum 8 characters)'
                      : tab === 'register'
                      ? 'Password (minimum 8 characters)'
                      : 'Password'}
                  </label>
                  <div className="relative">
                    <Lock className="w-3.5 h-3.5 text-[#6E6E73] absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      id="auth-password"
                      type="password"
                      required
                      minLength={tab === 'signin' ? 6 : 8}
                      autoComplete={tab === 'signin' ? 'current-password' : 'new-password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#F5F5F7] dark:bg-[#0E1017] border border-[#E5E5EA] dark:border-[#1E2230] text-[13px] text-[#1D1D1F] dark:text-[#F5F5F7]"
                    />
                  </div>
                </div>
              )}

              {error && (
                <p role="alert" className="text-xs text-[#E11D48] dark:text-[#F43F5E] font-medium">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 px-4 rounded-xl bg-[#0071E3] hover:bg-[#0077ED] text-white text-xs font-semibold flex items-center justify-center gap-2 shadow-xs disabled:opacity-50"
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>
                  {submitting
                    ? 'Authenticating…'
                    : tab === 'signin'
                    ? 'Sign in'
                    : tab === 'register'
                    ? 'Create Account'
                    : isSupabaseConfigured
                    ? 'Send Password Recovery Email'
                    : 'Update Password'}
                </span>
              </button>
            </form>

            <p className="text-[11px] text-center text-[#6E6E73] dark:text-[#86868B]">
              By continuing, you agree to our{' '}
              <Link to="/terms" className="underline hover:text-[#1D1D1F] dark:hover:text-white">
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link to="/privacy" className="underline hover:text-[#1D1D1F] dark:hover:text-white">
                Privacy Policy
              </Link>
              .
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
