import {
  AlertCircle,
  CalendarClock,
  Cloud,
  CreditCard,
  Play,
  Plus,
  Receipt,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  XCircle,
} from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PricingEstimator } from '../components/pricing/PricingEstimator';
import { PROVIDER_KIND_META } from '../lib/constants';
import { formatBytes, formatFullTimestamp, formatRelativeOrShortDate } from '../lib/format';
import {
  computeTransferQuotaUsage,
  getEffectivePlans,
  normalizePlanId,
} from '../lib/pricing';
import { useVaultStore } from '../store/useVaultStore';
import type { BillingCycle, PlanId } from '../types/domain';

export function PricingPage() {
  const settings = useVaultStore((s) => s.settings);
  const nodes = useVaultStore((s) => s.nodes);
  const mounts = useVaultStore((s) => s.mounts);
  const activity = useVaultStore((s) => s.activity);
  const isAdmin = useVaultStore((s) => s.isAdmin);
  const razorpayConfigured = useVaultStore((s) => s.razorpayConfigured);
  const razorpayMode = useVaultStore((s) => s.razorpayMode);
  const fetchBillingStatus = useVaultStore((s) => s.fetchBillingStatus);
  const switchSubscriptionPlan = useVaultStore((s) => s.switchSubscriptionPlan);
  const cancelSubscription = useVaultStore((s) => s.cancelSubscription);
  const addScheduledTransfer = useVaultStore((s) => s.addScheduledTransfer);
  const toggleScheduledTransfer = useVaultStore((s) => s.toggleScheduledTransfer);
  const runScheduledTransferNow = useVaultStore((s) => s.runScheduledTransferNow);
  const deleteScheduledTransfer = useVaultStore((s) => s.deleteScheduledTransfer);
  const addToast = useVaultStore((s) => s.addToast);

  const [activeTab, setActiveTab] = useState<'plans' | 'automation'>('plans');
  const [billingCycle, setBillingCycle] = useState<BillingCycle>(
    settings.subscription.billingCycle
  );
  const [blockReason, setBlockReason] = useState<string | null>(null);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);

  // Scheduled Transfer Creation State
  const [schedName, setSchedName] = useState('Nightly Cloud Replication');
  const [schedSourceId, setSchedSourceId] = useState(mounts[0]?.id ?? 'local-vault');
  const [schedTargetId, setSchedTargetId] = useState(mounts[1]?.id ?? mounts[0]?.id ?? 'local-vault');
  const [schedFreq, setSchedFreq] = useState<'hourly' | 'daily' | 'weekly'>('daily');
  const [runningJobId, setRunningJobId] = useState<string | null>(null);

  useEffect(() => {
    fetchBillingStatus();
  }, [fetchBillingStatus]);

  const plans = useMemo(
    () => getEffectivePlans(settings.customPlans),
    [settings.customPlans]
  );

  const activePlanId = normalizePlanId(settings.subscription.planId);
  const currentPlan = plans[activePlanId];
  const externalMountsCount = Math.max(
    0,
    mounts.filter((m) => m.id !== 'local-vault').length
  );

  const totalExternalAllocatedBytes = useMemo(
    () => mounts.reduce((sum, m) => sum + m.allocatedBytes, 0),
    [mounts]
  );
  const totalUsedBytes = useMemo(
    () => nodes.reduce((sum, n) => (n.type === 'file' ? sum + n.sizeBytes : sum), 0),
    [nodes]
  );

  const quotaUsage = useMemo(
    () => computeTransferQuotaUsage(activity, currentPlan),
    [activity, currentPlan]
  );

  const handleSelectPlan = async (targetPlanId: PlanId) => {
    setBlockReason(null);
    try {
      await switchSubscriptionPlan(targetPlanId, billingCycle);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not switch plan.';
      setBlockReason(msg);
      addToast({
        title: 'Plan change requires attention',
        description: msg,
        variant: 'error',
      });
    }
  };

  const handleCycleChange = async (nextCycle: BillingCycle) => {
    setBillingCycle(nextCycle);
    if (nextCycle !== settings.subscription.billingCycle && activePlanId === 'free') {
      try {
        await switchSubscriptionPlan(activePlanId, nextCycle);
      } catch {
        // Ignore
      }
    }
  };

  const dailyRatio = Math.min(
    1,
    quotaUsage.dailyUsedBytes / Math.max(1, quotaUsage.dailyLimitBytes)
  );
  const monthlyRatio = Math.min(
    1,
    quotaUsage.monthlyUsedBytes / Math.max(1, quotaUsage.monthlyLimitBytes)
  );
  const mountSlotRatio = Math.min(
    1,
    externalMountsCount / Math.max(1, currentPlan.maxMounts)
  );

  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-7xl w-full mx-auto">
      {/* Page Header & View Switcher */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#1D1D1F] dark:text-[#F5F5F7] tracking-tight">
            Subscription Plans, Quotas & Billing
          </h1>
          <p className="text-xs text-[#6E6E73] dark:text-[#86868B] mt-0.5">
            Manage your FREE, PRO, or ULTRA subscription via Razorpay, inspect real-time transfer quotas, or schedule cross-cloud transfers.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex p-1 rounded-xl bg-black/[0.04] dark:bg-white/[0.05] border border-black/[0.06] dark:border-white/[0.08]">
            <button
              type="button"
              onClick={() => setActiveTab('plans')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 ${
                activeTab === 'plans'
                  ? 'bg-[#0071E3] text-white'
                  : 'text-[#6E6E73] dark:text-[#86868B] hover:text-[#1D1D1F] dark:hover:text-[#F5F5F7]'
              }`}
            >
              <CreditCard className="w-3.5 h-3.5" />
              <span>Plans & Billing</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('automation')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 ${
                activeTab === 'automation'
                  ? 'bg-[#0071E3] text-white'
                  : 'text-[#6E6E73] dark:text-[#86868B] hover:text-[#1D1D1F] dark:hover:text-[#F5F5F7]'
              }`}
            >
              <CalendarClock className="w-3.5 h-3.5" />
              <span>Scheduled Transfers</span>
            </button>
          </div>

          {isAdmin && (
            <Link
              to="/app/admin"
              className="px-3 py-2 rounded-xl bg-black/[0.05] dark:bg-white/[0.06] hover:bg-black/[0.08] border border-black/[0.08] dark:border-white/[0.1] text-xs font-medium inline-flex items-center gap-1.5"
            >
              <Settings2 className="w-3.5 h-3.5 text-[#0071E3]" />
              <span>Admin Gateway & Plans</span>
            </Link>
          )}
        </div>
      </div>

      {/* Live Subscription Status & Quotas */}
      <div className="apple-card p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-black/[0.06] dark:border-white/[0.08] pb-3.5">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="px-2.5 py-1 rounded-lg bg-[#0071E3] text-white font-mono text-xs font-bold uppercase">
              {currentPlan.name} PLAN
            </span>
            <span className="text-xs font-mono text-[#1D1D1F] dark:text-[#F5F5F7]">
              {currentPlan.baseMonthlyInr === 0
                ? '₹0/month (Free Tier — No Payment Required)'
                : `₹${currentPlan.baseMonthlyInr}/month (${settings.subscription.billingCycle} billing)`}
            </span>
            <span
              className={`px-2 py-0.5 rounded text-[11px] font-mono inline-flex items-center gap-1 ${
                razorpayConfigured
                  ? 'bg-[#28CD41]/15 text-[#28CD41]'
                  : 'bg-[#FF9F0A]/15 text-[#D97706] dark:text-[#FFD60A]'
              }`}
            >
              <ShieldCheck className="w-3 h-3" />
              <span>
                {razorpayConfigured
                  ? `Razorpay Verified Checkout (${razorpayMode.toUpperCase()})`
                  : 'Razorpay Gateway Awaiting Admin Setup'}
              </span>
            </span>
            {settings.subscription.cancelledAt && (
              <span className="px-2 py-0.5 rounded bg-[#FF9F0A]/15 border border-[#FF9F0A]/40 text-[#FF9F0A] font-mono text-[11px]">
                Cancellation scheduled
              </span>
            )}
          </div>

          {activePlanId !== 'free' && (
            <button
              type="button"
              onClick={() => setConfirmCancelOpen(true)}
              className="text-xs text-[#FF3B30] hover:underline flex items-center gap-1 self-start sm:self-auto"
            >
              <XCircle className="w-3.5 h-3.5" />
              <span>Cancel Subscription</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Meter 1: Cloud Account Connections */}
          <div className="p-3.5 rounded-xl bg-[#F5F5F7] dark:bg-[#0B0C10] border border-black/[0.06] dark:border-white/[0.08] space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[#6E6E73] dark:text-[#86868B]">Connected Cloud Accounts</span>
              <span className="font-mono font-bold text-[#1D1D1F] dark:text-[#F5F5F7] tabular-nums">
                {externalMountsCount} / {currentPlan.maxMounts} clouds
              </span>
            </div>
            <div className="w-full h-1.5 bg-black/[0.08] dark:bg-white/[0.08] rounded-full overflow-hidden">
              <div
                className={`h-full origin-left tv-transition ${
                  mountSlotRatio >= 1 ? 'bg-[#FF9F0A]' : 'bg-[#0071E3]'
                }`}
                style={{ transform: `scaleX(${mountSlotRatio})` }}
              />
            </div>
            <p className="text-[11px] font-mono text-[#6E6E73] dark:text-[#86868B] tabular-nums">
              {Math.max(0, currentPlan.maxMounts - externalMountsCount)} connection slot(s) remaining
            </p>
          </div>

          {/* Meter 2: Daily Upload & Download Quota */}
          <div className="p-3.5 rounded-xl bg-[#F5F5F7] dark:bg-[#0B0C10] border border-black/[0.06] dark:border-white/[0.08] space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[#6E6E73] dark:text-[#86868B]">Daily Upload/Download (24h)</span>
              <span className="font-mono font-bold text-[#1D1D1F] dark:text-[#F5F5F7] tabular-nums">
                {formatBytes(quotaUsage.dailyUsedBytes)} / {formatBytes(quotaUsage.dailyLimitBytes)}
              </span>
            </div>
            <div className="w-full h-1.5 bg-black/[0.08] dark:bg-white/[0.08] rounded-full overflow-hidden">
              <div
                className={`h-full origin-left tv-transition ${
                  dailyRatio > 0.85 ? 'bg-[#FF9F0A]' : 'bg-[#28CD41]'
                }`}
                style={{ transform: `scaleX(${dailyRatio})` }}
              />
            </div>
            <p className="text-[11px] font-mono text-[#6E6E73] dark:text-[#86868B] tabular-nums">
              Remaining today: {formatBytes(quotaUsage.dailyRemainingBytes)}
            </p>
          </div>

          {/* Meter 3: Monthly Cross-Cloud & Transfer Quota */}
          <div className="p-3.5 rounded-xl bg-[#F5F5F7] dark:bg-[#0B0C10] border border-black/[0.06] dark:border-white/[0.08] space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[#6E6E73] dark:text-[#86868B]">Monthly Transfer Quota (30d)</span>
              <span className="font-mono font-bold text-[#1D1D1F] dark:text-[#F5F5F7] tabular-nums">
                {formatBytes(quotaUsage.monthlyUsedBytes)} /{' '}
                {formatBytes(quotaUsage.monthlyLimitBytes)}
              </span>
            </div>
            <div className="w-full h-1.5 bg-black/[0.08] dark:bg-white/[0.08] rounded-full overflow-hidden">
              <div
                className={`h-full origin-left tv-transition ${
                  monthlyRatio > 0.85 ? 'bg-[#FF9F0A]' : 'bg-[#0071E3]'
                }`}
                style={{ transform: `scaleX(${monthlyRatio})` }}
              />
            </div>
            <p className="text-[11px] font-mono text-[#6E6E73] dark:text-[#86868B] tabular-nums">
              Remaining this month: {formatBytes(quotaUsage.monthlyRemainingBytes)}
            </p>
          </div>
        </div>

        {/* Architectural Distinction Callout */}
        <div className="p-3.5 rounded-xl bg-[#F5F5F7] dark:bg-[#0B0C10] border border-black/[0.06] dark:border-white/[0.08] flex items-start gap-2.5 text-xs text-[#6E6E73] dark:text-[#86868B]">
          <ShieldAlert className="w-4 h-4 text-[#0071E3] shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-[#1D1D1F] dark:text-[#F5F5F7]">
              Platform Limits vs. External Cloud Capacity:{' '}
            </span>
            <span>
              Your connected storage providers supply{' '}
              <strong className="font-mono text-[#1D1D1F] dark:text-[#F5F5F7]">
                {formatBytes(totalExternalAllocatedBytes)}
              </strong>{' '}
              of raw storage capacity ({formatBytes(totalUsedBytes)} used). Your subscription tier
              governs connected cloud account slots, daily/monthly transfer orchestration bandwidth,
              and scheduled replication jobs.
            </span>
          </div>
        </div>
      </div>

      {blockReason && (
        <div
          role="alert"
          className="p-3.5 rounded-xl bg-[#FF3B30]/10 border border-[#FF3B30]/30 text-xs text-[#FF3B30] flex items-start gap-2.5"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Subscription Update Notice</p>
            <p className="mt-0.5">{blockReason}</p>
          </div>
        </div>
      )}

      {/* TAB 1: Plans & Verified Invoices */}
      {activeTab === 'plans' && (
        <>
          <PricingEstimator
            activePlanId={activePlanId}
            billingCycle={billingCycle}
            onBillingCycleChange={handleCycleChange}
            onSelectPlan={handleSelectPlan}
            customPlans={plans}
          />

          {/* Verified Invoice Ledger */}
          <div className="apple-card overflow-hidden">
            <div className="px-5 py-3.5 border-b border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-[#0071E3]" />
                <h2 className="text-sm font-bold text-[#1D1D1F] dark:text-[#F5F5F7]">
                  Subscription Billing & Verified Invoice Ledger
                </h2>
              </div>
              <span className="text-xs font-mono text-[#6E6E73] dark:text-[#86868B]">
                Razorpay HMAC-SHA256 Verified Receipts
              </span>
            </div>

            {settings.subscription.invoices.length === 0 ? (
              <div className="p-6 text-center text-xs text-[#6E6E73] dark:text-[#86868B]">
                No paid subscription invoices recorded yet. Your workspace is currently on the{' '}
                <strong className="font-mono uppercase">{activePlanId}</strong> tier.
              </div>
            ) : (
              <div className="divide-y divide-black/[0.06] dark:divide-white/[0.08]">
                {settings.subscription.invoices.map((inv) => {
                  const inrAmount = inv.amountInr ?? Math.round((inv.amountUsd ?? 0) * 85);
                  return (
                    <div
                      key={inv.id}
                      className="px-5 py-3 flex items-center justify-between gap-4 text-[13px]"
                    >
                      <div>
                        <p className="font-medium text-[#1D1D1F] dark:text-[#F5F5F7]">
                          {inv.description}
                        </p>
                        <p className="text-xs font-mono text-[#6E6E73] dark:text-[#86868B] mt-0.5 tabular-nums">
                          {inv.id} · Issued {formatFullTimestamp(inv.issuedAt)}
                        </p>
                      </div>
                      <span className="font-mono text-sm font-bold text-[#1D1D1F] dark:text-[#F5F5F7] tabular-nums">
                        ₹{inrAmount.toLocaleString('en-IN')}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* TAB 2: Scheduled & Recurring Cross-Cloud Transfers */}
      {activeTab === 'automation' && (
        <div className="apple-card p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-black/[0.06] dark:border-white/[0.08] pb-3">
            <div className="flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-[#0071E3]" />
              <div>
                <h2 className="text-sm font-bold text-[#1D1D1F] dark:text-[#F5F5F7]">
                  Scheduled & Recurring Cloud Transfers
                </h2>
                <p className="text-xs text-[#6E6E73] dark:text-[#86868B]">
                  Automate file replication between connected cloud storage mounts (PRO & ULTRA).
                </p>
              </div>
            </div>
            <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-[#0071E3]/15 text-[#0071E3] dark:text-[#0A84FF]">
              {currentPlan.allowScheduledTransfers ? 'Unlocked' : 'Requires PRO/ULTRA'}
            </span>
          </div>

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await addScheduledTransfer({
                  name: schedName.trim() || 'Cross-Cloud Sync Job',
                  sourceMountId: schedSourceId,
                  targetMountId: schedTargetId,
                  schedule: schedFreq,
                  enabled: true,
                });
                addToast({
                  title: 'Scheduled transfer job created',
                  variant: 'success',
                });
              } catch {
                // Upgrade modal triggered by store
              }
            }}
            className="p-4 rounded-xl bg-[#F5F5F7] dark:bg-[#0B0C10] border border-black/[0.06] dark:border-white/[0.08] space-y-3 text-xs"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[#6E6E73] dark:text-[#86868B] mb-1">Job Label</label>
                <input
                  type="text"
                  value={schedName}
                  onChange={(e) => setSchedName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-white dark:bg-[#15171E] border border-black/[0.08] dark:border-white/[0.1]"
                />
              </div>
              <div>
                <label className="block text-[#6E6E73] dark:text-[#86868B] mb-1">
                  Schedule Cadence
                </label>
                <select
                  value={schedFreq}
                  onChange={(e) =>
                    setSchedFreq(e.target.value as 'hourly' | 'daily' | 'weekly')
                  }
                  className="w-full px-3 py-2 rounded-lg bg-white dark:bg-[#15171E] border border-black/[0.08] dark:border-white/[0.1]"
                >
                  <option value="daily">Daily (PRO & ULTRA)</option>
                  <option value="hourly">Hourly Recurring Sync (ULTRA)</option>
                  <option value="weekly">Weekly Archive Sync (ULTRA)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[#6E6E73] dark:text-[#86868B] mb-1">
                  Source Cloud Mount
                </label>
                <select
                  value={schedSourceId}
                  onChange={(e) => setSchedSourceId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-white dark:bg-[#15171E] border border-black/[0.08] dark:border-white/[0.1]"
                >
                  {mounts.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({PROVIDER_KIND_META[m.kind].shortLabel})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[#6E6E73] dark:text-[#86868B] mb-1">
                  Destination Cloud Mount
                </label>
                <select
                  value={schedTargetId}
                  onChange={(e) => setSchedTargetId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-white dark:bg-[#15171E] border border-black/[0.08] dark:border-white/[0.1]"
                >
                  {mounts.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({PROVIDER_KIND_META[m.kind].shortLabel})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#0071E3] hover:bg-[#0077ED] text-white font-semibold"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Scheduled Transfer</span>
            </button>
          </form>

          <div className="space-y-2">
            {(settings.scheduledTransfers ?? []).length === 0 ? (
              <p className="text-xs text-[#6E6E73] dark:text-[#86868B] py-4 text-center">
                No scheduled transfer jobs configured yet.
              </p>
            ) : (
              (settings.scheduledTransfers ?? []).map((job) => {
                const src = mounts.find((m) => m.id === job.sourceMountId);
                const dst = mounts.find((m) => m.id === job.targetMountId);
                const isRunning = runningJobId === job.id;
                return (
                  <div
                    key={job.id}
                    className="p-3.5 rounded-xl bg-[#F5F5F7] dark:bg-[#0B0C10] border border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[#1D1D1F] dark:text-[#F5F5F7] truncate">
                          {job.name}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-[#0071E3]/15 font-mono text-[10px] uppercase text-[#0071E3]">
                          {job.schedule}
                        </span>
                      </div>
                      <p className="text-[#6E6E73] dark:text-[#86868B] font-mono text-[11px] mt-0.5 truncate">
                        {src?.name ?? job.sourceMountId} → {dst?.name ?? job.targetMountId} ·{' '}
                        {job.lastRunAt
                          ? `Last run ${formatRelativeOrShortDate(job.lastRunAt)}`
                          : 'Never run'}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        disabled={isRunning}
                        onClick={async () => {
                          setRunningJobId(job.id);
                          try {
                            await runScheduledTransferNow(job.id);
                            addToast({
                              title: `Executed "${job.name}"`,
                              variant: 'success',
                            });
                          } catch (err) {
                            addToast({
                              title: 'Scheduled transfer blocked',
                              description: err instanceof Error ? err.message : undefined,
                              variant: 'error',
                            });
                          } finally {
                            setRunningJobId(null);
                          }
                        }}
                        className="px-2.5 py-1 rounded-lg bg-white dark:bg-[#15171E] border border-black/[0.08] dark:border-white/[0.1] text-[#28CD41] inline-flex items-center gap-1"
                      >
                        <Play className="w-3 h-3" />
                        <span>Run Now</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleScheduledTransfer(job.id)}
                        className={`px-2 py-1 rounded-lg border text-[11px] font-mono ${
                          job.enabled
                            ? 'bg-[#28CD41]/15 border-[#28CD41]/40 text-[#28CD41]'
                            : 'bg-white dark:bg-[#15171E] border-black/[0.08] text-[#6E6E73]'
                        }`}
                      >
                        {job.enabled ? 'Active' : 'Paused'}
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteScheduledTransfer(job.id)}
                        className="p-1 text-[#6E6E73] hover:text-[#FF3B30]"
                        aria-label="Delete schedule"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Cancel Subscription Confirmation Modal */}
      {confirmCancelOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cancel-sub-title"
        >
          <div className="w-full max-w-md apple-card p-6 space-y-4">
            <div className="flex items-start gap-3">
              <Cloud className="w-5 h-5 text-[#FF9F0A] shrink-0 mt-0.5" />
              <div>
                <h2
                  id="cancel-sub-title"
                  className="text-base font-bold text-[#1D1D1F] dark:text-[#F5F5F7]"
                >
                  Cancel {currentPlan.name} Subscription?
                </h2>
                <p className="text-xs text-[#6E6E73] dark:text-[#86868B] mt-1 leading-relaxed">
                  {externalMountsCount <= plans.free.maxMounts
                    ? `Your workspace currently has ${externalMountsCount} external cloud mount(s), which fits within the FREE plan (${plans.free.maxMounts} mounts). Cancelling will switch your workspace to FREE (₹0/month) immediately.`
                    : `Your workspace currently has ${externalMountsCount} external cloud mounts (FREE limit is ${plans.free.maxMounts}). Cancelling will mark your subscription as cancelled at period end while keeping your mounts accessible until you remove excess mounts.`}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmCancelOpen(false)}
                className="px-3.5 py-1.5 rounded-lg border border-black/[0.08] dark:border-white/[0.1] text-xs font-medium"
              >
                Keep {currentPlan.name}
              </button>
              <button
                type="button"
                onClick={async () => {
                  setConfirmCancelOpen(false);
                  await cancelSubscription();
                }}
                className="px-4 py-1.5 rounded-lg bg-[#FF3B30] text-white text-xs font-medium"
              >
                Confirm Cancellation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
