import { ArrowRight, KeyRound, ShieldAlert, Sparkles } from 'lucide-react';
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  APP_NAME,
  DEMO_ACCOUNT_DEFAULT_PASSWORD,
  DEMO_ACCOUNT_EMAIL,
  PROTOTYPE_BADGE_TEXT,
} from '../lib/constants';
import { useVaultStore } from '../store/useVaultStore';

type AuthTab = 'signin' | 'register' | 'reset';

export function AuthPage() {
  const navigate = useNavigate();
  const loginWithPassword = useVaultStore((s) => s.loginWithPassword);
  const registerAccount = useVaultStore((s) => s.registerAccount);
  const resetPasswordLocal = useVaultStore((s) => s.resetPasswordLocal);
  const launchDemoWorkspace = useVaultStore((s) => s.launchDemoWorkspace);
  const addToast = useVaultStore((s) => s.addToast);

  const [tab, setTab] = useState<AuthTab>('signin');
  const [email, setEmail] = useState(DEMO_ACCOUNT_EMAIL);
  const [displayName, setDisplayName] = useState('Alex Rivera');
  const [password, setPassword] = useState(DEMO_ACCOUNT_DEFAULT_PASSWORD);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSuccessMsg, setResetSuccessMsg] = useState<string | null>(null);

  const handleInstantDemo = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await launchDemoWorkspace();
      addToast({
        title: 'Entered MountYourClouds Demo Workspace',
        variant: 'success',
      });
      navigate('/app/overview');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to launch demo workspace.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResetSuccessMsg(null);
    setSubmitting(true);

    try {
      if (tab === 'signin') {
        await loginWithPassword(email, password);
        addToast({ title: 'Signed in to local demo account', variant: 'success' });
        navigate('/app/overview');
      } else if (tab === 'register') {
        await registerAccount(email, displayName, password);
        addToast({ title: 'Created local demo account', variant: 'success' });
        navigate('/app/overview');
      } else if (tab === 'reset') {
        await resetPasswordLocal(email, password);
        setResetSuccessMsg(
          'Local password hash updated in IndexedDB. No email was sent. You can now sign in.'
        );
        setTab('signin');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication action failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#090A0F] text-[#F3F4F6]">
      {/* Prototype Top Bar */}
      <header className="px-6 py-4 border-b border-[#1E2230] flex items-center justify-between gap-4">
        <Link to="/" className="flex items-center gap-2.5 font-bold text-[15px] text-[#F3F4F6]">
          <div className="w-7 h-7 rounded-md bg-[#4F46E5] flex items-center justify-center text-white font-mono text-xs font-bold">
            MC
          </div>
          <span>{APP_NAME}</span>
        </Link>
        <span className="font-mono text-xs text-[#8A94A6] truncate">
          {PROTOTYPE_BADGE_TEXT}
        </span>
      </header>

      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-lg bg-[#131620] border border-[#1E2230] overflow-hidden">
          {/* Explicit Honesty Banner (§7: "Local demo account — not a real login") */}
          <div className="px-5 py-3 bg-[#0E1017] border-b border-[#1E2230] flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 text-[#818CF8] font-medium">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>Local demo account — not a real login</span>
            </div>
            <span className="font-mono text-[11px] text-[#8A94A6]">PBKDF2-SHA256</span>
          </div>

          <div className="p-6 space-y-5">
            {/* Instant Demo Button (§7) */}
            <div className="p-4 rounded-lg bg-[#0E1017] border border-[#818CF8]/40 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#F3F4F6] flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-[#818CF8]" />
                  <span>Instant Demo Workspace</span>
                </span>
                <span className="font-mono text-[11px] text-[#10B981]">Pro Vault Seed</span>
              </div>
              <p className="text-xs text-[#8A94A6]">
                Skip typing and enter the pre-seeded workspace with 5 mounts and 36 sample files immediately.
              </p>
              <button
                type="button"
                disabled={submitting}
                onClick={handleInstantDemo}
                className="w-full py-2 px-4 rounded-md bg-[#4F46E5] hover:bg-[#4338CA] text-white text-xs font-medium flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <span>Launch Demo Workspace</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Auth Mode Tabs */}
            <div
              role="tablist"
              aria-label="Authentication mode"
              className="grid grid-cols-3 p-1 rounded-md bg-[#090A0F] border border-[#1E2230] text-xs font-medium"
            >
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'signin'}
                onClick={() => {
                  setTab('signin');
                  setError(null);
                }}
                className={`py-1.5 rounded ${
                  tab === 'signin'
                    ? 'bg-[#131620] text-[#F3F4F6]'
                    : 'text-[#8A94A6] hover:text-[#F3F4F6]'
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
                  setEmail('');
                  setDisplayName('');
                  setPassword('');
                  setError(null);
                }}
                className={`py-1.5 rounded ${
                  tab === 'register'
                    ? 'bg-[#131620] text-[#F3F4F6]'
                    : 'text-[#8A94A6] hover:text-[#F3F4F6]'
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
                className={`py-1.5 rounded ${
                  tab === 'reset'
                    ? 'bg-[#131620] text-[#F3F4F6]'
                    : 'text-[#8A94A6] hover:text-[#F3F4F6]'
                }`}
              >
                Reset password
              </button>
            </div>

            {resetSuccessMsg && (
              <div
                role="status"
                className="p-3 rounded bg-[#10B981]/15 border border-[#10B981]/40 text-xs text-[#10B981]"
              >
                {resetSuccessMsg}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="auth-email" className="block text-xs font-medium text-[#8A94A6] mb-1">
                  Email address (stored locally in IndexedDB)
                </label>
                <input
                  id="auth-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-3 py-2 rounded-md bg-[#0E1017] border border-[#1E2230] text-[13px] text-[#F3F4F6]"
                />
              </div>

              {tab === 'register' && (
                <div>
                  <label htmlFor="auth-name" className="block text-xs font-medium text-[#8A94A6] mb-1">
                    Display Name
                  </label>
                  <input
                    id="auth-name"
                    type="text"
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Alex Rivera"
                    className="w-full px-3 py-2 rounded-md bg-[#0E1017] border border-[#1E2230] text-[13px] text-[#F3F4F6]"
                  />
                </div>
              )}

              <div>
                <label htmlFor="auth-password" className="block text-xs font-medium text-[#8A94A6] mb-1">
                  {tab === 'reset' ? 'New Password (min 6 chars)' : 'Password'}
                </label>
                <input
                  id="auth-password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-md bg-[#0E1017] border border-[#1E2230] text-[13px] text-[#F3F4F6]"
                />
              </div>

              {tab === 'reset' && (
                <p className="text-xs text-[#8A94A6] bg-[#0E1017] border border-[#1E2230] p-2.5 rounded">
                  Local password reset checks that the email exists in this browser’s IndexedDB and updates its PBKDF2-SHA256 hash directly. <strong>No email is sent.</strong>
                </p>
              )}

              {error && (
                <p role="alert" className="text-xs text-[#F43F5E]">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2 px-4 rounded-md bg-[#1E2230] hover:bg-[#2D3348] text-[#F3F4F6] text-xs font-medium flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <KeyRound className="w-3.5 h-3.5 text-[#818CF8]" />
                <span>
                  {submitting
                    ? 'Deriving PBKDF2-SHA256 (600,000 iterations)…'
                    : tab === 'signin'
                    ? 'Sign in to local account'
                    : tab === 'register'
                    ? 'Create local demo account'
                    : 'Set new local password'}
                </span>
              </button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
