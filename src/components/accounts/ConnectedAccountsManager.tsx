import React, { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  KeyRound,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Zap,
} from 'lucide-react';
import { ProviderLogo } from '../icons/ProviderLogo';
import { startServerOAuthFlow } from '../../lib/oauth';
import { formatRelativeOrShortDate } from '../../lib/format';
import { useVaultStore } from '../../store/useVaultStore';
import type { ConnectedCloudAccount, ProviderKind } from '../../types/domain';

const PROVIDER_DISPLAY_INFO: Record<
  string,
  { name: string; kind: ProviderKind; docsUrl: string }
> = {
  gdrive: {
    name: 'Google Drive',
    kind: 'gdrive',
    docsUrl: 'https://developers.google.com/drive/api',
  },
  onedrive: {
    name: 'Microsoft OneDrive',
    kind: 'onedrive',
    docsUrl: 'https://learn.microsoft.com/en-us/onedrive/developer/rest-api/',
  },
  dropbox: {
    name: 'Dropbox',
    kind: 'dropbox',
    docsUrl: 'https://www.dropbox.com/developers/documentation',
  },
  box: {
    name: 'Box Content Cloud',
    kind: 'box',
    docsUrl: 'https://developer.box.com/reference/',
  },
  pcloud: {
    name: 'pCloud Storage',
    kind: 'pcloud',
    docsUrl: 'https://docs.pcloud.com/',
  },
};

export function ConnectedAccountsManager() {
  const connectedAccounts = useVaultStore((s) => s.connectedAccounts);
  const fetchConnectedAccounts = useVaultStore((s) => s.fetchConnectedAccounts);
  const disconnectCloudAccount = useVaultStore((s) => s.disconnectCloudAccount);
  const refreshCloudAccount = useVaultStore((s) => s.refreshCloudAccount);
  const addToast = useVaultStore((s) => s.addToast);

  const [connectingProvider, setConnectingProvider] = useState<string | null>(null);
  const [refreshingAccountId, setRefreshingAccountId] = useState<string | null>(null);
  const [disconnectingAccountId, setDisconnectingAccountId] = useState<string | null>(null);
  const [confirmDisconnectId, setConfirmDisconnectId] = useState<string | null>(null);
  const [showConnectModal, setShowConnectModal] = useState(false);

  const handleConnect = async (provider: string) => {
    setConnectingProvider(provider);
    try {
      const result = await startServerOAuthFlow(provider);
      await fetchConnectedAccounts();
      addToast({
        title: 'Cloud Account Linked',
        description: `Authorized ${result.displayName} (${result.email || provider}) with server-side encrypted refresh tokens.`,
        variant: 'success',
      });
      setShowConnectModal(false);
    } catch (err) {
      addToast({
        title: 'OAuth Connection Failed',
        description: err instanceof Error ? err.message : 'Failed to authorize cloud account.',
        variant: 'error',
      });
    } finally {
      setConnectingProvider(null);
    }
  };

  const handleRefresh = async (account: ConnectedCloudAccount) => {
    setRefreshingAccountId(account.id);
    try {
      await refreshCloudAccount(account.id);
    } finally {
      setRefreshingAccountId(null);
    }
  };

  const handleDisconnect = async (account: ConnectedCloudAccount) => {
    setDisconnectingAccountId(account.id);
    setConfirmDisconnectId(null);
    try {
      await disconnectCloudAccount(account.id);
    } finally {
      setDisconnectingAccountId(null);
    }
  };

  const formatExpiry = (expiresAt: number | null) => {
    if (!expiresAt) return 'Auto-refreshing';
    const remainingMs = expiresAt - Date.now();
    if (remainingMs <= 0) return 'Expired (will auto-refresh)';
    const minutes = Math.floor(remainingMs / 60000);
    if (minutes < 60) return `Expires in ${minutes}m`;
    const hours = Math.floor(minutes / 60);
    return `Expires in ${hours}h ${minutes % 60}m`;
  };

  return (
    <div className="apple-card p-6 mb-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-black/[0.06] dark:border-white/[0.08]">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[#28CD41]" />
            <h2 className="text-base font-bold text-[#1D1D1F] dark:text-[#F5F5F7]">
              Connected Cloud Accounts & OAuth 2.0 PKCE
            </h2>
          </div>
          <p className="text-xs text-[#6E6E73] dark:text-[#86868B] mt-1 max-w-2xl">
            Directly connect your personal and organization cloud storage. Authorization codes are
            exchanged server-side; refresh tokens are encrypted at rest with AES-256-GCM.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => fetchConnectedAccounts()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#1D1D1F] dark:text-[#F5F5F7] bg-[#F5F5F7] dark:bg-[#0B0C10] hover:bg-black/[0.06] border border-black/[0.08] dark:border-white/[0.1] rounded-xl tv-transition"
            title="Refresh Account Status"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Sync Status</span>
          </button>

          <button
            type="button"
            onClick={() => setShowConnectModal(true)}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-[#0071E3] hover:bg-[#0077ED] rounded-xl shadow-xs tv-transition"
          >
            <Plus className="w-4 h-4" />
            <span>Connect Account</span>
          </button>
        </div>
      </div>

      {/* Account List */}
      {connectedAccounts.length === 0 ? (
        <div className="py-10 text-center">
          <div className="w-11 h-11 rounded-2xl bg-[#0071E3]/10 text-[#0071E3] flex items-center justify-center mx-auto mb-3">
            <Zap className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-semibold text-[#1D1D1F] dark:text-[#F5F5F7]">
            No Cloud Accounts Connected Yet
          </h3>
          <p className="text-xs text-[#6E6E73] dark:text-[#86868B] max-w-md mx-auto mt-1 mb-5">
            Authenticate with Google Drive, Microsoft OneDrive, Dropbox, Box, or pCloud via OAuth 2.0 PKCE.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2.5">
            {(['gdrive', 'onedrive', 'dropbox', 'box', 'pcloud'] as const).map((p) => {
              const info = PROVIDER_DISPLAY_INFO[p];
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => handleConnect(p)}
                  disabled={connectingProvider !== null}
                  className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium bg-[#F5F5F7] dark:bg-[#0B0C10] hover:bg-black/[0.05] dark:hover:bg-white/[0.05] border border-black/[0.08] dark:border-white/[0.1] text-[#1D1D1F] dark:text-[#F5F5F7] rounded-xl tv-transition"
                >
                  {connectingProvider === p ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-[#0071E3]" />
                  ) : (
                    <ProviderLogo kind={info.kind} className="w-4 h-4" />
                  )}
                  <span>Connect {info.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-5">
          {connectedAccounts.map((acc) => {
            const info = PROVIDER_DISPLAY_INFO[acc.provider] || {
              name: acc.provider.toUpperCase(),
              kind: 's3' as ProviderKind,
              docsUrl: '#',
            };
            const isRefreshing = refreshingAccountId === acc.id;
            const isDisconnecting = disconnectingAccountId === acc.id;
            const isConfirming = confirmDisconnectId === acc.id;

            return (
              <div
                key={acc.id}
                className="bg-[#F5F5F7] dark:bg-[#0B0C10] border border-black/[0.06] dark:border-white/[0.08] rounded-xl p-4 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-white dark:bg-[#15171E] border border-black/[0.06] dark:border-white/[0.08] flex items-center justify-center shrink-0">
                        <ProviderLogo kind={info.kind} className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-[#1D1D1F] dark:text-[#F5F5F7]">
                          {info.name}
                        </h4>
                        <p className="text-xs text-[#6E6E73] dark:text-[#86868B] font-mono truncate max-w-[180px]">
                          {acc.email || acc.displayName}
                        </p>
                      </div>
                    </div>

                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold ${
                        acc.status === 'active'
                          ? 'bg-[#28CD41]/15 text-[#28CD41]'
                          : acc.status === 'expired'
                          ? 'bg-[#FF9F0A]/15 text-[#FF9F0A]'
                          : 'bg-[#FF3B30]/15 text-[#FF3B30]'
                      }`}
                    >
                      {acc.status === 'active' && <CheckCircle2 className="w-2.5 h-2.5 mr-1" />}
                      {acc.status === 'expired' && <Clock className="w-2.5 h-2.5 mr-1" />}
                      {acc.status === 'error' && <AlertCircle className="w-2.5 h-2.5 mr-1" />}
                      {acc.status.toUpperCase()}
                    </span>
                  </div>

                  <div className="space-y-1.5 mb-4 text-xs text-[#6E6E73] dark:text-[#86868B]">
                    <div className="flex items-center justify-between text-[11px]">
                      <span>Token Status:</span>
                      <span className="text-[#1D1D1F] dark:text-[#F5F5F7] font-mono">
                        {formatExpiry(acc.tokenExpiresAt)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px]">
                      <span>Last Synced:</span>
                      <span className="text-[#1D1D1F] dark:text-[#F5F5F7]">
                        {acc.lastSyncedAt ? formatRelativeOrShortDate(acc.lastSyncedAt) : 'Just now'}
                      </span>
                    </div>

                    {acc.errorMessage && (
                      <p className="text-[11px] text-[#FF3B30] mt-2 bg-[#FF3B30]/10 p-2 rounded-lg border border-[#FF3B30]/20">
                        {acc.errorMessage}
                      </p>
                    )}
                  </div>
                </div>

                {/* Account Actions */}
                <div className="pt-3 border-t border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleRefresh(acc)}
                      disabled={isRefreshing}
                      className="p-1.5 text-[#6E6E73] hover:text-[#0071E3] rounded-lg"
                      title="Force Refresh Token"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleConnect(acc.provider)}
                      disabled={connectingProvider !== null}
                      className="px-2.5 py-1 text-[11px] font-medium bg-white dark:bg-[#15171E] border border-black/[0.08] dark:border-white/[0.1] rounded-lg"
                    >
                      Reconnect
                    </button>
                  </div>

                  {isConfirming ? (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleDisconnect(acc)}
                        disabled={isDisconnecting}
                        className="px-2 py-1 rounded bg-[#FF3B30] text-white text-[10px] font-semibold"
                      >
                        Confirm Revoke
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDisconnectId(null)}
                        className="px-1.5 py-1 text-[10px] text-[#6E6E73]"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDisconnectId(acc.id)}
                      disabled={isDisconnecting}
                      className="p-1.5 text-[#6E6E73] hover:text-[#FF3B30] rounded-lg"
                      title="Disconnect and revoke"
                    >
                      {isDisconnecting ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Connect Account Modal */}
      {showConnectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="apple-card w-full max-w-lg p-6 relative">
            <div className="flex items-center justify-between pb-4 border-b border-black/[0.06] dark:border-white/[0.08] mb-4">
              <div className="flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-[#0071E3]" />
                <h3 className="text-base font-bold text-[#1D1D1F] dark:text-[#F5F5F7]">
                  Connect Cloud Storage via OAuth 2.0
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowConnectModal(false)}
                className="text-[#6E6E73] hover:text-[#1D1D1F] dark:hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-[#6E6E73] dark:text-[#86868B] mb-4">
              Select your provider below to initiate OAuth 2.0 PKCE authentication. State
              transactions are cryptographically signed and single-use.
            </p>

            <div className="space-y-2.5">
              {(['gdrive', 'onedrive', 'dropbox', 'box', 'pcloud'] as const).map((p) => {
                const info = PROVIDER_DISPLAY_INFO[p];
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => handleConnect(p)}
                    disabled={connectingProvider !== null}
                    className="w-full flex items-center justify-between p-3.5 rounded-xl bg-[#F5F5F7] dark:bg-[#0B0C10] border border-black/[0.08] dark:border-white/[0.1] hover:border-[#0071E3] text-left tv-transition"
                  >
                    <div className="flex items-center gap-3">
                      <ProviderLogo kind={info.kind} className="w-5 h-5" />
                      <div>
                        <h4 className="text-sm font-semibold text-[#1D1D1F] dark:text-[#F5F5F7]">
                          {info.name}
                        </h4>
                        <p className="text-xs text-[#6E6E73] dark:text-[#86868B]">
                          Official OAuth 2.0 REST API · Encrypted Refresh Token
                        </p>
                      </div>
                    </div>
                    {connectingProvider === p ? (
                      <Loader2 className="w-4 h-4 animate-spin text-[#0071E3]" />
                    ) : (
                      <span className="text-xs font-semibold px-3 py-1 rounded-lg bg-[#0071E3] text-white">
                        Connect
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="mt-5 pt-4 border-t border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between text-xs text-[#6E6E73]">
              <span className="flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-[#28CD41]" />
                Tokens encrypted at rest with AES-256-GCM
              </span>
              <button
                type="button"
                onClick={() => setShowConnectModal(false)}
                className="px-3 py-1.5 text-xs font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
