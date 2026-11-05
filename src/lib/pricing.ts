import type {
  ActivityEvent,
  BillingCycle,
  PlanDefinition,
  PlanId,
  ProviderKind,
} from '../types/domain';
import { SI_GB } from './format';

// NOTE: All pricing and provider egress rates below are illustrative demo numbers
// and must be verified against official cloud provider pricing before any real-world use.
export const PROVIDER_EGRESS_RATES_USD_PER_GB: Record<ProviderKind, number> = {
  local: 0,
  // Category A: Consumer Cloud (18)
  gdrive: 0,
  onedrive: 0,
  dropbox: 0,
  box: 0,
  mega: 0,
  terabox: 0,
  pcloud: 0,
  proton: 0,
  icloud: 0,
  sync: 0,
  kdrive: 0,
  koofr: 0,
  filen: 0,
  internxt: 0,
  jottacloud: 0,
  zoho: 0,
  yandex: 0,
  mediafire: 0,
  // Category B: Object & Developer Storage (12)
  s3: 0.09,
  r2: 0,
  gcs: 0.12,
  azure: 0.087,
  b2: 0,
  wasabi: 0,
  do_spaces: 0.01,
  oracle_os: 0.008,
  scaleway: 0.01,
  linode: 0.01,
  vultr: 0.01,
  storj: 0.007,
  // Category C: Self-Hosted & Network Storage (9)
  nextcloud: 0,
  owncloud: 0,
  synology: 0,
  qnap: 0,
  webdav: 0,
  hetzner: 0,
  sftp: 0,
  smb: 0,
  ftp: 0,
};

export const DEFAULT_PLANS: Record<PlanId, PlanDefinition> = {
  free: {
    id: 'free',
    name: 'FREE',
    tagline: 'For casual users and beginners.',
    audience: 'For casual users and beginners',
    baseMonthlyInr: 0,
    annualDiscountPercent: 20,
    maxMounts: 2,
    dailyTransferLimitGB: 5,
    monthlyTransferLimitGB: 25,
    maxBulkFiles: 3,
    priorityLabel: 'Standard queue priority',
    features: [
      'Connect up to 2 cloud storage accounts',
      'Basic file browsing and management',
      'Limited daily uploads and downloads (5 GB/day)',
      'Limited file transfers between clouds (25 GB/month)',
      'Basic search functionality',
      'Standard transfer speed and processing priority',
      'Basic Telegram notification alerts (simulated webhook)',
      'Limited automation features',
      'Standard support',
    ],
    allowBulkOperations: false,
    allowAdvancedSearch: false,
    allowAutoOrganize: false,
    allowScheduledTransfers: false,
    allowCrossCloudSync: false,
  },
  pro: {
    id: 'pro',
    name: 'PRO',
    tagline: 'For regular users and cloud storage enthusiasts.',
    audience: 'For regular users and cloud storage enthusiasts',
    baseMonthlyInr: 199,
    annualDiscountPercent: 20,
    maxMounts: 7,
    dailyTransferLimitGB: 50,
    monthlyTransferLimitGB: 500,
    maxBulkFiles: 25,
    priorityLabel: 'Priority transfer queue',
    badgeText: 'Most Popular · Recommended',
    isPopular: true,
    features: [
      'Connect up to 7 cloud storage accounts',
      'Higher daily upload and download limits (50 GB/day)',
      'Increased cross-cloud transfer limits (500 GB/month)',
      'Bulk file uploads and downloads (up to 25 files/batch)',
      'Advanced file search and filtering',
      'Automated file organization',
      'Scheduled transfers',
      'Advanced Telegram notification & bot alerts (simulated)',
      'Background transfer queues',
      'Transfer history and analytics',
      'Priority processing',
      'No advertisements',
      'Priority support',
    ],
    allowBulkOperations: true,
    allowAdvancedSearch: true,
    allowAutoOrganize: true,
    allowScheduledTransfers: true,
    allowCrossCloudSync: false,
  },
  ultra: {
    id: 'ultra',
    name: 'ULTRA',
    tagline: 'For professionals, creators and heavy cloud storage users.',
    audience: 'For professionals, creators and heavy cloud storage users',
    baseMonthlyInr: 499,
    annualDiscountPercent: 20,
    maxMounts: 20,
    dailyTransferLimitGB: 250,
    monthlyTransferLimitGB: 2500,
    maxBulkFiles: 100,
    priorityLabel: 'Maximum processing priority',
    badgeText: 'Premium Power Tier',
    isPremium: true,
    features: [
      'Connect up to 20 cloud storage accounts',
      'Highest available upload and download limits (250 GB/day)',
      'Higher cross-cloud transfer quotas (2.5 TB/month)',
      'Advanced bulk file operations (up to 100 files/batch)',
      'Advanced automation workflows',
      'Scheduled and recurring transfers',
      'Advanced Telegram notification & bot rules (simulated)',
      'Cross-cloud synchronization',
      'Advanced file indexing and search',
      'Background and queued transfers',
      'Advanced storage analytics',
      'Maximum available processing priority',
      'No advertisements',
      'Priority customer support',
      'Early access to new features',
    ],
    allowBulkOperations: true,
    allowAdvancedSearch: true,
    allowAutoOrganize: true,
    allowScheduledTransfers: true,
    allowCrossCloudSync: true,
  },
};

export const PLAN_ORDER: PlanId[] = ['free', 'pro', 'ultra'];

export function getEffectivePlans(
  customPlans?: Record<PlanId, PlanDefinition>
): Record<PlanId, PlanDefinition> {
  if (!customPlans) return DEFAULT_PLANS;
  return {
    free: { ...DEFAULT_PLANS.free, ...(customPlans.free ?? {}) },
    pro: { ...DEFAULT_PLANS.pro, ...(customPlans.pro ?? {}) },
    ultra: { ...DEFAULT_PLANS.ultra, ...(customPlans.ultra ?? {}) },
  };
}

export function normalizePlanId(rawId: string | undefined): PlanId {
  if (rawId === 'free' || rawId === 'pro' || rawId === 'ultra') return rawId;
  if (rawId === 'starter') return 'free';
  if (rawId === 'enterprise') return 'ultra';
  return 'pro';
}

export function getEffectiveMonthlyInr(
  plan: PlanDefinition,
  billingCycle: BillingCycle
): number {
  if (plan.baseMonthlyInr <= 0) return 0;
  if (billingCycle === 'annual') {
    const discountFactor = Math.max(0, Math.min(100, 100 - plan.annualDiscountPercent)) / 100;
    return Math.round(plan.baseMonthlyInr * discountFactor);
  }
  return plan.baseMonthlyInr;
}

export function getBilledTotalInr(
  plan: PlanDefinition,
  billingCycle: BillingCycle
): number {
  if (plan.baseMonthlyInr <= 0) return 0;
  if (billingCycle === 'annual') {
    return getEffectiveMonthlyInr(plan, 'annual') * 12;
  }
  return plan.baseMonthlyInr;
}

export interface TransferQuotaUsage {
  dailyUsedBytes: number;
  dailyLimitBytes: number;
  dailyRemainingBytes: number;
  monthlyUsedBytes: number;
  monthlyLimitBytes: number;
  monthlyRemainingBytes: number;
}

export function computeTransferQuotaUsage(
  activity: ActivityEvent[],
  plan: PlanDefinition,
  now: number = Date.now()
): TransferQuotaUsage {
  const oneDayAgo = now - 24 * 60 * 60 * 1000;
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

  let dailyUsedBytes = 0;
  let monthlyUsedBytes = 0;

  for (const ev of activity) {
    if (ev.ts >= thirtyDaysAgo) {
      monthlyUsedBytes += ev.bytes;
    }
    if (ev.ts >= oneDayAgo) {
      dailyUsedBytes += ev.bytes;
    }
  }

  const dailyLimitBytes = plan.dailyTransferLimitGB * SI_GB;
  const monthlyLimitBytes = plan.monthlyTransferLimitGB * SI_GB;

  return {
    dailyUsedBytes,
    dailyLimitBytes,
    dailyRemainingBytes: Math.max(0, dailyLimitBytes - dailyUsedBytes),
    monthlyUsedBytes,
    monthlyLimitBytes,
    monthlyRemainingBytes: Math.max(0, monthlyLimitBytes - monthlyUsedBytes),
  };
}

export function checkPlanSwitchAllowed(
  targetPlanId: PlanId,
  externalMountCount: number,
  plansMap: Record<PlanId, PlanDefinition> = DEFAULT_PLANS
): { allowed: boolean; reason: string | null } {
  const plan = plansMap[targetPlanId];
  if (externalMountCount > plan.maxMounts) {
    return {
      allowed: false,
      reason: `Cannot switch to ${plan.name}: you currently have ${externalMountCount} connected cloud storage accounts, which exceeds ${plan.name}'s limit of ${plan.maxMounts} cloud accounts. Remove ${externalMountCount - plan.maxMounts} cloud mount(s) in Providers first.`,
    };
  }
  return { allowed: true, reason: null };
}

export function calculateZeroEgressSavingsUsd(zeroEgressBytesThisMonth: number): number {
  const gb = zeroEgressBytesThisMonth / SI_GB;
  return Number((gb * PROVIDER_EGRESS_RATES_USD_PER_GB.s3).toFixed(2));
}

export function estimateAllPlans(
  billingCycle: BillingCycle,
  desiredClouds: number,
  desiredDailyGB: number,
  plansMap: Record<PlanId, PlanDefinition> = DEFAULT_PLANS
): {
  estimates: Record<
    PlanId,
    {
      fits: boolean;
      effectiveMonthlyInr: number;
      reasonIfBlocked: string | null;
    }
  >;
  recommendedPlanId: PlanId;
} {
  const estimates = {} as Record<
    PlanId,
    {
      fits: boolean;
      effectiveMonthlyInr: number;
      reasonIfBlocked: string | null;
    }
  >;

  let recommendedPlanId: PlanId = 'ultra';
  let foundRecommendation = false;

  for (const pid of PLAN_ORDER) {
    const p = plansMap[pid];
    const effectiveMonthlyInr = getEffectiveMonthlyInr(p, billingCycle);
    let fits = true;
    let reasonIfBlocked: string | null = null;

    if (desiredClouds > p.maxMounts) {
      fits = false;
      reasonIfBlocked = `Max ${p.maxMounts} cloud accounts (${desiredClouds} selected)`;
    } else if (desiredDailyGB > p.dailyTransferLimitGB) {
      fits = false;
      reasonIfBlocked = `Max ${p.dailyTransferLimitGB} GB/day (${desiredDailyGB} GB selected)`;
    }

    if (fits && !foundRecommendation) {
      recommendedPlanId = pid;
      foundRecommendation = true;
    }

    estimates[pid] = {
      fits,
      effectiveMonthlyInr,
      reasonIfBlocked,
    };
  }

  return { estimates, recommendedPlanId };
}

