import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Cloud,
  CreditCard,
  HardDrive,
  RefreshCw,
  Upload,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ProviderLogo } from '../components/icons/ProviderLogo';
import { PROVIDER_KIND_META } from '../lib/constants';
import { formatBytes } from '../lib/format';
import {
  computeTransferQuotaUsage,
  getEffectivePlans,
  normalizePlanId,
} from '../lib/pricing';
import { storageOrchestrator } from '../storage/orchestrator';
import { computeMountUsedBytesMap, useVaultStore } from '../store/useVaultStore';

export function OverviewPage() {
  const nodes = useVaultStore((s) => s.nodes);
  const mounts = useVaultStore((s) => s.mounts);
  const activity = useVaultStore((s) => s.activity);
  const settings = useVaultStore((s) => s.settings);
  const openUploadModal = useVaultStore((s) => s.openUploadModal);
  const addToast = useVaultStore((s) => s.addToast);

  const [repinging, setRepinging] = useState(false);

  const mountUsageMap = useMemo(() => computeMountUsedBytesMap(nodes), [nodes]);

  const plans = useMemo(
    () => getEffectivePlans(settings.customPlans),
    [settings.customPlans]
  );
  const activePlanId = normalizePlanId(settings.subscription.planId);
  const currentPlan = plans[activePlanId];

  const quotaUsage = useMemo(
    () => computeTransferQuotaUsage(activity, currentPlan),
    [activity, currentPlan]
  );

  const connectedMounts = useMemo(
    () => mounts.filter((m) => m.status === 'connected'),
    [mounts]
  );

  const disconnectedMounts = useMemo(
    () => mounts.filter((m) => m.status !== 'connected'),
    [mounts]
  );

  const pingIssueMounts = useMemo(
    () =>
      mounts.filter(
        (m) =>
          m.status !== 'connected' ||
          (m.latencyMs !== null && m.latencyMs > 300)
      ),
    [mounts]
  );

  const hasPingOrNetworkWarning = pingIssueMounts.length > 0;

  const {
    totalAllocatedBytes,
    totalUsedBytes,
    totalFreeBytes,
    externalConnectedCount,
    totalExternalCount,
  } = useMemo(() => {
    let allocated = 0;
    let used = 0;

    for (const m of connectedMounts) {
      allocated += m.allocatedBytes;
      used += mountUsageMap.get(m.id)?.usedBytes ?? 0;
    }

    const extConnected = connectedMounts.filter((m) => m.id !== 'local-vault').length;
    const extTotal = mounts.filter((m) => m.id !== 'local-vault').length;

    return {
      totalAllocatedBytes: allocated,
      totalUsedBytes: used,
      totalFreeBytes: Math.max(0, allocated - used),
      externalConnectedCount: extConnected,
      totalExternalCount: extTotal,
    };
  }, [connectedMounts, mounts, mountUsageMap]);

  const overallUsageRatio = Math.min(
    1,
    totalUsedBytes / Math.max(1, totalAllocatedBytes)
  );

  const handleRepingAll = async () => {
    setRepinging(true);
    try {
      for (const m of mounts) {
        if (m.status === 'disconnected') {
          await storageOrchestrator.reconnectMount(m.id);
        } else {
          await storageOrchestrator.testMount(m);
        }
      }
      addToast({
        title: 'All storage mounts probed and verified',
        variant: 'success',
      });
    } catch (err) {
      addToast({
        title: 'Ping verification encountered an issue',
        description: err instanceof Error ? err.message : undefined,
        variant: 'warning',
      });
    } finally {
      setRepinging(false);
    }
  };

  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-7xl w-full mx-auto">
      {hasPingOrNetworkWarning && (
        <div
          role="alert"
          className="p-3.5 rounded-xl bg-[#FF9F0A]/15 border border-[#FF9F0A]/40 text-xs text-[#D97706] dark:text-[#FFD60A] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        >
          <div className="flex items-start sm:items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 sm:mt-0" />
            <div>
              <span className="font-bold">Storage Mount Connectivity Notice: </span>
              <span>
                {disconnectedMounts.length > 0
                  ? `${disconnectedMounts.length} mount(s) disconnected (${disconnectedMounts
                      .map((m) => m.name)
                      .join(', ')}). `
                  : ''}
                {pingIssueMounts.filter((m) => m.status === 'connected').length > 0
                  ? `Elevated latency detected on ${pingIssueMounts
                      .filter((m) => m.status === 'connected')
                      .map((m) => `${m.name} (${m.latencyMs} ms)`)
                      .join(', ')}.`
                  : ''}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={repinging}
              onClick={handleRepingAll}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#FF9F0A] text-black font-semibold hover:bg-[#D97706] disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${repinging ? 'animate-spin' : ''}`} />
              <span>Re-ping & Reconnect</span>
            </button>
            <Link
              to="/app/providers"
              className="px-2.5 py-1 rounded-lg bg-black/10 border border-[#FF9F0A]/40"
            >
              Inspect Mounts
            </Link>
          </div>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#1D1D1F] dark:text-[#F5F5F7] tracking-tight">
            Storage Overview
          </h1>
          <p className="text-xs text-[#6E6E73] dark:text-[#86868B] mt-0.5">
            Consolidated storage capacity and active connected cloud mounts.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to="/app/providers"
            className="px-3.5 py-2 rounded-xl bg-black/[0.04] dark:bg-white/[0.05] hover:bg-black/[0.08] border border-black/[0.08] dark:border-white/[0.1] text-xs font-medium text-[#1D1D1F] dark:text-[#F5F5F7] whitespace-nowrap"
          >
            Connect Cloud Account
          </Link>
          <button
            type="button"
            onClick={() => openUploadModal()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0071E3] hover:bg-[#0077ED] text-white text-xs font-semibold whitespace-nowrap"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Upload Files</span>
          </button>
        </div>
      </div>

      {/* High-Level Storage Specs (3 Clean Cards) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: External Storage Specs */}
        <div className="apple-card p-5 space-y-3">
          <div className="flex items-center justify-between text-xs text-[#6E6E73] dark:text-[#86868B]">
            <span className="font-semibold uppercase tracking-wider">Storage Capacity</span>
            <HardDrive className="w-4 h-4 text-[#0071E3]" />
          </div>
          <div>
            <p className="text-2xl font-bold font-mono text-[#1D1D1F] dark:text-[#F5F5F7] tabular-nums">
              {formatBytes(totalUsedBytes)}{' '}
              <span className="text-sm font-normal text-[#6E6E73] dark:text-[#86868B]">
                / {formatBytes(totalAllocatedBytes)}
              </span>
            </p>
            <p className="text-xs text-[#6E6E73] dark:text-[#86868B] font-mono mt-1 tabular-nums">
              {formatBytes(totalFreeBytes)} available across connected mounts
            </p>
          </div>
          <div className="w-full h-2 bg-black/[0.06] dark:bg-white/[0.08] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#0071E3] origin-left tv-transition"
              style={{ transform: `scaleX(${overallUsageRatio})` }}
            />
          </div>
        </div>

        {/* Card 2: Mounted Storages Summary */}
        <div className="apple-card p-5 space-y-3">
          <div className="flex items-center justify-between text-xs text-[#6E6E73] dark:text-[#86868B]">
            <span className="font-semibold uppercase tracking-wider">Mounted Storages</span>
            <Cloud className="w-4 h-4 text-[#28CD41]" />
          </div>
          <div>
            <p className="text-2xl font-bold font-mono text-[#1D1D1F] dark:text-[#F5F5F7] tabular-nums">
              {connectedMounts.length} Active Mounts
            </p>
            <p className="text-xs text-[#6E6E73] dark:text-[#86868B] font-mono mt-1 tabular-nums">
              1 Local Vault + {externalConnectedCount} Connected Cloud Account(s)
            </p>
          </div>
          <div className="flex items-center justify-between text-xs pt-2 border-t border-black/[0.06] dark:border-white/[0.08] font-mono text-[#6E6E73] dark:text-[#86868B]">
            <span>
              Plan Slot Usage: {totalExternalCount} / {currentPlan.maxMounts} clouds
            </span>
            <Link to="/app/providers" className="text-[#0071E3] hover:underline font-sans font-medium">
              Connect more
            </Link>
          </div>
        </div>

        {/* Card 3: Platform Subscription & Transfer Quota */}
        <div className="apple-card p-5 space-y-3">
          <div className="flex items-center justify-between text-xs text-[#6E6E73] dark:text-[#86868B]">
            <span className="font-semibold uppercase tracking-wider">
              Platform Plan ({currentPlan.name})
            </span>
            <CreditCard className="w-4 h-4 text-[#0071E3]" />
          </div>
          <div>
            <p className="text-2xl font-bold font-mono text-[#1D1D1F] dark:text-[#F5F5F7] tabular-nums">
              {formatBytes(quotaUsage.dailyRemainingBytes)}{' '}
              <span className="text-sm font-normal text-[#6E6E73] dark:text-[#86868B]">
                daily left
              </span>
            </p>
            <p className="text-xs text-[#6E6E73] dark:text-[#86868B] font-mono mt-1 tabular-nums">
              Monthly transfer quota: {formatBytes(quotaUsage.monthlyRemainingBytes)} left of{' '}
              {formatBytes(quotaUsage.monthlyLimitBytes)}
            </p>
          </div>
          <div className="flex items-center justify-between text-xs pt-2 border-t border-black/[0.06] dark:border-white/[0.08]">
            <span className="text-[#6E6E73] dark:text-[#86868B]">
              External capacity comes from your cloud providers
            </span>
            <Link
              to="/app/pricing"
              className="text-[#0071E3] hover:underline shrink-0 ml-2 font-medium"
            >
              Plans
            </Link>
          </div>
        </div>
      </div>

      {/* Connected Storage Provider Mounts Details */}
      <div className="apple-card p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-black/[0.06] dark:border-white/[0.08] pb-3.5">
          <div>
            <h2 className="text-sm font-bold text-[#1D1D1F] dark:text-[#F5F5F7]">
              Connected Storage Provider Mounts ({connectedMounts.length})
            </h2>
            <p className="text-xs text-[#6E6E73] dark:text-[#86868B] mt-0.5">
              Active connected storage mounts and their allocated capacity specifications.
            </p>
          </div>

          <Link
            to="/app/providers"
            className="text-xs text-[#0071E3] hover:underline inline-flex items-center gap-1 self-start sm:self-auto font-medium"
          >
            <span>Configure Storage Providers</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {connectedMounts.map((mount) => {
            const usage = mountUsageMap.get(mount.id) ?? { usedBytes: 0, fileCount: 0 };
            const freeBytes = Math.max(0, mount.allocatedBytes - usage.usedBytes);
            const ratio = Math.min(1, usage.usedBytes / Math.max(1, mount.allocatedBytes));
            const meta = PROVIDER_KIND_META[mount.kind];

            return (
              <div
                key={mount.id}
                className="p-4 rounded-xl bg-[#F5F5F7] dark:bg-[#0B0C10] border border-black/[0.06] dark:border-white/[0.08] space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-white dark:bg-[#15171E] border border-black/[0.06] dark:border-white/[0.08] flex items-center justify-center shrink-0">
                      <ProviderLogo kind={mount.kind} className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-[#1D1D1F] dark:text-[#F5F5F7] truncate">
                          {mount.name}
                        </span>
                        <span className="text-[11px] font-mono text-[#0071E3] bg-[#0071E3]/10 px-2 py-0.5 rounded">
                          {meta.shortLabel}
                        </span>
                      </div>
                      <p className="text-xs font-mono text-[#6E6E73] dark:text-[#86868B] mt-0.5 truncate">
                        {meta.label} · {mount.bucket ?? mount.endpoint} ({mount.region ?? 'global'})
                      </p>
                    </div>
                  </div>

                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#28CD41]/15 text-[#28CD41] font-mono text-[11px] shrink-0">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>Connected</span>
                  </span>
                </div>

                <div className="w-full h-2 bg-black/[0.06] dark:bg-white/[0.08] rounded-full overflow-hidden">
                  <div
                    className={`h-full origin-left tv-transition ${
                      ratio > 0.85 ? 'bg-[#FF9F0A]' : 'bg-[#0071E3]'
                    }`}
                    style={{ transform: `scaleX(${ratio})` }}
                  />
                </div>

                <div className="flex items-center justify-between text-xs font-mono text-[#6E6E73] dark:text-[#86868B] tabular-nums">
                  <span>
                    <strong className="text-[#1D1D1F] dark:text-[#F5F5F7]">
                      {formatBytes(usage.usedBytes)}
                    </strong>{' '}
                    used of{' '}
                    <strong className="text-[#1D1D1F] dark:text-[#F5F5F7]">
                      {formatBytes(mount.allocatedBytes)}
                    </strong>
                  </span>
                  <span>
                    {formatBytes(freeBytes)} free · {usage.fileCount} files
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
