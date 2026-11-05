import { describe, expect, it } from 'vitest';
import { SI_GB } from '../lib/format';
import {
  calculateZeroEgressSavingsUsd,
  checkPlanSwitchAllowed,
  computeTransferQuotaUsage,
  DEFAULT_PLANS,
  estimateAllPlans,
  getBilledTotalInr,
  getEffectiveMonthlyInr,
  normalizePlanId,
} from '../lib/pricing';
import type { ActivityEvent } from '../types/domain';

describe('Pricing & Subscription Quota Logic', () => {
  describe('normalizePlanId', () => {
    it('returns valid plan IDs directly', () => {
      expect(normalizePlanId('free')).toBe('free');
      expect(normalizePlanId('pro')).toBe('pro');
      expect(normalizePlanId('ultra')).toBe('ultra');
    });

    it('maps aliases and fallbacks cleanly', () => {
      expect(normalizePlanId('starter')).toBe('free');
      expect(normalizePlanId('enterprise')).toBe('ultra');
      expect(normalizePlanId(undefined)).toBe('pro');
      expect(normalizePlanId('unknown')).toBe('pro');
    });
  });

  describe('getEffectiveMonthlyInr & getBilledTotalInr', () => {
    it('computes free plan as ₹0 always', () => {
      expect(getEffectiveMonthlyInr(DEFAULT_PLANS.free, 'monthly')).toBe(0);
      expect(getEffectiveMonthlyInr(DEFAULT_PLANS.free, 'annual')).toBe(0);
      expect(getBilledTotalInr(DEFAULT_PLANS.free, 'monthly')).toBe(0);
      expect(getBilledTotalInr(DEFAULT_PLANS.free, 'annual')).toBe(0);
    });

    it('computes PRO monthly (₹199) and 20% annual discount (₹159/mo, ₹1908 billed)', () => {
      expect(getEffectiveMonthlyInr(DEFAULT_PLANS.pro, 'monthly')).toBe(199);
      expect(getEffectiveMonthlyInr(DEFAULT_PLANS.pro, 'annual')).toBe(159);
      expect(getBilledTotalInr(DEFAULT_PLANS.pro, 'monthly')).toBe(199);
      expect(getBilledTotalInr(DEFAULT_PLANS.pro, 'annual')).toBe(159 * 12);
    });

    it('computes ULTRA monthly (₹499) and 20% annual discount (₹399/mo, ₹4788 billed)', () => {
      expect(getEffectiveMonthlyInr(DEFAULT_PLANS.ultra, 'monthly')).toBe(499);
      expect(getEffectiveMonthlyInr(DEFAULT_PLANS.ultra, 'annual')).toBe(399);
      expect(getBilledTotalInr(DEFAULT_PLANS.ultra, 'monthly')).toBe(499);
      expect(getBilledTotalInr(DEFAULT_PLANS.ultra, 'annual')).toBe(399 * 12);
    });
  });

  describe('checkPlanSwitchAllowed', () => {
    it('allows switching when connected mounts are within the target limit', () => {
      // Free allows 2 mounts
      expect(checkPlanSwitchAllowed('free', 1).allowed).toBe(true);
      expect(checkPlanSwitchAllowed('free', 2).allowed).toBe(true);
      // Pro allows 7 mounts
      expect(checkPlanSwitchAllowed('pro', 5).allowed).toBe(true);
      expect(checkPlanSwitchAllowed('ultra', 15).allowed).toBe(true);
    });

    it('denies downgrade when mounts exceed target plan capacity', () => {
      const result = checkPlanSwitchAllowed('free', 4);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('exceeds FREE\'s limit of 2 cloud accounts');
      expect(result.reason).toContain('Remove 2 cloud mount(s)');
    });
  });

  describe('computeTransferQuotaUsage', () => {
    it('correctly buckets 24-hour and 30-day activity events', () => {
      const now = 1_700_000_000_000;
      const activity: ActivityEvent[] = [
        { ts: now - 2 * 3600 * 1000, kind: 'ingress', bytes: 1 * SI_GB, providerId: 'p1' },
        { ts: now - 12 * 3600 * 1000, kind: 'egress', bytes: 2 * SI_GB, providerId: 'p1' },
        { ts: now - 3 * 86400 * 1000, kind: 'ingress', bytes: 10 * SI_GB, providerId: 'p2' },
        { ts: now - 35 * 86400 * 1000, kind: 'ingress', bytes: 50 * SI_GB, providerId: 'p2' }, // expired >30d
      ];

      // FREE plan: dailyLimit = 5 GB, monthlyLimit = 25 GB
      const usage = computeTransferQuotaUsage(activity, DEFAULT_PLANS.free, now);

      // Within 24h: 1 GB + 2 GB = 3 GB
      expect(usage.dailyUsedBytes).toBe(3 * SI_GB);
      expect(usage.dailyRemainingBytes).toBe(2 * SI_GB);

      // Within 30d: 1 GB + 2 GB + 10 GB = 13 GB (the 35-day-old event is excluded)
      expect(usage.monthlyUsedBytes).toBe(13 * SI_GB);
      expect(usage.monthlyRemainingBytes).toBe(12 * SI_GB);
    });

    it('clamps remaining bytes to 0 when quota is exceeded', () => {
      const now = 1_700_000_000_000;
      const activity: ActivityEvent[] = [
        { ts: now - 1000, kind: 'ingress', bytes: 10 * SI_GB, providerId: 'p1' },
      ];
      const usage = computeTransferQuotaUsage(activity, DEFAULT_PLANS.free, now);
      expect(usage.dailyRemainingBytes).toBe(0);
    });
  });

  describe('calculateZeroEgressSavingsUsd', () => {
    it('calculates benchmark S3 egress savings correctly', () => {
      // 100 GB saved at $0.09/GB = $9.00
      expect(calculateZeroEgressSavingsUsd(100 * SI_GB)).toBe(9.0);
      expect(calculateZeroEgressSavingsUsd(0)).toBe(0);
    });
  });

  describe('estimateAllPlans', () => {
    it('evaluates sufficiency of plans for desired clouds and bandwidth', () => {
      const { estimates, recommendedPlanId } = estimateAllPlans('monthly', 5, 20);

      // Free: maxMounts=2, dailyTransferLimitGB=5 -> not sufficient for 5 clouds or 20 GB/day
      expect(estimates.free.fits).toBe(false);
      expect(estimates.free.reasonIfBlocked).toContain('Max 2 cloud accounts');

      // Pro: maxMounts=7, dailyTransferLimitGB=50 -> fits 5 clouds and 20 GB/day
      expect(estimates.pro.fits).toBe(true);
      expect(estimates.pro.effectiveMonthlyInr).toBe(199);

      // Ultra: maxMounts=20, dailyTransferLimitGB=250 -> fits
      expect(estimates.ultra.fits).toBe(true);

      // Recommended plan should be the lowest tier that fits (pro)
      expect(recommendedPlanId).toBe('pro');
    });
  });
});
