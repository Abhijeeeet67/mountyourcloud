import {
  Activity,
  AlertTriangle,
  Check,
  CheckCircle2,
  Cloud,
  Copy,
  CreditCard,
  KeyRound,
  Loader2,
  Lock,
  RefreshCw,
  RotateCcw,
  Server,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  Users,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getAuthorizedHeaders } from '../lib/oauth';
import { formatFullTimestamp, formatRelativeOrShortDate } from '../lib/format';
import { PLAN_ORDER, getEffectivePlans } from '../lib/pricing';
import { useVaultStore } from '../store/useVaultStore';
import type { PlanDefinition, PlanId } from '../types/domain';

interface MaskedRazorpayBucket {
  configured: boolean;
  maskedKeyId: string;
  hasKeySecret: boolean;
  hasWebhookSecret: boolean;
  planIdProMonthly: string;
  planIdProAnnual: string;
  planIdUltraMonthly: string;
  planIdUltraAnnual: string;
  lastValidatedAt: number | null;
  validationStatus: 'valid' | 'invalid' | 'untested';
}

interface AdminRazorpayStatus {
  enabled: boolean;
  activeMode: 'test' | 'live';
  activeKeyId: string;
  webhookUrlPath: string;
  updatedAt: number;
  test: MaskedRazorpayBucket;
  live: MaskedRazorpayBucket;
}

interface AdminOverviewPayload {
  metrics: {
    totalUsers: number;
    activeConnectedAccounts: number;
    paidSubscriptions: number;
    totalRevenueInr: number;
  };
  users: Array<{
    id: string;
    email: string;
    displayName: string;
    provider: string;
    emailVerified: boolean;
    status: 'active' | 'suspended' | 'deleted';
    createdAt: number;
    updatedAt: number;
  }>;
  subscriptions: Array<{
    userId: string;
    planId: string;
    billingCycle: string;
    status: string;
    razorpayPaymentId?: string;
    updatedAt: number;
  }>;
  payments: Array<{
    orderId: string;
    userId: string;
    planId: string;
    billingCycle: string;
    amountPaise: number;
    status: string;
    mode?: string;
    paymentId?: string;
    createdAt: number;
  }>;
  connectedAccounts: Array<{
    id: string;
    userId: string;
    provider: string;
    email?: string;
    displayName: string;
    status: string;
    updatedAt: number;
  }>;
  razorpay: AdminRazorpayStatus;
  auditLogs: Array<{
    id: string;
    actorUserId: string;
    actorEmail: string;
    action: string;
    targetType: string;
    targetId?: string;
    metadata?: Record<string, unknown>;
    createdAt: number;
  }>;
}

type AdminTab = 'overview' | 'razorpay' | 'users' | 'plans' | 'audit';

export function AdminPage() {
  const currentAccount = useVaultStore((s) => s.currentAccount);
  const isAdmin = useVaultStore((s) => s.isAdmin);
  const settings = useVaultStore((s) => s.settings);
  const updateCustomPlanConfig = useVaultStore((s) => s.updateCustomPlanConfig);
  const resetCustomPlans = useVaultStore((s) => s.resetCustomPlans);
  const fetchBillingStatus = useVaultStore((s) => s.fetchBillingStatus);
  const addToast = useVaultStore((s) => s.addToast);

  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [loading, setLoading] = useState(true);
  const [accessDeniedMessage, setAccessDeniedMessage] = useState<string | null>(null);
  const [overview, setOverview] = useState<AdminOverviewPayload | null>(null);

  // Razorpay Form State
  const [rzpEnabled, setRzpEnabled] = useState(false);
  const [rzpMode, setRzpMode] = useState<'test' | 'live'>('test');
  const [editingEnv, setEditingEnv] = useState<'test' | 'live'>('test');
  const [confirmLiveModalOpen, setConfirmLiveModalOpen] = useState(false);

  const [testDraft, setTestDraft] = useState({
    keyId: '',
    keySecret: '',
    webhookSecret: '',
    planIdProMonthly: '',
    planIdProAnnual: '',
    planIdUltraMonthly: '',
    planIdUltraAnnual: '',
  });
  const [liveDraft, setLiveDraft] = useState({
    keyId: '',
    keySecret: '',
    webhookSecret: '',
    planIdProMonthly: '',
    planIdProAnnual: '',
    planIdUltraMonthly: '',
    planIdUltraAnnual: '',
  });

  const [savingRzp, setSavingRzp] = useState(false);
  const [validatingRzp, setValidatingRzp] = useState(false);
  const [validationStatus, setValidationStatus] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [copiedAdminUid, setCopiedAdminUid] = useState(false);

  // Plan Configurator State
  const plans = useMemo(
    () => getEffectivePlans(settings.customPlans),
    [settings.customPlans]
  );
  const [selectedPlanId, setSelectedPlanId] = useState<PlanId>('pro');
  const [planDraft, setPlanDraft] = useState<PlanDefinition>(() => plans.pro);

  const loadAdminOverview = useCallback(async () => {
    setLoading(true);
    setAccessDeniedMessage(null);
    try {
      const res = await fetch('/api/admin/overview', {
        headers: getAuthorizedHeaders(),
      });
      const data = await res.json();
      if (!res.ok) {
        setAccessDeniedMessage(
          data.error ||
            'Owner administrator privileges are required to view /app/admin.'
        );
        setOverview(null);
        return;
      }
      setOverview(data);
      const gw: AdminRazorpayStatus = data.razorpay;
      if (gw) {
        setRzpEnabled(gw.enabled);
        setRzpMode(gw.activeMode);
        setEditingEnv(gw.activeMode);
        setTestDraft((prev) => ({
          ...prev,
          keySecret: '',
          webhookSecret: '',
          planIdProMonthly: gw.test.planIdProMonthly || '',
          planIdProAnnual: gw.test.planIdProAnnual || '',
          planIdUltraMonthly: gw.test.planIdUltraMonthly || '',
          planIdUltraAnnual: gw.test.planIdUltraAnnual || '',
        }));
        setLiveDraft((prev) => ({
          ...prev,
          keySecret: '',
          webhookSecret: '',
          planIdProMonthly: gw.live.planIdProMonthly || '',
          planIdProAnnual: gw.live.planIdProAnnual || '',
          planIdUltraMonthly: gw.live.planIdUltraMonthly || '',
          planIdUltraAnnual: gw.live.planIdUltraAnnual || '',
        }));
      }
    } catch (err) {
      setAccessDeniedMessage(
        err instanceof Error ? err.message : 'Failed to load admin overview.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAdminOverview();
  }, [loadAdminOverview]);

  const handleSaveRazorpaySettings = async (
    confirmLiveSwitch = false,
    overrideMode?: 'test' | 'live'
  ) => {
    const targetMode = overrideMode ?? rzpMode;

    if (
      targetMode === 'live' &&
      overview?.razorpay.activeMode !== 'live' &&
      !confirmLiveSwitch
    ) {
      setConfirmLiveModalOpen(true);
      return;
    }

    setSavingRzp(true);
    setValidationStatus(null);
    const activeDraft = editingEnv === 'live' ? liveDraft : testDraft;

    try {
      const res = await fetch('/api/admin/razorpay', {
        method: 'POST',
        headers: {
          ...getAuthorizedHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          enabled: rzpEnabled,
          activeMode: targetMode,
          confirmLiveMode: confirmLiveSwitch || overview?.razorpay.activeMode === 'live',
          targetEnvironment: editingEnv,
          keyId: activeDraft.keyId.trim() || undefined,
          keySecret: activeDraft.keySecret.trim() || undefined,
          webhookSecret: activeDraft.webhookSecret.trim() || undefined,
          planIdProMonthly: activeDraft.planIdProMonthly.trim(),
          planIdProAnnual: activeDraft.planIdProAnnual.trim(),
          planIdUltraMonthly: activeDraft.planIdUltraMonthly.trim(),
          planIdUltraAnnual: activeDraft.planIdUltraAnnual.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save Razorpay configuration.');
      }

      setRzpMode(targetMode);
      setConfirmLiveModalOpen(false);
      await loadAdminOverview();
      await fetchBillingStatus();
      addToast({
        title: 'Razorpay Payment Gateway Updated',
        description: `Encrypted secrets saved server-side (${targetMode.toUpperCase()} mode).`,
        variant: 'success',
      });
    } catch (err) {
      addToast({
        title: 'Could not save Razorpay settings',
        description: err instanceof Error ? err.message : undefined,
        variant: 'error',
      });
    } finally {
      setSavingRzp(false);
    }
  };

  const handleValidateCredentials = async () => {
    setValidatingRzp(true);
    setValidationStatus(null);
    try {
      const res = await fetch('/api/admin/razorpay/validate', {
        method: 'POST',
        headers: {
          ...getAuthorizedHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          environment: editingEnv,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setValidationStatus({
          ok: false,
          message: data.error || 'Credential validation failed.',
        });
        addToast({
          title: 'Razorpay Validation Failed',
          description: data.error || 'Invalid Key ID or Key Secret.',
          variant: 'error',
        });
        return;
      }
      setValidationStatus({
        ok: true,
        message: data.message || 'Credentials verified with Razorpay API.',
      });
      await loadAdminOverview();
      addToast({
        title: 'Razorpay Credentials Verified',
        description: data.message,
        variant: 'success',
      });
    } catch (err) {
      setValidationStatus({
        ok: false,
        message: err instanceof Error ? err.message : 'Network error.',
      });
    } finally {
      setValidatingRzp(false);
    }
  };

  const handleToggleUserStatus = async (
    targetUserId: string,
    currentStatus: 'active' | 'suspended' | 'deleted'
  ) => {
    const nextStatus = currentStatus === 'active' ? 'suspended' : 'active';
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(targetUserId)}/status`, {
        method: 'POST',
        headers: {
          ...getAuthorizedHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Could not update user status.');
      }
      await loadAdminOverview();
      addToast({
        title: `User status set to ${nextStatus.toUpperCase()}`,
        variant: 'success',
      });
    } catch (err) {
      addToast({
        title: 'Action failed',
        description: err instanceof Error ? err.message : undefined,
        variant: 'error',
      });
    }
  };

  if (loading) {
    return (
      <div className="p-6 lg:p-8 max-w-7xl mx-auto flex items-center justify-center min-h-[420px]">
        <div className="flex items-center gap-2.5 text-sm text-[#6E6E73] dark:text-[#86868B]">
          <Loader2 className="w-4 h-4 animate-spin text-[#0071E3]" />
          <span>Verifying Owner Administrator authorization…</span>
        </div>
      </div>
    );
  }

  const currentAccountId = currentAccount?.id || currentAccount?.email || '';

  if (accessDeniedMessage || !overview) {
    return (
      <div className="p-6 lg:p-8 max-w-3xl mx-auto space-y-5">
        <div className="apple-card p-6 space-y-4 border-[#FF9F0A]/40">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-6 h-6 text-[#FF9F0A] shrink-0 mt-0.5" />
            <div>
              <h1 className="text-lg font-bold text-[#1D1D1F] dark:text-[#F5F5F7]">
                Owner Administrator Console (/app/admin)
              </h1>
              <p className="text-xs text-[#6E6E73] dark:text-[#86868B] mt-1 leading-relaxed">
                {accessDeniedMessage ||
                  'Access is restricted to the platform owner configured in MOUNTYOURCLOUDS_ADMIN_USER_ID.'}
              </p>
            </div>
          </div>

          {currentAccount && (
            <div className="p-4 rounded-xl bg-[#F5F5F7] dark:bg-[#0B0C10] border border-black/[0.08] dark:border-white/[0.08] space-y-2 text-xs">
              <p className="font-semibold text-[#1D1D1F] dark:text-[#F5F5F7]">
                How to Bootstrap Your Owner Admin Account:
              </p>
              <p className="text-[#6E6E73] dark:text-[#86868B]">
                Set the following environment variable on the backend server (or in your deployment
                secrets) to authorize your account as the platform owner:
              </p>
              <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-white dark:bg-[#15171E] border border-black/[0.08] dark:border-white/[0.1] font-mono text-[11px]">
                <span className="truncate">
                  MOUNTYOURCLOUDS_ADMIN_USER_ID={currentAccountId}
                </span>
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard?.writeText(
                      `MOUNTYOURCLOUDS_ADMIN_USER_ID=${currentAccountId}`
                    );
                    setCopiedAdminUid(true);
                    setTimeout(() => setCopiedAdminUid(false), 2000);
                  }}
                  className="px-2 py-1 rounded bg-[#0071E3] text-white inline-flex items-center gap-1 shrink-0"
                >
                  {copiedAdminUid ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedAdminUid ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  const gw = overview.razorpay;
  const fullWebhookUrl = `${window.location.origin}${gw.webhookUrlPath}`;
  const currentBucket = editingEnv === 'live' ? gw.live : gw.test;
  const currentDraft = editingEnv === 'live' ? liveDraft : testDraft;
  const setCurrentDraft = editingEnv === 'live' ? setLiveDraft : setTestDraft;

  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-7xl w-full mx-auto">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-[#0071E3]/15 text-[#0071E3] dark:text-[#0A84FF] text-[11px] font-semibold">
              Owner Administrator
            </span>
            {isAdmin && (
              <span className="text-xs font-mono text-[#6E6E73] dark:text-[#86868B]">
                UID: {currentAccountId}
              </span>
            )}
          </div>
          <h1 className="text-2xl font-bold text-[#1D1D1F] dark:text-[#F5F5F7] tracking-tight mt-1">
            Platform Administration & Payment Gateway
          </h1>
          <p className="text-xs text-[#6E6E73] dark:text-[#86868B] mt-0.5">
            Manage Razorpay payment credentials, subscription plans, connected cloud accounts, users, and security audit logs.
          </p>
        </div>

        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-black/[0.04] dark:bg-white/[0.05] border border-black/[0.06] dark:border-white/[0.08]">
          {(
            [
              { id: 'overview', label: 'Platform Overview', icon: Server },
              { id: 'razorpay', label: 'Payment Gateway (Razorpay)', icon: CreditCard },
              { id: 'users', label: 'Users & Invoices', icon: Users },
              { id: 'plans', label: 'Subscription Plans', icon: Settings2 },
              { id: 'audit', label: 'Security Audit Logs', icon: Activity },
            ] as const
          ).map((t) => {
            const Icon = t.icon;
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 tv-transition ${
                  active
                    ? 'bg-[#0071E3] text-white shadow-xs'
                    : 'text-[#6E6E73] dark:text-[#86868B] hover:text-[#1D1D1F] dark:hover:text-[#F5F5F7]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* TAB 1: PLATFORM OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="apple-card p-5 space-y-1.5">
              <div className="flex items-center justify-between text-xs text-[#6E6E73] dark:text-[#86868B]">
                <span>Registered Users</span>
                <Users className="w-4 h-4 text-[#0071E3]" />
              </div>
              <p className="text-2xl font-bold font-mono text-[#1D1D1F] dark:text-[#F5F5F7] tabular-nums">
                {overview.metrics.totalUsers}
              </p>
              <p className="text-[11px] text-[#6E6E73] dark:text-[#86868B]">
                Authenticated via Supabase / Session JWT
              </p>
            </div>

            <div className="apple-card p-5 space-y-1.5">
              <div className="flex items-center justify-between text-xs text-[#6E6E73] dark:text-[#86868B]">
                <span>Connected Cloud Accounts</span>
                <Cloud className="w-4 h-4 text-[#28CD41]" />
              </div>
              <p className="text-2xl font-bold font-mono text-[#1D1D1F] dark:text-[#F5F5F7] tabular-nums">
                {overview.metrics.activeConnectedAccounts}
              </p>
              <p className="text-[11px] text-[#6E6E73] dark:text-[#86868B]">
                Encrypted AES-256-GCM OAuth tokens
              </p>
            </div>

            <div className="apple-card p-5 space-y-1.5">
              <div className="flex items-center justify-between text-xs text-[#6E6E73] dark:text-[#86868B]">
                <span>Paid Subscriptions</span>
                <ShieldCheck className="w-4 h-4 text-[#0071E3]" />
              </div>
              <p className="text-2xl font-bold font-mono text-[#1D1D1F] dark:text-[#F5F5F7] tabular-nums">
                {overview.metrics.paidSubscriptions}
              </p>
              <p className="text-[11px] text-[#6E6E73] dark:text-[#86868B]">
                Active PRO & ULTRA workspaces
              </p>
            </div>

            <div className="apple-card p-5 space-y-1.5">
              <div className="flex items-center justify-between text-xs text-[#6E6E73] dark:text-[#86868B]">
                <span>Verified Revenue (INR)</span>
                <CreditCard className="w-4 h-4 text-[#28CD41]" />
              </div>
              <p className="text-2xl font-bold font-mono text-[#1D1D1F] dark:text-[#F5F5F7] tabular-nums">
                ₹{overview.metrics.totalRevenueInr.toLocaleString('en-IN')}
              </p>
              <p className="text-[11px] text-[#6E6E73] dark:text-[#86868B]">
                {overview.payments.length} total payment order(s)
              </p>
            </div>
          </div>

          {/* Gateway Readiness Summary Card */}
          <div className="apple-card p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-[#1D1D1F] dark:text-[#F5F5F7]">
                  Razorpay Payment Gateway Status
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-[11px] font-mono font-semibold uppercase ${
                    gw.enabled
                      ? 'bg-[#28CD41]/15 text-[#28CD41]'
                      : 'bg-[#FF9F0A]/15 text-[#D97706] dark:text-[#FFD60A]'
                  }`}
                >
                  {gw.enabled ? `READY (${gw.activeMode.toUpperCase()})` : 'CONFIGURATION REQUIRED'}
                </span>
              </div>
              <p className="text-xs text-[#6E6E73] dark:text-[#86868B]">
                Webhook Endpoint: <code className="font-mono">{fullWebhookUrl}</code>
              </p>
            </div>

            <button
              type="button"
              onClick={() => setActiveTab('razorpay')}
              className="px-4 py-2 rounded-xl bg-[#0071E3] hover:bg-[#0077ED] text-white text-xs font-semibold shrink-0"
            >
              Configure Razorpay Gateway
            </button>
          </div>
        </div>
      )}

      {/* TAB 2: SETTINGS -> PAYMENT GATEWAY -> RAZORPAY */}
      {activeTab === 'razorpay' && (
        <div className="space-y-6">
          <div className="apple-card p-6 space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-black/[0.06] dark:border-white/[0.08] pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-[#0071E3]" />
                  <h2 className="text-base font-bold text-[#1D1D1F] dark:text-[#F5F5F7]">
                    Settings → Payment Gateway → Razorpay
                  </h2>
                </div>
                <p className="text-xs text-[#6E6E73] dark:text-[#86868B] mt-1">
                  Configure Razorpay Test and Live credentials. Key Secrets and Webhook Secrets are
                  encrypted server-side using <code className="font-mono">APP_SECRETS_ENCRYPTION_KEY</code>{' '}
                  (AES-256-GCM) and are never returned to the browser after saving.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <label className="inline-flex items-center gap-2 text-xs font-medium text-[#1D1D1F] dark:text-[#F5F5F7] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rzpEnabled}
                    onChange={(e) => setRzpEnabled(e.target.checked)}
                    className="accent-[#0071E3] w-4 h-4"
                  />
                  <span>Enable Razorpay Checkout</span>
                </label>
              </div>
            </div>

            {/* Active Mode Switcher + Webhook URL */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-[#F5F5F7] dark:bg-[#0B0C10] border border-black/[0.06] dark:border-white/[0.08] space-y-2.5">
                <span className="block text-xs font-semibold text-[#1D1D1F] dark:text-[#F5F5F7]">
                  Active Gateway Environment Mode
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setRzpMode('test');
                      setEditingEnv('test');
                    }}
                    className={`py-2 px-3 rounded-lg text-xs font-mono font-semibold border tv-transition ${
                      rzpMode === 'test'
                        ? 'bg-[#0071E3] text-white border-[#0071E3]'
                        : 'bg-white dark:bg-[#15171E] text-[#6E6E73] border-black/[0.08] dark:border-white/[0.08]'
                    }`}
                  >
                    TEST MODE (rzp_test_*)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingEnv('live');
                      if (gw.activeMode !== 'live') {
                        setConfirmLiveModalOpen(true);
                      } else {
                        setRzpMode('live');
                      }
                    }}
                    className={`py-2 px-3 rounded-lg text-xs font-mono font-semibold border tv-transition ${
                      rzpMode === 'live'
                        ? 'bg-[#28CD41] text-black border-[#28CD41]'
                        : 'bg-white dark:bg-[#15171E] text-[#6E6E73] border-black/[0.08] dark:border-white/[0.08]'
                    }`}
                  >
                    LIVE MODE (rzp_live_*)
                  </button>
                </div>
                <p className="text-[11px] text-[#6E6E73] dark:text-[#86868B]">
                  Active mode determines which credential set is used for customer checkouts.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-[#F5F5F7] dark:bg-[#0B0C10] border border-black/[0.06] dark:border-white/[0.08] space-y-2.5">
                <span className="block text-xs font-semibold text-[#1D1D1F] dark:text-[#F5F5F7]">
                  Razorpay Webhook Endpoint URL (Read-Only)
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={fullWebhookUrl}
                    className="flex-1 px-3 py-2 rounded-lg bg-white dark:bg-[#15171E] border border-black/[0.08] dark:border-white/[0.1] text-xs font-mono text-[#1D1D1F] dark:text-[#F5F5F7]"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      await navigator.clipboard?.writeText(fullWebhookUrl);
                      setCopiedWebhook(true);
                      setTimeout(() => setCopiedWebhook(false), 2000);
                      addToast({ title: 'Copied Razorpay Webhook URL', variant: 'success' });
                    }}
                    className="px-3 py-2 rounded-lg bg-[#0071E3] text-white text-xs font-medium inline-flex items-center gap-1.5 shrink-0"
                  >
                    {copiedWebhook ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedWebhook ? 'Copied' : 'Copy URL'}</span>
                  </button>
                </div>
                <p className="text-[11px] text-[#6E6E73] dark:text-[#86868B]">
                  Configure this URL in Razorpay Dashboard → Webhooks with events:{' '}
                  <code className="font-mono">payment.captured</code>,{' '}
                  <code className="font-mono">order.paid</code>,{' '}
                  <code className="font-mono">subscription.charged</code>,{' '}
                  <code className="font-mono">subscription.cancelled</code>.
                </p>
              </div>
            </div>

            {/* Credential Set Editor Tabs (Test vs Live) */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 border-b border-black/[0.06] dark:border-white/[0.08] pb-3">
                <button
                  type="button"
                  onClick={() => setEditingEnv('test')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                    editingEnv === 'test'
                      ? 'bg-[#0071E3]/15 text-[#0071E3] dark:text-[#0A84FF]'
                      : 'text-[#6E6E73]'
                  }`}
                >
                  Edit Test Credentials ({gw.test.configured ? 'Configured' : 'Unconfigured'})
                </button>
                <button
                  type="button"
                  onClick={() => setEditingEnv('live')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                    editingEnv === 'live'
                      ? 'bg-[#28CD41]/15 text-[#28CD41]'
                      : 'text-[#6E6E73]'
                  }`}
                >
                  Edit Live Credentials ({gw.live.configured ? 'Configured' : 'Unconfigured'})
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-medium text-[#6E6E73] dark:text-[#86868B]">
                      Razorpay {editingEnv.toUpperCase()} Key ID
                    </label>
                    {currentBucket.maskedKeyId && (
                      <span className="font-mono text-[10px] text-[#0071E3]">
                        {currentBucket.maskedKeyId}
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    placeholder={editingEnv === 'live' ? 'rzp_live_...' : 'rzp_test_...'}
                    value={currentDraft.keyId}
                    onChange={(e) =>
                      setCurrentDraft({ ...currentDraft, keyId: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-[#F5F5F7] dark:bg-[#0B0C10] border border-black/[0.08] dark:border-white/[0.1] font-mono text-[#1D1D1F] dark:text-[#F5F5F7]"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-medium text-[#6E6E73] dark:text-[#86868B]">
                      Razorpay {editingEnv.toUpperCase()} Key Secret
                    </label>
                    {currentBucket.hasKeySecret && (
                      <span className="font-mono text-[10px] text-[#28CD41]">
                        Encrypted Secret Stored
                      </span>
                    )}
                  </div>
                  <input
                    type="password"
                    placeholder={
                      currentBucket.hasKeySecret
                        ? 'Leave blank to keep existing encrypted secret'
                        : 'Enter Razorpay Key Secret'
                    }
                    value={currentDraft.keySecret}
                    onChange={(e) =>
                      setCurrentDraft({ ...currentDraft, keySecret: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-[#F5F5F7] dark:bg-[#0B0C10] border border-black/[0.08] dark:border-white/[0.1] font-mono text-[#1D1D1F] dark:text-[#F5F5F7]"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-medium text-[#6E6E73] dark:text-[#86868B]">
                      {editingEnv.toUpperCase()} Webhook Secret
                    </label>
                    {currentBucket.hasWebhookSecret && (
                      <span className="font-mono text-[10px] text-[#28CD41]">
                        Encrypted Webhook Secret Stored
                      </span>
                    )}
                  </div>
                  <input
                    type="password"
                    placeholder={
                      currentBucket.hasWebhookSecret
                        ? 'Leave blank to keep existing webhook secret'
                        : 'Enter Razorpay Webhook Secret'
                    }
                    value={currentDraft.webhookSecret}
                    onChange={(e) =>
                      setCurrentDraft({ ...currentDraft, webhookSecret: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-[#F5F5F7] dark:bg-[#0B0C10] border border-black/[0.08] dark:border-white/[0.1] font-mono text-[#1D1D1F] dark:text-[#F5F5F7]"
                  />
                </div>
              </div>

              {/* Optional Razorpay Recurring Subscription Plan IDs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs pt-2">
                <div>
                  <label className="block text-[#6E6E73] dark:text-[#86868B] mb-1">
                    PRO Monthly Plan ID (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="plan_..."
                    value={currentDraft.planIdProMonthly}
                    onChange={(e) =>
                      setCurrentDraft({ ...currentDraft, planIdProMonthly: e.target.value })
                    }
                    className="w-full px-3 py-1.5 rounded-xl bg-[#F5F5F7] dark:bg-[#0B0C10] border border-black/[0.08] dark:border-white/[0.1] font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[#6E6E73] dark:text-[#86868B] mb-1">
                    PRO Annual Plan ID (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="plan_..."
                    value={currentDraft.planIdProAnnual}
                    onChange={(e) =>
                      setCurrentDraft({ ...currentDraft, planIdProAnnual: e.target.value })
                    }
                    className="w-full px-3 py-1.5 rounded-xl bg-[#F5F5F7] dark:bg-[#0B0C10] border border-black/[0.08] dark:border-white/[0.1] font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[#6E6E73] dark:text-[#86868B] mb-1">
                    ULTRA Monthly Plan ID (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="plan_..."
                    value={currentDraft.planIdUltraMonthly}
                    onChange={(e) =>
                      setCurrentDraft({ ...currentDraft, planIdUltraMonthly: e.target.value })
                    }
                    className="w-full px-3 py-1.5 rounded-xl bg-[#F5F5F7] dark:bg-[#0B0C10] border border-black/[0.08] dark:border-white/[0.1] font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[#6E6E73] dark:text-[#86868B] mb-1">
                    ULTRA Annual Plan ID (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="plan_..."
                    value={currentDraft.planIdUltraAnnual}
                    onChange={(e) =>
                      setCurrentDraft({ ...currentDraft, planIdUltraAnnual: e.target.value })
                    }
                    className="w-full px-3 py-1.5 rounded-xl bg-[#F5F5F7] dark:bg-[#0B0C10] border border-black/[0.08] dark:border-white/[0.1] font-mono"
                  />
                </div>
              </div>

              {validationStatus && (
                <div
                  className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                    validationStatus.ok
                      ? 'bg-[#28CD41]/10 border-[#28CD41]/30 text-[#28CD41]'
                      : 'bg-[#FF3B30]/10 border-[#FF3B30]/30 text-[#FF3B30]'
                  }`}
                >
                  {validationStatus.ok ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                  )}
                  <span>{validationStatus.message}</span>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-black/[0.06] dark:border-white/[0.08]">
                <div className="flex items-center gap-1.5 text-[11px] text-[#6E6E73] dark:text-[#86868B]">
                  <Lock className="w-3.5 h-3.5 text-[#28CD41]" />
                  <span>
                    Encrypted at rest with AES-256-GCM · Last updated{' '}
                    {formatRelativeOrShortDate(gw.updatedAt)}
                  </span>
                </div>

                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    disabled={validatingRzp}
                    onClick={handleValidateCredentials}
                    className="px-3.5 py-2 rounded-xl border border-black/[0.1] dark:border-white/[0.12] text-xs font-medium inline-flex items-center gap-1.5 hover:bg-black/[0.04] dark:hover:bg-white/[0.05]"
                  >
                    {validatingRzp ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="w-3.5 h-3.5" />
                    )}
                    <span>Validate {editingEnv.toUpperCase()} Credentials</span>
                  </button>

                  <button
                    type="button"
                    disabled={savingRzp}
                    onClick={() => handleSaveRazorpaySettings(false)}
                    className="px-4 py-2 rounded-xl bg-[#0071E3] hover:bg-[#0077ED] text-white text-xs font-semibold inline-flex items-center gap-1.5"
                  >
                    {savingRzp ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    )}
                    <span>Save Razorpay Gateway Settings</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: USERS, SUBSCRIPTIONS & INVOICES */}
      {activeTab === 'users' && (
        <div className="space-y-6">
          {/* Users Table */}
          <div className="apple-card overflow-hidden">
            <div className="px-5 py-4 border-b border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between">
              <h2 className="text-sm font-bold text-[#1D1D1F] dark:text-[#F5F5F7]">
                Platform Users ({overview.users.length})
              </h2>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#F5F5F7] dark:bg-[#0B0C10] text-[#6E6E73] dark:text-[#86868B] uppercase text-[11px]">
                  <tr>
                    <th className="py-2.5 px-4">User</th>
                    <th className="py-2.5 px-4">Auth Provider</th>
                    <th className="py-2.5 px-4">Plan</th>
                    <th className="py-2.5 px-4">Status</th>
                    <th className="py-2.5 px-4">Updated</th>
                    <th className="py-2.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/[0.06] dark:divide-white/[0.08]">
                  {overview.users.map((u) => {
                    const sub = overview.subscriptions.find((s) => s.userId === u.id);
                    return (
                      <tr key={u.id}>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-[#1D1D1F] dark:text-[#F5F5F7]">
                            {u.displayName}
                          </div>
                          <div className="font-mono text-[11px] text-[#6E6E73] dark:text-[#86868B]">
                            {u.email} · {u.id.slice(0, 12)}
                          </div>
                        </td>
                        <td className="py-3 px-4 font-mono uppercase">{u.provider}</td>
                        <td className="py-3 px-4 font-mono uppercase font-bold text-[#0071E3]">
                          {sub?.planId ?? 'FREE'}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase ${
                              u.status === 'active'
                                ? 'bg-[#28CD41]/15 text-[#28CD41]'
                                : 'bg-[#FF3B30]/15 text-[#FF3B30]'
                            }`}
                          >
                            {u.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px] text-[#6E6E73]">
                          {formatFullTimestamp(u.updatedAt)}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {u.id !== currentAccountId && (
                            <button
                              type="button"
                              onClick={() => handleToggleUserStatus(u.id, u.status)}
                              className="px-2.5 py-1 rounded-lg border border-black/[0.08] dark:border-white/[0.1] text-[11px] font-medium hover:bg-black/[0.04]"
                            >
                              {u.status === 'active' ? 'Suspend' : 'Activate'}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Verified Payment Orders Ledger */}
          <div className="apple-card overflow-hidden">
            <div className="px-5 py-4 border-b border-black/[0.06] dark:border-white/[0.08]">
              <h2 className="text-sm font-bold text-[#1D1D1F] dark:text-[#F5F5F7]">
                Razorpay Payment Orders & Invoice Ledger ({overview.payments.length})
              </h2>
            </div>

            {overview.payments.length === 0 ? (
              <p className="p-6 text-xs text-[#6E6E73] dark:text-[#86868B] text-center">
                No payment transactions recorded yet.
              </p>
            ) : (
              <div className="divide-y divide-black/[0.06] dark:divide-white/[0.08]">
                {overview.payments.map((ord) => (
                  <div
                    key={ord.orderId}
                    className="px-5 py-3 flex items-center justify-between gap-4 text-xs"
                  >
                    <div>
                      <p className="font-semibold text-[#1D1D1F] dark:text-[#F5F5F7]">
                        Order {ord.orderId} — {ord.planId.toUpperCase()} ({ord.billingCycle})
                      </p>
                      <p className="font-mono text-[11px] text-[#6E6E73] dark:text-[#86868B]">
                        User: {ord.userId} · {formatFullTimestamp(ord.createdAt)}
                        {ord.paymentId ? ` · Payment ID: ${ord.paymentId}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        className={`px-2 py-0.5 rounded font-mono text-[10px] uppercase ${
                          ord.status === 'paid'
                            ? 'bg-[#28CD41]/15 text-[#28CD41]'
                            : 'bg-[#FF9F0A]/15 text-[#FF9F0A]'
                        }`}
                      >
                        {ord.status}
                      </span>
                      <span className="font-mono font-bold text-sm tabular-nums">
                        ₹{Math.round(ord.amountPaise / 100).toLocaleString('en-IN')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: SUBSCRIPTION PLANS & QUOTAS CONFIGURATOR */}
      {activeTab === 'plans' && (
        <div className="apple-card p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-black/[0.06] dark:border-white/[0.08] pb-4">
            <div>
              <h2 className="text-base font-bold text-[#1D1D1F] dark:text-[#F5F5F7]">
                Subscription Plans & Quotas Configurator
              </h2>
              <p className="text-xs text-[#6E6E73] dark:text-[#86868B] mt-0.5">
                Configure monthly INR pricing, annual discounts, connected cloud slot limits, and daily/monthly transfer quotas.
              </p>
            </div>

            <button
              type="button"
              onClick={async () => {
                await resetCustomPlans();
                setPlanDraft(structuredClone(getEffectivePlans()[selectedPlanId]));
                addToast({
                  title: 'Reset all plans to default INR specifications',
                  variant: 'default',
                });
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-black/[0.08] dark:border-white/[0.1] text-xs font-medium"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Defaults</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            {PLAN_ORDER.map((pid) => (
              <button
                key={pid}
                type="button"
                onClick={() => {
                  setSelectedPlanId(pid);
                  setPlanDraft(structuredClone(plans[pid]));
                }}
                className={`px-4 py-2 rounded-xl text-xs font-mono font-bold uppercase border ${
                  selectedPlanId === pid
                    ? 'bg-[#0071E3] border-[#0071E3] text-white'
                    : 'bg-[#F5F5F7] dark:bg-[#0B0C10] border-black/[0.08] dark:border-white/[0.08]'
                }`}
              >
                {plans[pid].name} (₹{plans[pid].baseMonthlyInr}/mo)
              </button>
            ))}
          </div>

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await updateCustomPlanConfig(selectedPlanId, planDraft);
              addToast({
                title: `Saved ${planDraft.name} Plan Configuration`,
                variant: 'success',
              });
            }}
            className="space-y-4 text-xs"
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-[#6E6E73] mb-1">Monthly Price (₹ INR)</label>
                <input
                  type="number"
                  min={0}
                  max={50000}
                  value={planDraft.baseMonthlyInr}
                  onChange={(e) =>
                    setPlanDraft({
                      ...planDraft,
                      baseMonthlyInr: Math.max(0, Number(e.target.value)),
                    })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-[#F5F5F7] dark:bg-[#0B0C10] border border-black/[0.08] dark:border-white/[0.1] font-mono"
                />
              </div>

              <div>
                <label className="block text-[#6E6E73] mb-1">Annual Discount (%)</label>
                <input
                  type="number"
                  min={0}
                  max={80}
                  value={planDraft.annualDiscountPercent}
                  onChange={(e) =>
                    setPlanDraft({
                      ...planDraft,
                      annualDiscountPercent: Math.min(80, Math.max(0, Number(e.target.value))),
                    })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-[#F5F5F7] dark:bg-[#0B0C10] border border-black/[0.08] dark:border-white/[0.1] font-mono"
                />
              </div>

              <div>
                <label className="block text-[#6E6E73] mb-1">Max Connected Cloud Accounts</label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={planDraft.maxMounts}
                  onChange={(e) =>
                    setPlanDraft({
                      ...planDraft,
                      maxMounts: Math.max(1, Number(e.target.value)),
                    })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-[#F5F5F7] dark:bg-[#0B0C10] border border-black/[0.08] dark:border-white/[0.1] font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-[#6E6E73] mb-1">Daily Transfer Limit (GB/day)</label>
                <input
                  type="number"
                  min={1}
                  max={10000}
                  value={planDraft.dailyTransferLimitGB}
                  onChange={(e) =>
                    setPlanDraft({
                      ...planDraft,
                      dailyTransferLimitGB: Math.max(1, Number(e.target.value)),
                    })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-[#F5F5F7] dark:bg-[#0B0C10] border border-black/[0.08] dark:border-white/[0.1] font-mono"
                />
              </div>

              <div>
                <label className="block text-[#6E6E73] mb-1">Monthly Transfer Limit (GB/mo)</label>
                <input
                  type="number"
                  min={1}
                  max={100000}
                  value={planDraft.monthlyTransferLimitGB}
                  onChange={(e) =>
                    setPlanDraft({
                      ...planDraft,
                      monthlyTransferLimitGB: Math.max(1, Number(e.target.value)),
                    })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-[#F5F5F7] dark:bg-[#0B0C10] border border-black/[0.08] dark:border-white/[0.1] font-mono"
                />
              </div>

              <div>
                <label className="block text-[#6E6E73] mb-1">Max Bulk Files per Batch</label>
                <input
                  type="number"
                  min={1}
                  max={1000}
                  value={planDraft.maxBulkFiles}
                  onChange={(e) =>
                    setPlanDraft({
                      ...planDraft,
                      maxBulkFiles: Math.max(1, Number(e.target.value)),
                    })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-[#F5F5F7] dark:bg-[#0B0C10] border border-black/[0.08] dark:border-white/[0.1] font-mono"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-[#0071E3] hover:bg-[#0077ED] text-white font-semibold"
              >
                Save {planDraft.name} Configuration
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB 5: SECURITY AUDIT LOGS */}
      {activeTab === 'audit' && (
        <div className="apple-card overflow-hidden">
          <div className="px-5 py-4 border-b border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between">
            <h2 className="text-sm font-bold text-[#1D1D1F] dark:text-[#F5F5F7]">
              Security & Billing Audit Trail ({overview.auditLogs.length})
            </h2>
          </div>

          {overview.auditLogs.length === 0 ? (
            <p className="p-6 text-xs text-[#6E6E73] text-center">No audit events recorded yet.</p>
          ) : (
            <div className="divide-y divide-black/[0.06] dark:divide-white/[0.08]">
              {overview.auditLogs.map((log) => (
                <div
                  key={log.id}
                  className="px-5 py-3 flex items-center justify-between gap-4 text-xs"
                >
                  <div>
                    <span className="font-mono font-bold text-[#0071E3]">{log.action}</span>
                    <span className="text-[#6E6E73] ml-2">
                      Actor: <code className="font-mono">{log.actorEmail || log.actorUserId}</code> · Target:{' '}
                      <code className="font-mono">
                        {log.targetType}/{log.targetId || '—'}
                      </code>
                    </span>
                  </div>
                  <span className="font-mono text-[11px] text-[#6E6E73] shrink-0">
                    {formatFullTimestamp(log.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Explicit Confirmation Modal Before Activating Razorpay LIVE Mode */}
      {confirmLiveModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-live-title"
        >
          <div className="w-full max-w-md apple-card p-6 space-y-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-[#FF9F0A] shrink-0 mt-0.5" />
              <div>
                <h2
                  id="confirm-live-title"
                  className="text-base font-bold text-[#1D1D1F] dark:text-[#F5F5F7]"
                >
                  Activate Razorpay LIVE Mode?
                </h2>
                <p className="text-xs text-[#6E6E73] dark:text-[#86868B] mt-1 leading-relaxed">
                  Switching the payment gateway to <strong>LIVE MODE</strong> will process real
                  monetary transactions in INR using your <code className="font-mono">rzp_live_*</code>{' '}
                  credentials. Ensure your Live Key ID, Key Secret, and Webhook Secret are verified.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmLiveModalOpen(false)}
                className="px-3.5 py-1.5 rounded-lg border border-black/[0.08] dark:border-white/[0.1] text-xs font-medium"
              >
                Keep Test Mode
              </button>
              <button
                type="button"
                onClick={() => {
                  setRzpMode('live');
                  handleSaveRazorpaySettings(true, 'live');
                }}
                className="px-4 py-1.5 rounded-lg bg-[#28CD41] text-black text-xs font-bold"
              >
                Confirm & Enable Live Mode
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
