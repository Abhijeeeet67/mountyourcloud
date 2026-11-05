import {
  AlertTriangle,
  Check,
  Copy,
  Database,
  Globe,
  KeyRound,
  LogOut,
  Monitor,
  Moon,
  RotateCcw,
  Sliders,
  Sun,
  Trash2,
  User,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatBytes, formatFullTimestamp } from '../lib/format';
import { useVaultStore } from '../store/useVaultStore';
import type { FailureRatePercent, ThemePreference } from '../types/domain';

export function SettingsPage() {
  const navigate = useNavigate();
  const currentAccount = useVaultStore((s) => s.currentAccount);
  const settings = useVaultStore((s) => s.settings);
  const setTheme = useVaultStore((s) => s.setTheme);
  const usingMemoryFallback = useVaultStore((s) => s.usingMemoryFallback);
  const updateProfile = useVaultStore((s) => s.updateProfile);
  const updateDeveloperSettings = useVaultStore((s) => s.updateDeveloperSettings);
  const updateApiCredentials = useVaultStore((s) => s.updateApiCredentials);
  const generateDemoToken = useVaultStore((s) => s.generateDemoToken);
  const revokeDemoToken = useVaultStore((s) => s.revokeDemoToken);
  const resetSampleWorkspace = useVaultStore((s) => s.resetSampleWorkspace);
  const signOut = useVaultStore((s) => s.signOut);
  const addToast = useVaultStore((s) => s.addToast);

  const [displayName, setDisplayName] = useState(currentAccount?.displayName ?? '');
  const [tokenName, setTokenName] = useState('');
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [copiedTokenId, setCopiedTokenId] = useState<string | null>(null);

  const [gdriveClientId, setGdriveClientId] = useState(settings.apiCredentials?.gdriveClientId ?? '');
  const [gdriveToken, setGdriveToken] = useState(settings.apiCredentials?.gdriveToken ?? '');
  const [dropboxKey, setDropboxKey] = useState(settings.apiCredentials?.dropboxKey ?? '');
  const [onedriveClientId, setOnedriveClientId] = useState(settings.apiCredentials?.onedriveClientId ?? '');
  const [s3AccessKey, setS3AccessKey] = useState(settings.apiCredentials?.s3AccessKey ?? '');
  const [s3SecretKey, setS3SecretKey] = useState(settings.apiCredentials?.s3SecretKey ?? '');

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

  const handleCopyToken = async (id: string, text: string) => {
    let success = false;
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        success = true;
      } catch {
        // Fallback below
      }
    }
    if (!success) {
      try {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.select();
        success = document.execCommand('copy');
        document.body.removeChild(textArea);
      } catch {
        success = false;
      }
    }

    if (success) {
      setCopiedTokenId(id);
      setTimeout(() => setCopiedTokenId((curr) => (curr === id ? null : curr)), 2000);
      addToast({ title: 'Copied personal access token to clipboard', variant: 'success' });
    } else {
      addToast({ title: 'Failed to copy token to clipboard', variant: 'error' });
    }
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

  const handleCreateToken = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = await generateDemoToken(tokenName);
    setTokenName('');
    addToast({
      title: 'Generated personal access token',
      description: `Token ${val.slice(0, 14)}… created.`,
      variant: 'success',
    });
  };

  const currentTheme: ThemePreference = settings.theme ?? 'dark';

  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-4xl w-full mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-[#1D1D1F] dark:text-[#F5F5F7] tracking-tight">
          Workspace Settings
        </h1>
        <p className="text-xs text-[#6E6E73] dark:text-[#86868B] mt-0.5">
          Appearance, account identity, cloud API credentials, and storage diagnostics.
        </p>
      </div>

      {/* 0. Appearance & Theme Selector */}
      <section className="apple-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-[#1D1D1F] dark:text-[#F5F5F7]">
              Appearance & Theme
            </h2>
            <p className="text-xs text-[#6E6E73] dark:text-[#86868B] mt-0.5">
              Choose between Apple-inspired Light Mode, Dark Mode, or automatic system appearance.
            </p>
          </div>
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
        <div className="flex items-center gap-2">
          <User className="w-4 h-4 text-[#0071E3] dark:text-[#0A84FF]" />
          <h2 className="text-sm font-semibold text-[#1D1D1F] dark:text-[#F5F5F7]">
            Account Profile
          </h2>
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

          <div className="sm:col-span-2 flex justify-end">
            <button
              type="submit"
              className="px-4 py-1.5 rounded-lg bg-[#0071E3] hover:bg-[#0077ED] text-white text-xs font-medium"
            >
              Save Profile
            </button>
          </div>
        </form>
      </section>

      {/* 2. API Credentials & Live OAuth Configurator */}
      <section className="apple-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-[#28CD41]" />
            <h2 className="text-sm font-semibold text-[#1D1D1F] dark:text-[#F5F5F7]">
              Direct Cloud API Credentials & Overrides
            </h2>
          </div>
          <span className="text-[11px] font-mono text-[#28CD41] bg-[#28CD41]/10 px-2 py-0.5 rounded-md">
            Live Cloud Engine
          </span>
        </div>

        <p className="text-xs text-[#6E6E73] dark:text-[#86868B]">
          Server-managed OAuth 2.0 PKCE is recommended on the Cloud Providers page. You can also
          supply direct client tokens or S3/R2 keys below.
        </p>

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

      {/* 3. Developer Diagnostics Panel */}
      <section className="apple-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-[#0071E3] dark:text-[#0A84FF]" />
            <h2 className="text-sm font-semibold text-[#1D1D1F] dark:text-[#F5F5F7]">
              Network Resilience & Fault Testing
            </h2>
          </div>
        </div>

        <p className="text-xs text-[#6E6E73] dark:text-[#86868B]">
          Verify multipart upload exponential backoff (<code className="font-mono">500ms · 2^n</code>)
          and error recovery on sandbox mounts.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
          <div className="p-3.5 rounded-xl bg-[#F5F5F7] dark:bg-[#0B0C10] border border-black/[0.06] dark:border-white/[0.08] space-y-2">
            <span className="block text-xs font-medium text-[#1D1D1F] dark:text-[#F5F5F7]">
              Simulated Part Failure Rate
            </span>
            <div role="group" aria-label="Simulated failure rate" className="grid grid-cols-3 gap-2">
              {([0, 10, 50] as FailureRatePercent[]).map((rate) => {
                const active = settings.devSettings.failureRate === rate;
                return (
                  <button
                    key={rate}
                    type="button"
                    onClick={() => {
                      updateDeveloperSettings({ failureRate: rate });
                      addToast({
                        title: `Fault injection rate set to ${rate}%`,
                        variant: rate > 0 ? 'warning' : 'default',
                      });
                    }}
                    className={`py-1.5 rounded-lg text-xs font-mono font-medium border ${
                      active
                        ? 'bg-[#0071E3] border-[#0071E3] text-white'
                        : 'bg-white dark:bg-[#15171E] border-black/[0.08] dark:border-white/[0.08] text-[#6E6E73]'
                    }`}
                  >
                    {rate}%
                  </button>
                );
              })}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-[#F5F5F7] dark:bg-[#0B0C10] border border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-[#1D1D1F] dark:text-[#F5F5F7]">
                Offline Network Simulation
              </p>
              <p className="text-[11px] text-[#6E6E73] dark:text-[#86868B] mt-0.5">
                Tests retryable network errors
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings.devSettings.offline}
              onClick={() => {
                const next = !settings.devSettings.offline;
                updateDeveloperSettings({ offline: next });
                addToast({
                  title: next ? 'Offline simulation enabled' : 'Offline simulation disabled',
                  variant: next ? 'warning' : 'success',
                });
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium border ${
                settings.devSettings.offline
                  ? 'bg-[#FF3B30] border-[#FF3B30] text-white'
                  : 'bg-white dark:bg-[#15171E] border-black/[0.08] dark:border-white/[0.08] text-[#6E6E73]'
              }`}
            >
              {settings.devSettings.offline ? 'OFFLINE ON' : 'OFFLINE OFF'}
            </button>
          </div>
        </div>
      </section>

      {/* 4. Personal Access Tokens */}
      <section className="apple-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-[#0071E3] dark:text-[#0A84FF]" />
            <h2 className="text-sm font-semibold text-[#1D1D1F] dark:text-[#F5F5F7]">
              CLI & Automation Tokens
            </h2>
          </div>
        </div>

        <form onSubmit={handleCreateToken} className="flex items-center gap-2">
          <input
            type="text"
            value={tokenName}
            onChange={(e) => setTokenName(e.target.value)}
            placeholder="Token label (e.g. Rclone Sync Script)"
            aria-label="Token name"
            className="flex-1 px-3.5 py-2 rounded-xl bg-[#F5F5F7] dark:bg-[#0B0C10] border border-black/[0.08] dark:border-white/[0.1] text-[13px]"
          />
          <button
            type="submit"
            className="px-4 py-2 rounded-xl bg-[#0071E3] hover:bg-[#0077ED] text-white text-xs font-medium whitespace-nowrap"
          >
            Generate Token
          </button>
        </form>

        <div className="divide-y divide-black/[0.06] dark:divide-white/[0.08] border border-black/[0.06] dark:border-white/[0.08] rounded-xl bg-[#F5F5F7] dark:bg-[#0B0C10]">
          {settings.demoTokens.length === 0 ? (
            <p className="p-4 text-xs text-[#6E6E73] dark:text-[#86868B] text-center">
              No personal access tokens generated.
            </p>
          ) : (
            settings.demoTokens.map((tok) => (
              <div
                key={tok.id}
                className="px-4 py-3 flex items-center justify-between gap-3 text-xs"
              >
                <div className="min-w-0">
                  <span className="font-medium text-[#1D1D1F] dark:text-[#F5F5F7]">
                    {tok.name}
                  </span>
                  <p className="font-mono text-[#6E6E73] dark:text-[#86868B] mt-0.5 truncate tabular-nums">
                    {tok.tokenValue} · Created {formatFullTimestamp(tok.createdAt)}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleCopyToken(tok.id, tok.tokenValue)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white dark:bg-[#15171E] border border-black/[0.08] dark:border-white/[0.08]"
                  >
                    {copiedTokenId === tok.id ? (
                      <>
                        <Check className="w-3 h-3 text-[#28CD41]" />
                        <span className="text-[#28CD41]">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await revokeDemoToken(tok.id);
                      addToast({ title: `Revoked token "${tok.name}"`, variant: 'default' });
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white dark:bg-[#15171E] border border-black/[0.08] dark:border-white/[0.08] text-[#FF3B30]"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Revoke</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* 5. Browser Storage Status & Workspace Reset / Sign Out */}
      <section className="apple-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-[#0071E3] dark:text-[#0A84FF]" />
          <h2 className="text-sm font-semibold text-[#1D1D1F] dark:text-[#F5F5F7]">
            Local Vault & Session Controls
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-xs tabular-nums">
          <div className="p-3.5 rounded-xl bg-[#F5F5F7] dark:bg-[#0B0C10] border border-black/[0.06] dark:border-white/[0.08]">
            <p className="text-[#6E6E73] dark:text-[#86868B] font-sans">Database Engine</p>
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
          <button
            type="button"
            onClick={() => setConfirmResetOpen(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#FF9F0A]/12 hover:bg-[#FF9F0A]/20 border border-[#FF9F0A]/30 text-xs font-medium text-[#D97706] dark:text-[#FFD60A]"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Local Sample Data</span>
          </button>

          <button
            type="button"
            onClick={async () => {
              await signOut();
              navigate('/auth');
            }}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#FF3B30]/12 hover:bg-[#FF3B30]/20 border border-[#FF3B30]/30 text-xs font-medium text-[#FF3B30]"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign out</span>
          </button>
        </div>
      </section>

      {confirmResetOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reset-modal-title"
          onKeyDown={(e) => {
            if (e.key === 'Escape') setConfirmResetOpen(false);
          }}
        >
          <div className="w-full max-w-md apple-card p-5 space-y-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-[#FF9F0A] shrink-0 mt-0.5" />
              <div>
                <h2
                  id="reset-modal-title"
                  className="text-sm font-semibold text-[#1D1D1F] dark:text-[#F5F5F7]"
                >
                  Reset local sample data?
                </h2>
                <p className="text-xs text-[#6E6E73] dark:text-[#86868B] mt-1 leading-relaxed">
                  This resets the local IndexedDB files and folders back to the initial workspace
                  state while preserving your account and connected OAuth clouds.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={resetting}
                onClick={() => setConfirmResetOpen(false)}
                className="px-3.5 py-1.5 rounded-lg border border-black/[0.08] dark:border-white/[0.1] text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={resetting}
                onClick={async () => {
                  setResetting(true);
                  await resetSampleWorkspace();
                  setResetting(false);
                  setConfirmResetOpen(false);
                  addToast({
                    title: 'Workspace reset to initial sample data',
                    variant: 'success',
                  });
                }}
                className="px-4 py-1.5 rounded-lg bg-[#FF9F0A] hover:bg-[#D97706] text-black text-xs font-semibold disabled:opacity-50"
              >
                {resetting ? 'Resetting…' : 'Reset Data'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
