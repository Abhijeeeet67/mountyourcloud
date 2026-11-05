import {
  AlertCircle,
  Bell,
  CalendarClock,
  CheckCircle2,
  Cloud,
  CreditCard,
  Play,
  Plus,
  Receipt,
  RotateCcw,
  Settings2,
  ShieldAlert,
  Trash2,
  XCircle,
} from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { PricingEstimator } from '../components/pricing/PricingEstimator';
import { PROVIDER_KIND_META } from '../lib/constants';
import { formatBytes, formatFullTimestamp, formatRelativeOrShortDate } from '../lib/format';
import {
  PLAN_ORDER,
  computeTransferQuotaUsage,
  getEffectivePlans,
  normalizePlanId,
} from '../lib/pricing';
import { useVaultStore } from '../store/useVaultStore';
import type { BillingCycle, PlanDefinition, PlanId } from '../types/domain';

export function PricingPage() {
  const settings = useVaultStore((s) => s.settings);
  const nodes = useVaultStore((s) => s.nodes);
  const mounts = useVaultStore((s) => s.mounts);
  const activity = useVaultStore((s) => s.activity);
  const switchSubscriptionPlan = useVaultStore((s) => s.switchSubscriptionPlan);
  const cancelSubscription = useVaultStore((s) => s.cancelSubscription);
  const updateCustomPlanConfig = useVaultStore((s) => s.updateCustomPlanConfig);
  const resetCustomPlans = useVaultStore((s) => s.resetCustomPlans);
  const addScheduledTransfer = useVaultStore((s) => s.addScheduledTransfer);
  const toggleScheduledTransfer = useVaultStore((s) => s.toggleScheduledTransfer);
  const runScheduledTransferNow = useVaultStore((s) => s.runScheduledTransferNow);
  const deleteScheduledTransfer = useVaultStore((s) => s.deleteScheduledTransfer);
  const updateTelegramWebhookSim = useVaultStore((s) => s.updateTelegramWebhookSim);
  const addToast = useVaultStore((s) => s.addToast);

  const [activeTab, setActiveTab] = useState<'plans' | 'automation' | 'admin'>('plans');
  const [billingCycle, setBillingCycle] = useState<BillingCycle>(
    settings.subscription.billingCycle
  );
  const [blockReason, setBlockReason] = useState<string | null>(null);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);

  // Scheduled Transfer Creation State
  const [schedName, setSchedName] = useState('Nightly Cloud Backup');
  const [schedSourceId, setSchedSourceId] = useState('mega-vault');
  const [schedTargetId, setSchedTargetId] = useState('r2-edge');
  const [schedFreq, setSchedFreq] = useState<'hourly' | 'daily' | 'weekly'>('daily');
  const [runningJobId, setRunningJobId] = useState<string | null>(null);

  // Admin Plan Configurator State (Requirement 10)
  const plans = useMemo(
    () => getEffectivePlans(settings.customPlans),
    [settings.customPlans]
  );
  const [adminSelectedPlanId, setAdminSelectedPlanId] = useState<PlanId>('pro');
  const [adminDraft, setAdminDraft] = useState<PlanDefinition>(() => plans.pro);

  const activePlanId = normalizePlanId(settings.subscription.planId);
  const currentPlan = plans[activePlanId];
  const externalMountsCount = Math.max(0, mounts.length - 1);

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

  const handleSelectAdminPlan = (pid: PlanId) => {
    setAdminSelectedPlanId(pid);
    setAdminDraft(structuredClone(plans[pid]));
  };

  const handleSelectPlan = async (targetPlanId: PlanId) => {
    setBlockReason(null);
    try {
      await switchSubscriptionPlan(targetPlanId, billingCycle);
      addToast({
        title: `Switched workspace to ${plans[targetPlanId].name} (${billingCycle})`,
        description: 'Updated connected cloud limits, daily/monthly transfer quotas, and authorization rules.',
        variant: 'success',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not switch plan.';
      setBlockReason(msg);
      addToast({
        title: 'Plan change blocked',
        description: msg,
        variant: 'error',
      });
    }
  };

  const handleCycleChange = async (nextCycle: BillingCycle) => {
    setBillingCycle(nextCycle);
    if (nextCycle !== settings.subscription.billingCycle) {
      try {
        await switchSubscriptionPlan(activePlanId, nextCycle);
        addToast({
          title: `Updated billing cycle to ${nextCycle === 'annual' ? 'Annual (20% Off)' : 'Monthly'}`,
          variant: 'success',
        });
      } catch {
        // Ignore if blocked
      }
    }
  };

  const handleSaveAdminPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateCustomPlanConfig(adminSelectedPlanId, adminDraft);
    addToast({
      title: `Saved Admin Configuration for ${adminDraft.name} Plan`,
      description: 'Updated pricing, limits, and backend authorization rules in real time.',
      variant: 'success',
    });
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
    <div className="p-4 lg:p-6 space-y-6 max-w-7xl w-full mx-auto">
      {/* Page Header & View Switcher */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#F3F4F6]">
            Subscription Plans, Quotas & Admin Control
          </h1>
          <p className="text-xs text-[#8A94A6] mt-0.5">
            Manage your FREE, PRO, or ULTRA subscription, inspect real-time transfer quotas, or configure plan parameters via the Admin Dashboard.
          </p>
        </div>

        <div className="inline-flex p-1 rounded-lg bg-[#131620] border border-[#1E2230] self-start md:self-auto">
          <button
            type="button"
            onClick={() => setActiveTab('plans')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 ${
              activeTab === 'plans'
                ? 'bg-[#4F46E5] text-white'
                : 'text-[#8A94A6] hover:text-[#F3F4F6]'
            }`}
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span>Plans & Quotas</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('automation')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 ${
              activeTab === 'automation'
                ? 'bg-[#4F46E5] text-white'
                : 'text-[#8A94A6] hover:text-[#F3F4F6]'
            }`}
          >
            <CalendarClock className="w-3.5 h-3.5" />
            <span>Schedules & Telegram Bot</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setAdminDraft(structuredClone(plans[adminSelectedPlanId]));
              setActiveTab('admin');
            }}
            className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 ${
              activeTab === 'admin'
                ? 'bg-[#4F46E5] text-white'
                : 'text-[#8A94A6] hover:text-[#F3F4F6]'
            }`}
          >
            <Settings2 className="w-3.5 h-3.5" />
            <span>Admin Plan Configurator</span>
          </button>
        </div>
      </div>

      {/* Live Subscription Status, Account Connections, Transfer Usage & Remaining Quotas (Requirement 7) */}
      <div className="rounded-lg bg-[#131620] border border-[#1E2230] p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#1E2230] pb-3.5">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="px-2.5 py-1 rounded bg-[#4F46E5] text-white font-mono text-xs font-bold uppercase">
              {currentPlan.name} PLAN
            </span>
            <span className="text-xs font-mono text-[#F3F4F6]">
              {currentPlan.baseMonthlyInr === 0
                ? '₹0/month (Free Tier — No Payment Required)'
                : `₹${currentPlan.baseMonthlyInr}/month (${settings.subscription.billingCycle} billing)`}
            </span>
            {settings.subscription.cancelledAt && (
              <span className="px-2 py-0.5 rounded bg-[#F59E0B]/15 border border-[#F59E0B]/40 text-[#F59E0B] font-mono text-[11px]">
                Cancellation scheduled
              </span>
            )}
          </div>

          {activePlanId !== 'free' && (
            <button
              type="button"
              onClick={() => setConfirmCancelOpen(true)}
              className="text-xs text-[#F43F5E] hover:underline flex items-center gap-1 self-start sm:self-auto"
            >
              <XCircle className="w-3.5 h-3.5" />
              <span>Cancel Subscription</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Meter 1: Cloud Account Connections */}
          <div className="p-3.5 rounded-lg bg-[#0E1017] border border-[#1E2230] space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[#8A94A6]">Connected Cloud Accounts</span>
              <span className="font-mono font-bold text-[#F3F4F6] tabular-nums">
                {externalMountsCount} / {currentPlan.maxMounts} clouds
              </span>
            </div>
            <div className="w-full h-1.5 bg-[#090A0F] rounded-full overflow-hidden border border-[#1E2230]">
              <div
                className={`h-full origin-left tv-transition ${
                  mountSlotRatio >= 1 ? 'bg-[#F59E0B]' : 'bg-[#4F46E5]'
                }`}
                style={{ transform: `scaleX(${mountSlotRatio})` }}
              />
            </div>
            <p className="text-[11px] font-mono text-[#8A94A6] tabular-nums">
              {Math.max(0, currentPlan.maxMounts - externalMountsCount)} connection slot(s) remaining
            </p>
          </div>

          {/* Meter 2: Daily Upload & Download Quota */}
          <div className="p-3.5 rounded-lg bg-[#0E1017] border border-[#1E2230] space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[#8A94A6]">Daily Upload/Download (24h)</span>
              <span className="font-mono font-bold text-[#F3F4F6] tabular-nums">
                {formatBytes(quotaUsage.dailyUsedBytes)} / {formatBytes(quotaUsage.dailyLimitBytes)}
              </span>
            </div>
            <div className="w-full h-1.5 bg-[#090A0F] rounded-full overflow-hidden border border-[#1E2230]">
              <div
                className={`h-full origin-left tv-transition ${
                  dailyRatio > 0.85 ? 'bg-[#F59E0B]' : 'bg-[#10B981]'
                }`}
                style={{ transform: `scaleX(${dailyRatio})` }}
              />
            </div>
            <p className="text-[11px] font-mono text-[#8A94A6] tabular-nums">
              Remaining today: {formatBytes(quotaUsage.dailyRemainingBytes)}
            </p>
          </div>

          {/* Meter 3: Monthly Cross-Cloud & Transfer Quota */}
          <div className="p-3.5 rounded-lg bg-[#0E1017] border border-[#1E2230] space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[#8A94A6]">Monthly Transfer Quota (30d)</span>
              <span className="font-mono font-bold text-[#F3F4F6] tabular-nums">
                {formatBytes(quotaUsage.monthlyUsedBytes)} /{' '}
                {formatBytes(quotaUsage.monthlyLimitBytes)}
              </span>
            </div>
            <div className="w-full h-1.5 bg-[#090A0F] rounded-full overflow-hidden border border-[#1E2230]">
              <div
                className={`h-full origin-left tv-transition ${
                  monthlyRatio > 0.85 ? 'bg-[#F59E0B]' : 'bg-[#818CF8]'
                }`}
                style={{ transform: `scaleX(${monthlyRatio})` }}
              />
            </div>
            <p className="text-[11px] font-mono text-[#8A94A6] tabular-nums">
              Remaining this month: {formatBytes(quotaUsage.monthlyRemainingBytes)}
            </p>
          </div>
        </div>

        {/* Architectural Distinction Callout: Platform Quotas vs External Cloud Storage Capacity */}
        <div className="p-3 rounded-md bg-[#090A0F] border border-[#1E2230] flex items-start gap-2.5 text-xs text-[#8A94A6]">
          <ShieldAlert className="w-4 h-4 text-[#818CF8] shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-[#F3F4F6]">
              Platform Limits vs. External Cloud Capacity:{' '}
            </span>
            <span>
              Your connected external storage providers currently supply{' '}
              <strong className="font-mono text-[#F3F4F6]">
                {formatBytes(totalExternalAllocatedBytes)}
              </strong>{' '}
              of raw storage capacity ({formatBytes(totalUsedBytes)} used). MountYourClouds never promises fake "unlimited storage" or "unlimited transfers"—your subscription tier governs connected cloud account slots, daily/monthly transfer orchestration bandwidth, and automation workflows.
            </span>
          </div>
        </div>
      </div>

      {blockReason && (
        <div
          role="alert"
          className="p-3.5 rounded-lg bg-[#F43F5E]/15 border border-[#F43F5E]/40 text-xs text-[#F43F5E] flex items-start gap-2.5"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Plan Change Blocked by Backend Authorization</p>
            <p className="mt-0.5">{blockReason}</p>
          </div>
        </div>
      )}

      {/* TAB 1: Plans & Comparison */}
      {activeTab === 'plans' && (
        <>
          <PricingEstimator
            activePlanId={activePlanId}
            billingCycle={billingCycle}
            onBillingCycleChange={handleCycleChange}
            onSelectPlan={handleSelectPlan}
            customPlans={plans}
          />

          {/* Demo Invoices History */}
          <div className="rounded-lg bg-[#131620] border border-[#1E2230] overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[#1E2230] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-[#818CF8]" />
                <h2 className="text-[15px] font-bold text-[#F3F4F6]">
                  Subscription Billing & Invoice Ledger
                </h2>
              </div>
              <span className="text-xs font-mono text-[#8A94A6]">
                Demo records only — no real charges
              </span>
            </div>

            <div className="divide-y divide-[#1E2230]">
              {settings.subscription.invoices.map((inv) => {
                const inrAmount = inv.amountInr ?? Math.round((inv.amountUsd ?? 0) * 85);
                return (
                  <div
                    key={inv.id}
                    className="px-5 py-3 flex items-center justify-between gap-4 text-[13px]"
                  >
                    <div>
                      <p className="font-medium text-[#F3F4F6]">{inv.description}</p>
                      <p className="text-xs font-mono text-[#8A94A6] mt-0.5 tabular-nums">
                        {inv.id} · Issued {formatFullTimestamp(inv.issuedAt)}
                      </p>
                    </div>
                    <span className="font-mono text-sm font-bold text-[#F3F4F6] tabular-nums">
                      ₹{inrAmount.toLocaleString('en-IN')}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* TAB 2: Working PRO/ULTRA Automation: Scheduled Transfers & Telegram Notification Webhook */}
      {activeTab === 'automation' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Scheduled & Recurring Cross-Cloud Transfers */}
          <div className="rounded-lg bg-[#131620] border border-[#1E2230] p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-[#1E2230] pb-3">
              <div className="flex items-center gap-2">
                <CalendarClock className="w-4 h-4 text-[#818CF8]" />
                <div>
                  <h2 className="text-[15px] font-bold text-[#F3F4F6]">
                    Scheduled & Recurring Cloud Transfers
                  </h2>
                  <p className="text-xs text-[#8A94A6]">
                    Automate file replication between connected cloud storage mounts (PRO & ULTRA).
                  </p>
                </div>
              </div>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[#0E1017] border border-[#1E2230] text-[#818CF8]">
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
                  // Upgrade modal automatically triggered by store
                }
              }}
              className="p-3.5 rounded-lg bg-[#0E1017] border border-[#1E2230] space-y-3 text-xs"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#8A94A6] mb-1">Job Label</label>
                  <input
                    type="text"
                    value={schedName}
                    onChange={(e) => setSchedName(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded bg-[#131620] border border-[#1E2230] text-[#F3F4F6]"
                  />
                </div>
                <div>
                  <label className="block text-[#8A94A6] mb-1">Schedule Cadence</label>
                  <select
                    value={schedFreq}
                    onChange={(e) =>
                      setSchedFreq(e.target.value as 'hourly' | 'daily' | 'weekly')
                    }
                    className="w-full px-2.5 py-1.5 rounded bg-[#131620] border border-[#1E2230] text-[#F3F4F6]"
                  >
                    <option value="daily">Daily (PRO & ULTRA)</option>
                    <option value="hourly">Hourly Recurring Sync (ULTRA)</option>
                    <option value="weekly">Weekly Archive Sync (ULTRA)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#8A94A6] mb-1">Source Cloud Mount</label>
                  <select
                    value={schedSourceId}
                    onChange={(e) => setSchedSourceId(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded bg-[#131620] border border-[#1E2230] text-[#F3F4F6]"
                  >
                    {mounts.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({PROVIDER_KIND_META[m.kind].shortLabel})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[#8A94A6] mb-1">Destination Cloud Mount</label>
                  <select
                    value={schedTargetId}
                    onChange={(e) => setSchedTargetId(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded bg-[#131620] border border-[#1E2230] text-[#F3F4F6]"
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
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#4F46E5] hover:bg-[#4338CA] text-white font-medium"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Scheduled Transfer</span>
              </button>
            </form>

            <div className="space-y-2">
              {(settings.scheduledTransfers ?? []).map((job) => {
                const src = mounts.find((m) => m.id === job.sourceMountId);
                const dst = mounts.find((m) => m.id === job.targetMountId);
                const isRunning = runningJobId === job.id;
                return (
                  <div
                    key={job.id}
                    className="p-3 rounded-lg bg-[#0E1017] border border-[#1E2230] flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[#F3F4F6] truncate">{job.name}</span>
                        <span className="px-1.5 py-0.5 rounded bg-[#131620] border border-[#1E2230] font-mono text-[10px] uppercase text-[#818CF8]">
                          {job.schedule}
                        </span>
                      </div>
                      <p className="text-[#8A94A6] font-mono text-[11px] mt-0.5 truncate">
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
                              description: 'Transferred sample batch to destination mount.',
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
                        className="px-2 py-1 rounded bg-[#131620] hover:bg-[#1E2230] border border-[#1E2230] text-[#10B981] inline-flex items-center gap-1"
                      >
                        <Play className="w-3 h-3" />
                        <span>Run Now</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleScheduledTransfer(job.id)}
                        className={`px-2 py-1 rounded border text-[11px] font-mono ${
                          job.enabled
                            ? 'bg-[#10B981]/15 border-[#10B981]/40 text-[#10B981]'
                            : 'bg-[#131620] border-[#1E2230] text-[#8A94A6]'
                        }`}
                      >
                        {job.enabled ? 'Active' : 'Paused'}
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteScheduledTransfer(job.id)}
                        className="p-1 text-[#8A94A6] hover:text-[#F43F5E]"
                        aria-label="Delete schedule"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Simulated Telegram Notification Webhook Integration */}
          <div className="rounded-lg bg-[#131620] border border-[#1E2230] p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-[#1E2230] pb-3">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-[#818CF8]" />
                <div>
                  <h2 className="text-[15px] font-bold text-[#F3F4F6]">
                    Telegram Notification Bot Integration (Simulated Webhook)
                  </h2>
                  <p className="text-xs text-[#8A94A6]">
                    Receive instant transfer completion, quota, and ping alerts via simulated Telegram webhook (no unauthorized file storage).
                  </p>
                </div>
              </div>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[#0E1017] border border-[#1E2230] text-[#10B981]">
                Tier: {activePlanId.toUpperCase()}
              </span>
            </div>

            {settings.telegramWebhookSim && (
              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-[#8A94A6] mb-1">Bot Handle (Simulated Webhook)</label>
                  <input
                    type="text"
                    value={settings.telegramWebhookSim.botHandle}
                    onChange={(e) =>
                      updateTelegramWebhookSim({ botHandle: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded bg-[#0E1017] border border-[#1E2230] font-mono text-[#F3F4F6]"
                  />
                </div>

                <div className="space-y-2 pt-2">
                  <label className="flex items-center justify-between p-2.5 rounded bg-[#0E1017] border border-[#1E2230]">
                    <span>Enable simulated Telegram bot notification webhook</span>
                    <input
                      type="checkbox"
                      checked={settings.telegramWebhookSim.enabled}
                      onChange={(e) =>
                        updateTelegramWebhookSim({
                          enabled: e.target.checked,
                        })
                      }
                      className="accent-[#4F46E5]"
                    />
                  </label>

                  <label className="flex items-center justify-between p-2.5 rounded bg-[#0E1017] border border-[#1E2230]">
                    <span>Notify on multipart upload & cross-cloud transfer completion</span>
                    <input
                      type="checkbox"
                      checked={settings.telegramWebhookSim.notifyOnUpload}
                      onChange={(e) =>
                        updateTelegramWebhookSim({
                          notifyOnUpload: e.target.checked,
                        })
                      }
                      className="accent-[#4F46E5]"
                    />
                  </label>

                  <label className="flex items-center justify-between p-2.5 rounded bg-[#0E1017] border border-[#1E2230]">
                    <span>
                      Notify on daily/monthly quota & ping threshold (85%) —{' '}
                      <strong className="text-[#818CF8]">PRO & ULTRA</strong>
                    </span>
                    <input
                      type="checkbox"
                      checked={settings.telegramWebhookSim.notifyOnQuotaWarn}
                      disabled={activePlanId === 'free'}
                      onChange={(e) =>
                        updateTelegramWebhookSim({
                          notifyOnQuotaWarn: e.target.checked,
                        })
                      }
                      className="accent-[#4F46E5]"
                    />
                  </label>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    addToast({
                      title: `Dispatched test alert to ${settings.telegramWebhookSim?.botHandle}`,
                      description: 'Simulated webhook endpoint acknowledged payload (200 OK).',
                      variant: 'success',
                    })
                  }
                  className="px-3.5 py-2 rounded bg-[#4F46E5] hover:bg-[#4338CA] text-white font-medium"
                >
                  Send Test Telegram Webhook Alert
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: Admin Plan Configurator Dashboard (Requirement 10: Make all plan prices, limits, and features configurable) */}
      {activeTab === 'admin' && (
        <div className="rounded-lg bg-[#131620] border border-[#1E2230] p-5 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#1E2230] pb-4">
            <div>
              <h2 className="text-[15px] font-bold text-[#F3F4F6]">
                Admin Subscription & Plan Configurator Dashboard
              </h2>
              <p className="text-xs text-[#8A94A6] mt-0.5">
                Configure monthly INR prices, annual discount percentages, max connected cloud accounts, daily/monthly transfer quotas, and feature bullets for FREE, PRO, and ULTRA. Changes immediately enforce in `StorageOrchestrator`.
              </p>
            </div>

            <button
              type="button"
              onClick={async () => {
                await resetCustomPlans();
                setAdminDraft(structuredClone(getEffectivePlans()[adminSelectedPlanId]));
                addToast({
                  title: 'Reset all plans to default INR specifications',
                  variant: 'default',
                });
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#0E1017] hover:bg-[#1E2230] border border-[#1E2230] text-xs font-medium text-[#8A94A6] hover:text-[#F3F4F6] self-start sm:self-auto"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Defaults</span>
            </button>
          </div>

          {/* Plan Selector Pills */}
          <div className="flex items-center gap-2">
            {PLAN_ORDER.map((pid) => (
              <button
                key={pid}
                type="button"
                onClick={() => handleSelectAdminPlan(pid)}
                className={`px-4 py-2 rounded-md text-xs font-mono font-bold uppercase border ${
                  adminSelectedPlanId === pid
                    ? 'bg-[#4F46E5] border-[#818CF8] text-white'
                    : 'bg-[#0E1017] border-[#1E2230] text-[#8A94A6] hover:text-[#F3F4F6]'
                }`}
              >
                Configure {plans[pid].name} (₹{plans[pid].baseMonthlyInr}/mo)
              </button>
            ))}
          </div>

          <form onSubmit={handleSaveAdminPlan} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-[#8A94A6] mb-1">
                  Monthly Price (₹ INR)
                </label>
                <input
                  type="number"
                  min={0}
                  max={50000}
                  value={adminDraft.baseMonthlyInr}
                  onChange={(e) =>
                    setAdminDraft({
                      ...adminDraft,
                      baseMonthlyInr: Math.max(0, Number(e.target.value)),
                    })
                  }
                  className="w-full px-3 py-2 rounded bg-[#0E1017] border border-[#1E2230] font-mono text-[#F3F4F6]"
                />
              </div>

              <div>
                <label className="block text-[#8A94A6] mb-1">
                  Annual Discount (%)
                </label>
                <input
                  type="number"
                  min={0}
                  max={80}
                  value={adminDraft.annualDiscountPercent}
                  onChange={(e) =>
                    setAdminDraft({
                      ...adminDraft,
                      annualDiscountPercent: Math.min(80, Math.max(0, Number(e.target.value))),
                    })
                  }
                  className="w-full px-3 py-2 rounded bg-[#0E1017] border border-[#1E2230] font-mono text-[#F3F4F6]"
                />
              </div>

              <div>
                <label className="block text-[#8A94A6] mb-1">
                  Max Connected Cloud Accounts
                </label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={adminDraft.maxMounts}
                  onChange={(e) =>
                    setAdminDraft({
                      ...adminDraft,
                      maxMounts: Math.max(1, Number(e.target.value)),
                    })
                  }
                  className="w-full px-3 py-2 rounded bg-[#0E1017] border border-[#1E2230] font-mono text-[#F3F4F6]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-[#8A94A6] mb-1">
                  Daily Upload/Download Limit (GB/day)
                </label>
                <input
                  type="number"
                  min={1}
                  max={10000}
                  value={adminDraft.dailyTransferLimitGB}
                  onChange={(e) =>
                    setAdminDraft({
                      ...adminDraft,
                      dailyTransferLimitGB: Math.max(1, Number(e.target.value)),
                    })
                  }
                  className="w-full px-3 py-2 rounded bg-[#0E1017] border border-[#1E2230] font-mono text-[#F3F4F6]"
                />
              </div>

              <div>
                <label className="block text-[#8A94A6] mb-1">
                  Monthly Cross-Cloud Limit (GB/month)
                </label>
                <input
                  type="number"
                  min={1}
                  max={100000}
                  value={adminDraft.monthlyTransferLimitGB}
                  onChange={(e) =>
                    setAdminDraft({
                      ...adminDraft,
                      monthlyTransferLimitGB: Math.max(1, Number(e.target.value)),
                    })
                  }
                  className="w-full px-3 py-2 rounded bg-[#0E1017] border border-[#1E2230] font-mono text-[#F3F4F6]"
                />
              </div>

              <div>
                <label className="block text-[#8A94A6] mb-1">
                  Max Bulk Files per Batch
                </label>
                <input
                  type="number"
                  min={1}
                  max={1000}
                  value={adminDraft.maxBulkFiles}
                  onChange={(e) =>
                    setAdminDraft({
                      ...adminDraft,
                      maxBulkFiles: Math.max(1, Number(e.target.value)),
                    })
                  }
                  className="w-full px-3 py-2 rounded bg-[#0E1017] border border-[#1E2230] font-mono text-[#F3F4F6]"
                />
              </div>
            </div>

            <div>
              <label className="block text-[#8A94A6] mb-1">
                Plan Feature Bullets (One feature per line)
              </label>
              <textarea
                rows={6}
                value={adminDraft.features.join('\n')}
                onChange={(e) =>
                  setAdminDraft({
                    ...adminDraft,
                    features: e.target.value
                      .split('\n')
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
                className="w-full p-3 rounded bg-[#0E1017] border border-[#1E2230] font-mono text-[#F3F4F6]"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#1E2230]">
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded bg-[#4F46E5] hover:bg-[#4338CA] text-white font-semibold"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Save {adminDraft.name} Plan Configuration</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Cancel Subscription Confirmation Modal (Requirement 11) */}
      {confirmCancelOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cancel-sub-title"
        >
          <div className="w-full max-w-md rounded-lg bg-[#131620] border border-[#1E2230] p-5 space-y-4">
            <div className="flex items-start gap-3">
              <Cloud className="w-5 h-5 text-[#F59E0B] shrink-0 mt-0.5" />
              <div>
                <h2 id="cancel-sub-title" className="text-[15px] font-bold text-[#F3F4F6]">
                  Cancel {currentPlan.name} Subscription?
                </h2>
                <p className="text-xs text-[#8A94A6] mt-1 leading-relaxed">
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
                className="px-3.5 py-1.5 rounded border border-[#1E2230] text-xs text-[#8A94A6] hover:text-[#F3F4F6]"
              >
                Keep {currentPlan.name}
              </button>
              <button
                type="button"
                onClick={async () => {
                  setConfirmCancelOpen(false);
                  await cancelSubscription();
                  addToast({
                    title: 'Subscription cancelled',
                    description:
                      externalMountsCount <= plans.free.maxMounts
                        ? 'Switched workspace to FREE (₹0/mo).'
                        : 'Subscription marked for cancellation at billing period end.',
                    variant: 'default',
                  });
                }}
                className="px-4 py-1.5 rounded bg-[#F43F5E] hover:bg-[#E11D48] text-white text-xs font-medium"
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
