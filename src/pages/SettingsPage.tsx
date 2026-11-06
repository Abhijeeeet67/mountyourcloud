import {
  AlertTriangle,
  Check,
  Copy,
  Database,
  Download,
  Globe,
  LogOut,
  Monitor,
  Moon,
  ShieldCheck,
  Sun,
  Trash2,
  User,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { formatBytes } from '../lib/format';
import { isSupabaseConfigured } from '../lib/supabase';
import { useVaultStore } from '../store/useVaultStore';
import type { ThemePreference } from '../types/domain';

export function SettingsPage() {
  const navigate = useNavigate();
  const currentAccount = useVaultStore((s) => s.currentAccount);
  const isAdmin = useVaultStore((s) => s.isAdmin);
  const settings = useVaultStore((s) => s.settings);
  const setTheme = useVaultStore((s) => s.setTheme);
  const usingMemoryFallback = useVaultStore((s) => s.usingMemoryFallback);
  const updateProfile = useVaultStore((s) => s.updateProfile);
  const updateApiCredentials = useVaultStore((s) => s.updateApiCredentials);
  const exportLocalWorkspaceData = useVaultStore((s) => s.exportLocalWorkspaceData);
  const deleteUserAccount = useVaultStore((s) => s.deleteUserAccount);
  const signOut = useVaultStore((s) => s.signOut);
  const addToast = useVaultStore((s) => s.addToast);

  const [displayName, setDisplayName] = useState(currentAccount?.displayName ?? '');
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [copiedRedirectUri, setCopiedRedirectUri] = useState(false);

  const [gdriveClientId, setGdriveClientId] = useState(settings.apiCredentials?.gdriveClientId ?? '');
  const [gdriveToken, setGdriveToken] = useState(settings.apiCredentials?.gdriveToken ?? '');
  const [dropboxKey, setDropboxKey] = useState(settings.apiCredentials?.dropboxKey ?? '');
  const [onedriveClientId, setOnedriveClientId] = useState(settings.apiCredentials?.onedriveClientId ?? '');
  const [s3AccessKey, setS3AccessKey] = useState(settings.apiCredentials?.s3AccessKey ?? '');
  const [s3SecretKey, setS3SecretKey] = useState(settings.apiCredentials?.s3SecretKey ?? '');

  const oauthRedirectUri = `${window.location.origin}/api/oauth/callback`;

  const handleSaveApiCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateApiCredentials({
      gdriveClientId: gdriveClientId.trim(),
      gdriveToken: gdriveToken.trim(),
      dropboxKey: dropboxKey.trim(),
      onedriveClientId: onedriveClientId.trim(),
      s3AccessKey: s3AccessKey.trim(),
      s3SecretKey: s3SecretKey.trim(),
    });
    addToast({ title: 'Cloud API Credentials saved to workspace vault', variant: 'success' });
  };

  const [storageEstimate, setStorageEstimate] = useState<{
    usage: number;
    quota: number;
    persisted: boolean;
  } | null>(null);

  useEffect(() => {
    setDisplayName(currentAccount?.displayName ?? '');
  }, [currentAccount]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const est = (await navigator.storage?.estimate?.()) ?? { usage: 0, quota: 0 };
        const persisted = (await navigator.storage?.persisted?.()) ?? false;
        if (!cancelled) {
          setStorageEstimate({
            usage: est.usage ?? 0,
            quota: est.quota ?? 0,
            persisted,
          });
        }
      } catch {
        if (!cancelled) {
          setStorageEstimate({ usage: 0, quota: 0, persisted: false });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [settings]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateProfile(displayName);
      addToast({ title: 'Updated workspace profile', variant: 'success' });
    } catch (err) {
      addToast({
        title: 'Could not update profile',
        description: err instanceof Error ? err.message : undefined,
        variant: 'error',
      });
    }
  };

  const handleExportData = async () => {
    try {
      await exportLocalWorkspaceData();
    } catch (err) {
      addToast({
        title: 'Export failed',
        description: err instanceof Error ? err.message : undefined,
        variant: 'error',
      });
    }
  };

  const currentTheme: ThemePreference = settings.theme ?? 'dark';

  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-4xl w-full mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#1D1D1F] dark:text-[#F5F5F7] tracking-tight">
            Workspace Settings
          </h1>
          <p className="text-xs text-[#6E6E73] dark:text-[#86868B] mt-0.5">
            Appearance, account identity, OAuth endpoints, data export, and security controls.
          </p>
        </div>

        {isAdmin && (
          <Link
            to="/app/admin"
            className="px-3.5 py-2 rounded-xl bg-[#0071E3] text-white text-xs font-semibold inline-flex items-center gap-1.5 self-start sm:self-auto"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Open Owner Admin Console</span>
          </Link>
        )}
      </div>

      {/* 0. Appearance & Theme Selector */}
      <section className="apple-card p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-[#1D1D1F] dark:text-[#F5F5F7]">
            Appearance & Theme
          </h2>
          <p className="text-xs text-[#6E6E73] dark:text-[#86868B] mt-0.5">
            Choose between Apple-inspired Light Mode, Dark Mode, or automatic system appearance.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {(
            [
              { id: 'light', label: 'Light', icon: Sun },
              { id: 'dark', label: 'Dark', icon: Moon },
              { id: 'system', label: 'System', icon: Monitor },
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            const isSelected = currentTheme === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTheme(item.id)}
                className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-medium border tv-transition ${
                  isSelected
                    ? 'bg-[#0071E3] text-white border-[#0071E3] shadow-xs'
                    : 'bg-[#F5F5F7] dark:bg-[#0B0C10] text-[#1D1D1F] dark:text-[#F5F5F7] border-black/[0.08] dark:border-white/[0.08] hover:border-[#0071E3]/50'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* 1. Profile Settings */}
      <section className="apple-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-[#0071E3] dark:text-[#0A84FF]" />
            <h2 className="text-sm font-semibold text-[#1D1D1F] dark:text-[#F5F5F7]">
              Account Profile
            </h2>
          </div>
          <span className="text-[11px] font-mono text-[#6E6E73] dark:text-[#86868B]">
            {isSupabaseConfigured ? 'Supabase Auth Active' : 'Authenticated Session'}
          </span>
        </div>

        <form onSubmit={handleSaveProfile} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="profile-name"
              className="block text-xs font-medium text-[#6E6E73] dark:text-[#86868B] mb-1"
            >
              Display Name
            </label>
            <input
              id="profile-name"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl bg-[#F5F5F7] dark:bg-[#0B0C10] border border-black/[0.08] dark:border-white/[0.1] text-[13px] text-[#1D1D1F] dark:text-[#F5F5F7]"
            />
          </div>

          <div>
            <label
              htmlFor="profile-email"
              className="block text-xs font-medium text-[#6E6E73] dark:text-[#86868B] mb-1"
            >
              Account Email
            </label>
            <input
              id="profile-email"
              type="email"
              disabled
              value={currentAccount?.email ?? ''}
              className="w-full px-3.5 py-2 rounded-xl bg-black/[0.04] dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.06] text-[13px] text-[#6E6E73] dark:text-[#86868B] font-mono cursor-not-allowed"
            />
          </div>

          <div className="sm:col-span-2 flex items-center justify-between pt-1">
            <span className="text-[11px] font-mono text-[#6E6E73] dark:text-[#86868B]">
              User ID: {currentAccount?.id}
            </span>
            <button
              type="submit"
              className="px-4 py-1.5 rounded-lg bg-[#0071E3] hover:bg-[#0077ED] text-white text-xs font-medium"
            >
              Save Profile
            </button>
          </div>
        </form>
      </section>

      {/* 2. OAuth Callback & Direct Cloud API Overrides */}
      <section className="apple-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-[#28CD41]" />
            <h2 className="text-sm font-semibold text-[#1D1D1F] dark:text-[#F5F5F7]">
              OAuth 2.0 Redirect URI & Direct Cloud Credentials
            </h2>
          </div>
          <span className="text-[11px] font-mono text-[#28CD41] bg-[#28CD41]/10 px-2 py-0.5 rounded-md">
            Live Cloud Engine
          </span>
        </div>

        <div className="p-3.5 rounded-xl bg-[#F5F5F7] dark:bg-[#0B0C10] border border-black/[0.06] dark:border-white/[0.08] space-y-1.5">
          <span className="block text-xs font-medium text-[#1D1D1F] dark:text-[#F5F5F7]">
            Authorized OAuth Redirect URI (Google, OneDrive, Dropbox, Box, pCloud)
          </span>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={oauthRedirectUri}
              className="flex-1 px-3 py-1.5 rounded-lg bg-white dark:bg-[#15171E] border border-black/[0.08] dark:border-white/[0.1] text-xs font-mono"
            />
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard?.writeText(oauthRedirectUri);
                setCopiedRedirectUri(true);
                setTimeout(() => setCopiedRedirectUri(false), 2000);
                addToast({ title: 'Copied OAuth Redirect URI', variant: 'success' });
              }}
              className="px-3 py-1.5 rounded-lg bg-[#0071E3] text-white text-xs font-medium inline-flex items-center gap-1"
            >
              {copiedRedirectUri ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedRedirectUri ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
        </div>

        <form onSubmit={handleSaveApiCredentials} className="space-y-4 pt-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="gdrive-client-id"
                className="block text-xs font-medium text-[#6E6E73] dark:text-[#86868B] mb-1"
              >
                Google Drive OAuth Client ID
              </label>
              <input
                id="gdrive-client-id"
                type="text"
                placeholder="apps.googleusercontent.com"
                value={gdriveClientId}
                onChange={(e) => setGdriveClientId(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-[#F5F5F7] dark:bg-[#0B0C10] border border-black/[0.08] dark:border-white/[0.1] text-[13px] font-mono"
              />
            </div>

            <div>
              <label
                htmlFor="gdrive-token"
                className="block text-xs font-medium text-[#6E6E73] dark:text-[#86868B] mb-1"
              >
                Google Drive Access Token (Optional Override)
              </label>
              <input
                id="gdrive-token"
                type="password"
                placeholder="ya29.a0Ac..."
                value={gdriveToken}
                onChange={(e) => setGdriveToken(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-[#F5F5F7] dark:bg-[#0B0C10] border border-black/[0.08] dark:border-white/[0.1] text-[13px] font-mono"
              />
            </div>

            <div>
              <label
                htmlFor="dropbox-key"
                className="block text-xs font-medium text-[#6E6E73] dark:text-[#86868B] mb-1"
              >
                Dropbox App Key / Client ID
              </label>
              <input
                id="dropbox-key"
                type="text"
                placeholder="dropbox-app-key"
                value={dropboxKey}
                onChange={(e) => setDropboxKey(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-[#F5F5F7] dark:bg-[#0B0C10] border border-black/[0.08] dark:border-white/[0.1] text-[13px] font-mono"
              />
            </div>

            <div>
              <label
                htmlFor="onedrive-client-id"
                className="block text-xs font-medium text-[#6E6E73] dark:text-[#86868B] mb-1"
              >
                Microsoft OneDrive / Graph Client ID
              </label>
              <input
                id="onedrive-client-id"
                type="text"
                placeholder="azure-app-client-id"
                value={onedriveClientId}
                onChange={(e) => setOnedriveClientId(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-[#F5F5F7] dark:bg-[#0B0C10] border border-black/[0.08] dark:border-white/[0.1] text-[13px] font-mono"
              />
            </div>

            <div>
              <label
                htmlFor="s3-access-key"
                className="block text-xs font-medium text-[#6E6E73] dark:text-[#86868B] mb-1"
              >
                AWS S3 / Cloudflare R2 Access Key ID
              </label>
              <input
                id="s3-access-key"
                type="text"
                placeholder="AKIA... or R2 token ID"
                value={s3AccessKey}
                onChange={(e) => setS3AccessKey(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-[#F5F5F7] dark:bg-[#0B0C10] border border-black/[0.08] dark:border-white/[0.1] text-[13px] font-mono"
              />
            </div>

            <div>
              <label
                htmlFor="s3-secret-key"
                className="block text-xs font-medium text-[#6E6E73] dark:text-[#86868B] mb-1"
              >
                AWS S3 / Cloudflare R2 Secret Access Key
              </label>
              <input
                id="s3-secret-key"
                type="password"
                placeholder="Secret key..."
                value={s3SecretKey}
                onChange={(e) => setS3SecretKey(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-[#F5F5F7] dark:bg-[#0B0C10] border border-black/[0.08] dark:border-white/[0.1] text-[13px] font-mono"
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              className="px-4 py-1.5 rounded-lg bg-[#0071E3] hover:bg-[#0077ED] text-white text-xs font-medium"
            >
              Save Cloud API Credentials
            </button>
          </div>
        </form>
      </section>

      {/* 3. Data Portability, Storage Diagnostics & Account Deletion */}
      <section className="apple-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-[#0071E3] dark:text-[#0A84FF]" />
          <h2 className="text-sm font-semibold text-[#1D1D1F] dark:text-[#F5F5F7]">
            Data Portability, Local Vault Cache & Account Controls
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-xs tabular-nums">
          <div className="p-3.5 rounded-xl bg-[#F5F5F7] dark:bg-[#0B0C10] border border-black/[0.06] dark:border-white/[0.08]">
            <p className="text-[#6E6E73] dark:text-[#86868B] font-sans">Local Cache Engine</p>
            <p className="text-[#1D1D1F] dark:text-[#F5F5F7] font-semibold mt-1">
              {usingMemoryFallback ? 'In-Memory Fallback' : 'IndexedDB (mountyourclouds_db)'}
            </p>
          </div>
          <div className="p-3.5 rounded-xl bg-[#F5F5F7] dark:bg-[#0B0C10] border border-black/[0.06] dark:border-white/[0.08]">
            <p className="text-[#6E6E73] dark:text-[#86868B] font-sans">Local Cache Usage</p>
            <p className="text-[#1D1D1F] dark:text-[#F5F5F7] font-semibold mt-1">
              {storageEstimate
                ? `${formatBytes(storageEstimate.usage)} / ${formatBytes(storageEstimate.quota)}`
                : 'Calculating…'}
            </p>
          </div>
          <div className="p-3.5 rounded-xl bg-[#F5F5F7] dark:bg-[#0B0C10] border border-black/[0.06] dark:border-white/[0.08]">
            <p className="text-[#6E6E73] dark:text-[#86868B] font-sans">Persistent Storage</p>
            <p className="text-[#1D1D1F] dark:text-[#F5F5F7] font-semibold mt-1">
              {storageEstimate ? (storageEstimate.persisted ? 'Granted' : 'Best-effort') : '—'}
            </p>
          </div>
        </div>

        <div className="pt-3 border-t border-black/[0.06] dark:border-white/[0.08] flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleExportData}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#F5F5F7] dark:bg-[#0B0C10] hover:bg-black/[0.06] border border-black/[0.08] dark:border-white/[0.1] text-xs font-medium text-[#1D1D1F] dark:text-[#F5F5F7]"
            >
              <Download className="w-3.5 h-3.5 text-[#0071E3]" />
              <span>Export Workspace Metadata (JSON)</span>
            </button>

            <button
              type="button"
              onClick={() => setConfirmDeleteOpen(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#FF3B30]/10 hover:bg-[#FF3B30]/15 border border-[#FF3B30]/30 text-xs font-medium text-[#FF3B30]"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Account</span>
            </button>
          </div>

          <button
            type="button"
            onClick={async () => {
              await signOut();
              navigate('/auth');
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-black/[0.05] dark:bg-white/[0.06] hover:bg-black/[0.1] text-xs font-medium text-[#1D1D1F] dark:text-[#F5F5F7]"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign out</span>
          </button>
        </div>
      </section>

      {confirmDeleteOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-account-modal-title"
          onKeyDown={(e) => {
            if (e.key === 'Escape') setConfirmDeleteOpen(false);
          }}
        >
          <div className="w-full max-w-md apple-card p-6 space-y-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-[#FF3B30] shrink-0 mt-0.5" />
              <div>
                <h2
                  id="delete-account-modal-title"
                  className="text-sm font-semibold text-[#1D1D1F] dark:text-[#F5F5F7]"
                >
                  Permanently delete your MountYourClouds account?
                </h2>
                <p className="text-xs text-[#6E6E73] dark:text-[#86868B] mt-1 leading-relaxed">
                  This will revoke all encrypted server-side OAuth tokens, disconnect linked cloud
                  accounts, and delete your account profile. Files stored inside your external
                  Google Drive, OneDrive, Dropbox, or S3 accounts will remain untouched.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setConfirmDeleteOpen(false)}
                className="px-3.5 py-1.5 rounded-lg border border-black/[0.08] dark:border-white/[0.1] text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={async () => {
                  setDeleting(true);
                  await deleteUserAccount();
                  setDeleting(false);
                  setConfirmDeleteOpen(false);
                  navigate('/');
                }}
                className="px-4 py-1.5 rounded-lg bg-[#FF3B30] text-white text-xs font-semibold disabled:opacity-50"
              >
                {deleting ? 'Deleting…' : 'Delete Account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
