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

  // Filter strictly to connected mounts for the Overview list
  const connectedMounts = useMemo(
    () => mounts.filter((m) => m.status === 'connected'),
    [mounts]
  );

  const disconnectedMounts = useMemo(
    () => mounts.filter((m) => m.status !== 'connected'),
    [mounts]
  );

  // Detect any ping / latency / connectivity issues for the warning bar ONLY
  const pingIssueMounts = useMemo(
    () =>
      mounts.filter(
        (m) =>
          m.status !== 'connected' ||
          (m.latencyMs !== null && m.latencyMs > 110)
      ),
    [mounts]
  );

  const hasPingOrNetworkWarning =
    pingIssueMounts.length > 0 ||
    settings.devSettings.offline ||
    settings.devSettings.failureRate > 0;

  // High-level storage specs
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
    <div className="p-4 lg:p-6 space-y-6 max-w-7xl w-full mx-auto">
      {/* Ping / Connectivity Warning Bar — Displayed ONLY when ping or connection issues exist */}
      {hasPingOrNetworkWarning && (
        <div
          role="alert"
          className="p-3.5 rounded-lg bg-[#F59E0B]/15 border border-[#F59E0B]/40 text-xs text-[#F59E0B] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        >
          <div className="flex items-start sm:items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 sm:mt-0" />
            <div>
              <span className="font-bold">Storage Mount Ping / Connectivity Warning: </span>
              <span>
                {settings.devSettings.offline
                  ? 'Offline simulation is active — remote cloud handshakes are unreachable. '
                  : ''}
                {settings.devSettings.failureRate > 0
                  ? `Simulated network fault rate is set to ${settings.devSettings.failureRate}%. `
                  : ''}
                {disconnectedMounts.length > 0
                  ? `${disconnectedMounts.length} mount(s) disconnected (${disconnectedMounts
                      .map((m) => m.name)
                      .join(', ')}) and hidden from active overview. `
                  : ''}
                {pingIssueMounts.filter((m) => m.status === 'connected').length > 0
                  ? `Elevated ping latency detected on ${pingIssueMounts
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
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#F59E0B] text-black font-semibold hover:bg-[#D97706] disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${repinging ? 'animate-spin' : ''}`} />
              <span>Re-ping & Reconnect</span>
            </button>
            <Link
              to="/app/providers"
              className="px-2.5 py-1 rounded bg-[#090A0F]/60 border border-[#F59E0B]/40 text-[#F59E0B] hover:text-white"
            >
              Inspect Mounts
            </Link>
          </div>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#F3F4F6]">Storage Overview</h1>
          <p className="text-xs text-[#8A94A6] mt-0.5">
            Consolidated storage specifications and active connected cloud mounts.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to="/app/providers"
            className="px-3 py-1.5 rounded-md bg-[#131620] hover:bg-[#1E2230] border border-[#1E2230] text-xs font-medium text-[#F3F4F6] whitespace-nowrap"
          >
            Add / Manage Mounts
          </Link>
          <button
            type="button"
            onClick={() => openUploadModal()}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-[#4F46E5] hover:bg-[#4338CA] text-white text-xs font-medium whitespace-nowrap"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Upload Files</span>
          </button>
        </div>
      </div>

      {/* High-Level Storage Specs (3 Clean Cards) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: External Storage Specs */}
        <div className="p-5 rounded-lg bg-[#131620] border border-[#1E2230] space-y-3">
          <div className="flex items-center justify-between text-xs text-[#8A94A6]">
            <span className="font-medium uppercase tracking-wider">Storage Specs (Connected)</span>
            <HardDrive className="w-4 h-4 text-[#818CF8]" />
          </div>
          <div>
            <p className="text-2xl font-bold font-mono text-[#F3F4F6] tabular-nums">
              {formatBytes(totalUsedBytes)}{' '}
              <span className="text-sm font-normal text-[#8A94A6]">
                / {formatBytes(totalAllocatedBytes)}
              </span>
            </p>
            <p className="text-xs text-[#8A94A6] font-mono mt-1 tabular-nums">
              {formatBytes(totalFreeBytes)} available across connected mounts
            </p>
          </div>
          <div className="w-full h-2 bg-[#090A0F] rounded-full overflow-hidden border border-[#1E2230]">
            <div
              className="h-full bg-[#4F46E5] origin-left tv-transition"
              style={{ transform: `scaleX(${overallUsageRatio})` }}
            />
          </div>
        </div>

        {/* Card 2: Mounted Storages Summary */}
        <div className="p-5 rounded-lg bg-[#131620] border border-[#1E2230] space-y-3">
          <div className="flex items-center justify-between text-xs text-[#8A94A6]">
            <span className="font-medium uppercase tracking-wider">Mounted Storages</span>
            <Cloud className="w-4 h-4 text-[#10B981]" />
          </div>
          <div>
            <p className="text-2xl font-bold font-mono text-[#F3F4F6] tabular-nums">
              {connectedMounts.length} Active Mounts
            </p>
            <p className="text-xs text-[#8A94A6] font-mono mt-1 tabular-nums">
              1 Local Vault + {externalConnectedCount} Connected Cloud Account(s)
            </p>
          </div>
          <div className="flex items-center justify-between text-xs pt-1 border-t border-[#1E2230] font-mono text-[#8A94A6]">
            <span>
              Plan Slot Usage: {totalExternalCount} / {currentPlan.maxMounts} clouds
            </span>
            <Link to="/app/providers" className="text-[#818CF8] hover:underline font-sans">
              Connect more
            </Link>
          </div>
        </div>

        {/* Card 3: Platform Subscription & Transfer Quota */}
        <div className="p-5 rounded-lg bg-[#131620] border border-[#1E2230] space-y-3">
          <div className="flex items-center justify-between text-xs text-[#8A94A6]">
            <span className="font-medium uppercase tracking-wider">
              Platform Plan ({currentPlan.name})
            </span>
            <CreditCard className="w-4 h-4 text-[#818CF8]" />
          </div>
          <div>
            <p className="text-2xl font-bold font-mono text-[#F3F4F6] tabular-nums">
              {formatBytes(quotaUsage.dailyRemainingBytes)}{' '}
              <span className="text-sm font-normal text-[#8A94A6]">daily left</span>
            </p>
            <p className="text-xs text-[#8A94A6] font-mono mt-1 tabular-nums">
              Monthly transfer quota: {formatBytes(quotaUsage.monthlyRemainingBytes)} left of{' '}
              {formatBytes(quotaUsage.monthlyLimitBytes)}
            </p>
          </div>
          <div className="flex items-center justify-between text-xs pt-1 border-t border-[#1E2230]">
            <span className="text-[#8A94A6]">
              External capacity comes from your cloud providers
            </span>
            <Link to="/app/pricing" className="text-[#818CF8] hover:underline shrink-0 ml-2">
              Plans
            </Link>
          </div>
        </div>
      </div>

      {/* Connected Storage Provider Mounts Details (Connected Mounts Only) */}
      <div className="rounded-lg bg-[#131620] border border-[#1E2230] p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#1E2230] pb-3.5">
          <div>
            <h2 className="text-[15px] font-bold text-[#F3F4F6]">
              Connected Storage Provider Mounts ({connectedMounts.length})
            </h2>
            <p className="text-xs text-[#8A94A6] mt-0.5">
              Showing active connected storage mounts and their allocated capacity specifications.
            </p>
          </div>

          <Link
            to="/app/providers"
            className="text-xs text-[#818CF8] hover:underline inline-flex items-center gap-1 self-start sm:self-auto"
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
                className="p-4 rounded-lg bg-[#0E1017] border border-[#1E2230] space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-[14px] text-[#F3F4F6] truncate">
                        {mount.name}
                      </span>
                      <span className="text-xs font-mono text-[#818CF8] bg-[#131620] border border-[#1E2230] px-2 py-0.5 rounded">
                        {meta.shortLabel}
                      </span>
                      {meta.isSimulated && (
                        <span className="text-[11px] font-mono text-[#8A94A6] bg-[#131620] border border-[#1E2230] px-1.5 py-0.5 rounded">
                          Simulated
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-mono text-[#8A94A6] mt-1 truncate">
                      {meta.label} · {mount.bucket ?? mount.endpoint} ({mount.region ?? 'global'})
                    </p>
                  </div>

                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#10B981]/15 border border-[#10B981]/30 text-[#10B981] font-mono text-xs shrink-0">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>Connected</span>
                  </span>
                </div>

                <div className="w-full h-2 bg-[#090A0F] rounded-full overflow-hidden border border-[#1E2230]">
                  <div
                    className={`h-full origin-left tv-transition ${
                      ratio > 0.85 ? 'bg-[#F59E0B]' : 'bg-[#4F46E5]'
                    }`}
                    style={{ transform: `scaleX(${ratio})` }}
                  />
                </div>

                <div className="flex items-center justify-between text-xs font-mono text-[#8A94A6] tabular-nums">
                  <span>
                    <strong className="text-[#F3F4F6]">{formatBytes(usage.usedBytes)}</strong> used
                    of <strong className="text-[#F3F4F6]">{formatBytes(mount.allocatedBytes)}</strong>
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
