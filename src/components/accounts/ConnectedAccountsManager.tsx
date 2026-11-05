import React, { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  ExternalLink,
  KeyRound,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Zap,
} from 'lucide-react';
import { startServerOAuthFlow } from '../../lib/oauth';
import { formatRelativeOrShortDate } from '../../lib/format';
import { useVaultStore } from '../../store/useVaultStore';
import type { ConnectedCloudAccount } from '../../types/domain';

const PROVIDER_DISPLAY_INFO: Record<
  string,
  { name: string; color: string; badgeBg: string; icon: string; docsUrl: string }
> = {
  gdrive: {
    name: 'Google Drive',
    color: 'text-emerald-400',
    badgeBg: 'bg-emerald-950/60 border-emerald-500/30 text-emerald-300',
    icon: '📁',
    docsUrl: 'https://developers.google.com/drive/api',
  },
  onedrive: {
    name: 'Microsoft OneDrive',
    color: 'text-sky-400',
    badgeBg: 'bg-sky-950/60 border-sky-500/30 text-sky-300',
    icon: '☁️',
    docsUrl: 'https://learn.microsoft.com/en-us/onedrive/developer/rest-api/',
  },
  dropbox: {
    name: 'Dropbox',
    color: 'text-blue-400',
    badgeBg: 'bg-blue-950/60 border-blue-500/30 text-blue-300',
    icon: '📦',
    docsUrl: 'https://www.dropbox.com/developers/documentation',
  },
  box: {
    name: 'Box Content Cloud',
    color: 'text-indigo-400',
    badgeBg: 'bg-indigo-950/60 border-indigo-500/30 text-indigo-300',
    icon: '📦',
    docsUrl: 'https://developer.box.com/reference/',
  },
  pcloud: {
    name: 'pCloud Storage',
    color: 'text-cyan-400',
    badgeBg: 'bg-cyan-950/60 border-cyan-500/30 text-cyan-300',
    icon: '☁️',
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
  const [showConnectModal, setShowConnectModal] = useState(false);

  const handleConnect = async (provider: string) => {
    setConnectingProvider(provider);
    try {
      const result = await startServerOAuthFlow(provider);
      await fetchConnectedAccounts();
      addToast({
        title: 'Cloud Account Linked',
        description: `Successfully authorized ${result.displayName} (${result.email || provider}) with server-side encrypted refresh tokens.`,
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
    const confirm = window.confirm(
      `Are you sure you want to disconnect ${account.displayName} (${account.email || account.provider})? This will revoke active tokens and delete encrypted credentials from the server.`
    );
    if (!confirm) return;

    setDisconnectingAccountId(account.id);
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
    <div className="bg-[#131620] border border-[#1E2230] rounded-xl p-6 shadow-xl mb-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-[#1E2230]">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-semibold text-gray-100">
              Connected Cloud Accounts & OAuth 2.0 PKCE
            </h2>
          </div>
          <p className="text-xs text-gray-400 mt-1 max-w-2xl">
            Directly connect your personal and organization cloud storage. Authorization codes are exchanged
            server-side; refresh tokens are encrypted at rest with AES-256-GCM.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => fetchConnectedAccounts()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-300 bg-[#1A1E2C] hover:bg-[#23283B] border border-[#272D3F] rounded-lg transition-colors"
            title="Refresh Account Status"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Sync Status</span>
          </button>

          <button
            type="button"
            onClick={() => setShowConnectModal(true)}
            className="inline-flex items-center gap-2 px-4 py-1.5 text-xs font-semibold text-emerald-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg shadow-sm transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Connect Account</span>
          </button>
        </div>
      </div>

      {/* Account List */}
      {connectedAccounts.length === 0 ? (
        <div className="py-12 text-center">
          <div className="w-12 h-12 rounded-full bg-emerald-950/40 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto mb-3">
            <Zap className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-medium text-gray-200">No Cloud Accounts Connected Yet</h3>
          <p className="text-xs text-gray-400 max-w-md mx-auto mt-1 mb-5">
            Click below to authenticate with Google Drive, Microsoft OneDrive, or Dropbox in 1-click.
            You will be redirected straight back after logging in.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => handleConnect('gdrive')}
              disabled={connectingProvider !== null}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium bg-[#1A1E2C] hover:bg-[#242A3D] border border-emerald-500/30 text-emerald-300 rounded-lg transition-all"
            >
              {connectingProvider === 'gdrive' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <span>📁</span>
              )}
              <span>Connect Google Drive</span>
            </button>
            <button
              type="button"
              onClick={() => handleConnect('onedrive')}
              disabled={connectingProvider !== null}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium bg-[#1A1E2C] hover:bg-[#242A3D] border border-sky-500/30 text-sky-300 rounded-lg transition-all"
            >
              {connectingProvider === 'onedrive' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <span>☁️</span>
              )}
              <span>Connect Microsoft OneDrive</span>
            </button>
            <button
              type="button"
              onClick={() => handleConnect('dropbox')}
              disabled={connectingProvider !== null}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium bg-[#1A1E2C] hover:bg-[#242A3D] border border-blue-500/30 text-blue-300 rounded-lg transition-all"
            >
              {connectingProvider === 'dropbox' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <span>📦</span>
              )}
              <span>Connect Dropbox</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-5">
          {connectedAccounts.map((acc) => {
            const info = PROVIDER_DISPLAY_INFO[acc.provider] || {
              name: acc.provider.toUpperCase(),
              color: 'text-gray-300',
              badgeBg: 'bg-gray-800 text-gray-300',
              icon: '☁️',
              docsUrl: '#',
            };
            const isRefreshing = refreshingAccountId === acc.id;
            const isDisconnecting = disconnectingAccountId === acc.id;

            return (
              <div
                key={acc.id}
                className="bg-[#0E1017] border border-[#1E2230] hover:border-[#2C3347] rounded-xl p-4 flex flex-col justify-between transition-all"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2.5">
                      <span className="text-xl">{info.icon}</span>
                      <div>
                        <h4 className="text-sm font-semibold text-gray-200">{info.name}</h4>
                        <p className="text-xs text-gray-400 font-mono truncate max-w-[180px]">
                          {acc.email || acc.displayName}
                        </p>
                      </div>
                    </div>

                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border ${
                        acc.status === 'active'
                          ? 'bg-emerald-950/60 border-emerald-500/30 text-emerald-300'
                          : acc.status === 'expired'
                          ? 'bg-amber-950/60 border-amber-500/30 text-amber-300'
                          : 'bg-red-950/60 border-red-500/30 text-red-300'
                      }`}
                    >
                      {acc.status === 'active' && <CheckCircle2 className="w-2.5 h-2.5 mr-1" />}
                      {acc.status === 'expired' && <Clock className="w-2.5 h-2.5 mr-1" />}
                      {acc.status === 'error' && <AlertCircle className="w-2.5 h-2.5 mr-1" />}
                      {acc.status.toUpperCase()}
                    </span>
                  </div>

                  {/* Scopes badge */}
                  <div className="space-y-1.5 mb-4 text-xs text-gray-400">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-gray-500">Token Status:</span>
                      <span className="text-gray-300 font-mono">
                        {formatExpiry(acc.tokenExpiresAt)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-gray-500">Last Synced:</span>
                      <span className="text-gray-300">
                        {acc.lastSyncedAt ? formatRelativeOrShortDate(acc.lastSyncedAt) : 'Just now'}
                      </span>
                    </div>

                    {acc.scopes && acc.scopes.length > 0 && (
                      <div className="pt-1">
                        <span className="text-[10px] text-gray-500 block mb-1">Granted Scopes:</span>
                        <div className="flex flex-wrap gap-1">
                          {acc.scopes.slice(0, 3).map((scope, idx) => {
                            const shortScope = scope.split('/').pop() || scope;
                            return (
                              <span
                                key={idx}
                                className="px-1.5 py-0.5 rounded bg-[#161924] border border-[#232839] text-[10px] text-gray-400 font-mono truncate max-w-[140px]"
                                title={scope}
                              >
                                {shortScope}
                              </span>
                            );
                          })}
                          {acc.scopes.length > 3 && (
                            <span className="text-[10px] text-gray-500 self-center">
                              +{acc.scopes.length - 3} more
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {acc.errorMessage && (
                      <p className="text-[11px] text-rose-400 mt-2 bg-rose-950/30 p-2 rounded border border-rose-500/20">
                        {acc.errorMessage}
                      </p>
                    )}
                  </div>
                </div>

                {/* Account Actions */}
                <div className="pt-3 border-t border-[#1C202E] flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleRefresh(acc)}
                      disabled={isRefreshing}
                      className="p-1.5 text-gray-400 hover:text-emerald-400 hover:bg-[#1A1E2C] rounded transition-colors"
                      title="Force Refresh Token"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleConnect(acc.provider)}
                      disabled={connectingProvider !== null}
                      className="px-2 py-1 text-[11px] font-medium text-gray-300 hover:text-gray-100 bg-[#161924] hover:bg-[#202536] border border-[#242A3D] rounded transition-colors"
                      title="Re-authorize with new scopes"
                    >
                      Reconnect
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleDisconnect(acc)}
                    disabled={isDisconnecting}
                    className="p-1.5 text-gray-500 hover:text-rose-400 hover:bg-rose-950/20 rounded transition-colors"
                    title="Disconnect and revoke"
                  >
                    {isDisconnecting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Connect Account Modal */}
      {showConnectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-[#131620] border border-[#1E2230] rounded-2xl w-full max-w-lg p-6 shadow-2xl relative">
            <div className="flex items-center justify-between pb-4 border-b border-[#1E2230] mb-5">
              <div className="flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-semibold text-gray-100">Connect Cloud Storage via OAuth</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowConnectModal(false)}
                className="text-gray-500 hover:text-gray-300 text-sm"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-gray-400 mb-5">
              Select your provider below to initiate 1-click OAuth 2.0 PKCE authentication. A secure popup
              window will open to authorize read/write access.
            </p>

            <div className="space-y-3">
              <button
                type="button"
                onClick={() => handleConnect('gdrive')}
                disabled={connectingProvider !== null}
                className="w-full flex items-center justify-between p-3.5 rounded-xl bg-[#0E1017] border border-[#1E2230] hover:border-emerald-500/40 hover:bg-[#161924] transition-all text-left group"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">📁</span>
                  <div>
                    <h4 className="text-sm font-semibold text-gray-200 group-hover:text-emerald-300">
                      Google Drive
                    </h4>
                    <p className="text-xs text-gray-400">Google Drive REST API v3 · Full file reading & writing</p>
                  </div>
                </div>
                {connectingProvider === 'gdrive' ? (
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                ) : (
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-emerald-950/60 text-emerald-400 border border-emerald-500/30">
                    Connect
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => handleConnect('onedrive')}
                disabled={connectingProvider !== null}
                className="w-full flex items-center justify-between p-3.5 rounded-xl bg-[#0E1017] border border-[#1E2230] hover:border-sky-500/40 hover:bg-[#161924] transition-all text-left group"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">☁️</span>
                  <div>
                    <h4 className="text-sm font-semibold text-gray-200 group-hover:text-sky-300">
                      Microsoft OneDrive
                    </h4>
                    <p className="text-xs text-gray-400">Microsoft Graph API · Personal & Business OneDrive</p>
                  </div>
                </div>
                {connectingProvider === 'onedrive' ? (
                  <Loader2 className="w-4 h-4 animate-spin text-sky-400" />
                ) : (
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-sky-950/60 text-sky-400 border border-sky-500/30">
                    Connect
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => handleConnect('dropbox')}
                disabled={connectingProvider !== null}
                className="w-full flex items-center justify-between p-3.5 rounded-xl bg-[#0E1017] border border-[#1E2230] hover:border-blue-500/40 hover:bg-[#161924] transition-all text-left group"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">📦</span>
                  <div>
                    <h4 className="text-sm font-semibold text-gray-200 group-hover:text-blue-300">
                      Dropbox
                    </h4>
                    <p className="text-xs text-gray-400">Dropbox API v2 · Multi-account personal & team sync</p>
                  </div>
                </div>
                {connectingProvider === 'dropbox' ? (
                  <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                ) : (
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-blue-950/60 text-blue-400 border border-blue-500/30">
                    Connect
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => handleConnect('box')}
                disabled={connectingProvider !== null}
                className="w-full flex items-center justify-between p-3.5 rounded-xl bg-[#0E1017] border border-[#1E2230] hover:border-indigo-500/40 hover:bg-[#161924] transition-all text-left group"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">📦</span>
                  <div>
                    <h4 className="text-sm font-semibold text-gray-200 group-hover:text-indigo-300">
                      Box
                    </h4>
                    <p className="text-xs text-gray-400">Box Content Cloud OAuth 2.0</p>
                  </div>
                </div>
                {connectingProvider === 'box' ? (
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                ) : (
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-indigo-950/60 text-indigo-400 border border-indigo-500/30">
                    Connect
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => handleConnect('pcloud')}
                disabled={connectingProvider !== null}
                className="w-full flex items-center justify-between p-3.5 rounded-xl bg-[#0E1017] border border-[#1E2230] hover:border-cyan-500/40 hover:bg-[#161924] transition-all text-left group"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">☁️</span>
                  <div>
                    <h4 className="text-sm font-semibold text-gray-200 group-hover:text-cyan-300">
                      pCloud
                    </h4>
                    <p className="text-xs text-gray-400">pCloud Storage Public OAuth API</p>
                  </div>
                </div>
                {connectingProvider === 'pcloud' ? (
                  <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                ) : (
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-cyan-950/60 text-cyan-400 border border-cyan-500/30">
                    Connect
                  </span>
                )}
              </button>
            </div>

            <div className="mt-5 pt-4 border-t border-[#1E2230] flex items-center justify-between text-xs text-gray-500">
              <span className="flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-emerald-400" />
                Tokens encrypted at rest
              </span>
              <button
                type="button"
                onClick={() => setShowConnectModal(false)}
                className="px-3 py-1.5 text-gray-400 hover:text-gray-200 text-xs"
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
