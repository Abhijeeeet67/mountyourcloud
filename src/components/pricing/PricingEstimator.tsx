import {
  ArrowDownRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Crown,
  ShieldCheck,
  Sliders,
  Sparkles,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  DEFAULT_PLANS,
  PLAN_ORDER,
  estimateAllPlans,
  getBilledTotalInr,
  getEffectiveMonthlyInr,
} from '../../lib/pricing';
import type { BillingCycle, PlanDefinition, PlanId } from '../../types/domain';

const PLAN_RANK: Record<PlanId, number> = {
  free: 0,
  pro: 1,
  ultra: 2,
};

export function PricingEstimator({
  activePlanId = 'pro',
  billingCycle,
  onBillingCycleChange,
  onSelectPlan,
  customPlans,
  isLanding = false,
}: {
  activePlanId?: PlanId;
  billingCycle: BillingCycle;
  onBillingCycleChange: (cycle: BillingCycle) => void;
  onSelectPlan?: (planId: PlanId) => void;
  customPlans?: Record<PlanId, PlanDefinition>;
  isLanding?: boolean;
}) {
  const plans = customPlans ?? DEFAULT_PLANS;

  // Interactive sliders for matching a user's cloud account count & daily transfer needs
  const [desiredClouds, setDesiredClouds] = useState<number>(5);
  const [desiredDailyGB, setDesiredDailyGB] = useState<number>(25);

  const { estimates, recommendedPlanId } = useMemo(
    () => estimateAllPlans(billingCycle, desiredClouds, desiredDailyGB, plans),
    [billingCycle, desiredClouds, desiredDailyGB, plans]
  );

  const activeRank = PLAN_RANK[activePlanId] ?? 1;

  return (
    <div className="space-y-8">
      {/* Top Billing Cadence Bar + Interactive Plan Matcher */}
      <div className="rounded-lg bg-[#131620] border border-[#1E2230] p-5 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#1E2230] pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-[#818CF8]" />
              <h2 className="text-[15px] font-bold text-[#F3F4F6]">
                Transparent Multi-Cloud Orchestration Pricing
              </h2>
            </div>
            <p className="text-xs text-[#8A94A6]">
              Choose monthly billing or save 20% with annual billing. The FREE plan is genuinely usable forever with no payment details required.
            </p>
          </div>

          {/* Monthly / Annual (20% Off) Toggle */}
          <div
            role="group"
            aria-label="Billing cycle"
            className="inline-flex p-1 rounded-lg bg-[#090A0F] border border-[#1E2230] self-start md:self-auto shrink-0"
          >
            <button
              type="button"
              onClick={() => onBillingCycleChange('monthly')}
              className={`px-3.5 py-1.5 rounded-md text-xs font-medium whitespace-nowrap tv-transition ${
                billingCycle === 'monthly'
                  ? 'bg-[#4F46E5] text-white'
                  : 'text-[#8A94A6] hover:text-[#F3F4F6]'
              }`}
            >
              Monthly Billing
            </button>
            <button
              type="button"
              onClick={() => onBillingCycleChange('annual')}
              className={`px-3.5 py-1.5 rounded-md text-xs font-medium whitespace-nowrap flex items-center gap-1.5 tv-transition ${
                billingCycle === 'annual'
                  ? 'bg-[#4F46E5] text-white'
                  : 'text-[#8A94A6] hover:text-[#F3F4F6]'
              }`}
            >
              <span>Annual Billing</span>
              <span className="px-1.5 py-0.5 text-[10px] font-mono font-bold rounded bg-[#10B981]/20 text-[#10B981] border border-[#10B981]/40">
                SAVE 20%
              </span>
            </button>
          </div>
        </div>

        {/* Interactive Workload Sliders */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <div className="flex items-center justify-between text-xs mb-2">
              <label htmlFor="slider-clouds" className="font-medium text-[#F3F4F6]">
                Connected Cloud Storage Accounts Needed (1 – 20)
              </label>
              <span className="font-mono text-[#818CF8] font-bold tabular-nums">
                {desiredClouds} cloud account{desiredClouds === 1 ? '' : 's'}
              </span>
            </div>
            <input
              id="slider-clouds"
              type="range"
              min={1}
              max={20}
              step={1}
              value={desiredClouds}
              onChange={(e) => setDesiredClouds(Number(e.target.value))}
              className="w-full accent-[#4F46E5] cursor-pointer"
            />
            <div className="flex justify-between text-[11px] font-mono text-[#8A94A6] mt-1">
              <span>1 cloud</span>
              <span>{plans.free.maxMounts} (FREE)</span>
              <span>{plans.pro.maxMounts} (PRO)</span>
              <span>{plans.ultra.maxMounts} (ULTRA)</span>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between text-xs mb-2">
              <label htmlFor="slider-daily-gb" className="font-medium text-[#F3F4F6]">
                Daily Upload / Download Bandwidth Needed (1 – 250 GB/day)
              </label>
              <span className="font-mono text-[#818CF8] font-bold tabular-nums">
                {desiredDailyGB} GB / day
              </span>
            </div>
            <input
              id="slider-daily-gb"
              type="range"
              min={1}
              max={250}
              step={1}
              value={desiredDailyGB}
              onChange={(e) => setDesiredDailyGB(Number(e.target.value))}
              className="w-full accent-[#4F46E5] cursor-pointer"
            />
            <div className="flex justify-between text-[11px] font-mono text-[#8A94A6] mt-1">
              <span>1 GB</span>
              <span>{plans.free.dailyTransferLimitGB} GB (FREE)</span>
              <span>{plans.pro.dailyTransferLimitGB} GB (PRO)</span>
              <span>{plans.ultra.dailyTransferLimitGB} GB (ULTRA)</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3 Conversion-Focused Subscription Cards: FREE (₹0), PRO (₹199 Most Popular), ULTRA (₹499 Premium) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
        {PLAN_ORDER.map((planId) => {
          const plan = plans[planId];
          const est = estimates[planId];
          const isCurrentPlan = !isLanding && activePlanId === planId;
          const isProPopular = planId === 'pro';
          const isUltraPremium = planId === 'ultra';
          const effectiveMonthly = getEffectiveMonthlyInr(plan, billingCycle);
          const billedTotal = getBilledTotalInr(plan, billingCycle);
          const targetRank = PLAN_RANK[planId];
          const isUpgrade = targetRank > activeRank;

          return (
            <div
              key={plan.id}
              className={`rounded-xl p-6 flex flex-col justify-between relative border tv-transition ${
                isProPopular
                  ? 'bg-[#131620] border-2 border-[#818CF8]'
                  : isUltraPremium
                  ? 'bg-gradient-to-b from-[#171522] to-[#131620] border-2 border-[#F59E0B]/70'
                  : 'bg-[#131620] border-[#1E2230]'
              }`}
            >
              {/* Top Highlight Pill for PRO (Most Popular) & ULTRA (Premium Tier) */}
              {isProPopular && (
                <div className="absolute -top-3 left-6 px-3 py-0.5 rounded-full bg-[#4F46E5] border border-[#818CF8] text-[11px] font-mono font-bold uppercase tracking-wider text-white flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3" />
                  <span>Most Popular · Recommended</span>
                </div>
              )}

              {isUltraPremium && (
                <div className="absolute -top-3 left-6 px-3 py-0.5 rounded-full bg-[#F59E0B] text-[11px] font-mono font-bold uppercase tracking-wider text-black flex items-center gap-1.5">
                  <Crown className="w-3 h-3" />
                  <span>Ultimate Power · Premium Tier</span>
                </div>
              )}

              <div className="space-y-5 pt-1">
                {/* Plan Title & Audience */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3
                        className={`text-lg font-bold tracking-tight ${
                          isUltraPremium ? 'text-[#F59E0B]' : 'text-[#F3F4F6]'
                        }`}
                      >
                        {plan.name}
                      </h3>
                      {recommendedPlanId === planId && (
                        <span className="text-[10px] font-mono text-[#10B981] bg-[#10B981]/10 border border-[#10B981]/30 px-2 py-0.5 rounded">
                          Matches Sliders
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#8A94A6] mt-1">{plan.tagline}</p>
                  </div>
                </div>

                {/* Price Block */}
                <div className="p-4 rounded-lg bg-[#090A0F] border border-[#1E2230] space-y-1.5">
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-3xl font-bold text-[#F3F4F6] tabular-nums">
                      ₹{effectiveMonthly}
                    </span>
                    <span className="text-xs text-[#8A94A6] font-mono">/ month</span>
                    {billingCycle === 'annual' && plan.baseMonthlyInr > 0 && (
                      <span className="text-xs font-mono text-[#8A94A6] line-through ml-auto">
                        ₹{plan.baseMonthlyInr}/mo
                      </span>
                    )}
                  </div>

                  <p className="text-[11px] font-mono text-[#8A94A6] tabular-nums">
                    {plan.baseMonthlyInr === 0
                      ? 'Free forever · No credit card or payment info required'
                      : billingCycle === 'annual'
                      ? `Billed annually at ₹${billedTotal.toLocaleString('en-IN')}/yr (${plan.annualDiscountPercent}% discount)`
                      : `Billed monthly at ₹${plan.baseMonthlyInr}/mo · Cancel anytime`}
                  </p>

                  {!est.fits && (
                    <p className="text-[11px] font-mono text-[#F59E0B] pt-1 border-t border-[#1E2230]">
                      Slider note: {est.reasonIfBlocked}
                    </p>
                  )}
                </div>

                {/* Concrete Numeric Quota Specs */}
                <dl className="space-y-2 text-xs font-mono tabular-nums bg-[#0E1017] p-3.5 rounded-lg border border-[#1E2230]">
                  <div className="flex justify-between py-1 border-b border-[#1E2230]/60">
                    <dt className="font-sans text-[#8A94A6]">Connected Cloud Accounts</dt>
                    <dd className="text-[#F3F4F6] font-bold">Up to {plan.maxMounts} clouds</dd>
                  </div>
                  <div className="flex justify-between py-1 border-b border-[#1E2230]/60">
                    <dt className="font-sans text-[#8A94A6]">Daily Upload / Download</dt>
                    <dd className="text-[#F3F4F6] font-bold">{plan.dailyTransferLimitGB} GB / day</dd>
                  </div>
                  <div className="flex justify-between py-1 border-b border-[#1E2230]/60">
                    <dt className="font-sans text-[#8A94A6]">Monthly Cross-Cloud Quota</dt>
                    <dd className="text-[#F3F4F6] font-bold">
                      {plan.monthlyTransferLimitGB >= 1000
                        ? `${(plan.monthlyTransferLimitGB / 1000).toFixed(1)} TB / mo`
                        : `${plan.monthlyTransferLimitGB} GB / mo`}
                    </dd>
                  </div>
                  <div className="flex justify-between py-1 border-b border-[#1E2230]/60">
                    <dt className="font-sans text-[#8A94A6]">Bulk Operation Limit</dt>
                    <dd className="text-[#F3F4F6]">Up to {plan.maxBulkFiles} files/batch</dd>
                  </div>
                  <div className="flex justify-between py-1">
                    <dt className="font-sans text-[#8A94A6]">Transfer Queue Priority</dt>
                    <dd
                      className={
                        isUltraPremium
                          ? 'text-[#F59E0B] font-bold'
                          : isProPopular
                          ? 'text-[#818CF8] font-bold'
                          : 'text-[#F3F4F6]'
                      }
                    >
                      {plan.priorityLabel}
                    </dd>
                  </div>
                </dl>

                {/* Feature Checklist */}
                <div className="space-y-2">
                  <p className="text-[11px] font-mono uppercase tracking-wider text-[#8A94A6]">
                    Included Capabilities
                  </p>
                  <ul className="space-y-2 text-xs text-[#F3F4F6]">
                    {plan.features.map((feat, idx) => (
                      <li key={idx} className="flex items-start gap-2 leading-relaxed">
                        <CheckCircle2
                          className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${
                            isUltraPremium
                              ? 'text-[#F59E0B]'
                              : isProPopular
                              ? 'text-[#818CF8]'
                              : 'text-[#10B981]'
                          }`}
                        />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Action CTA Button (Upgrade / Downgrade / Current) */}
              {!isLanding && onSelectPlan && (
                <div className="mt-6 pt-4 border-t border-[#1E2230]">
                  {isCurrentPlan ? (
                    <div className="w-full py-2.5 rounded-md bg-[#090A0F] border border-[#10B981]/40 text-center text-xs font-semibold text-[#10B981] flex items-center justify-center gap-1.5">
                      <ShieldCheck className="w-4 h-4" />
                      <span>Current Active Plan ({plan.name})</span>
                    </div>
                  ) : isUpgrade ? (
                    <button
                      type="button"
                      onClick={() => onSelectPlan(plan.id)}
                      className={`w-full py-2.5 rounded-md text-xs font-bold flex items-center justify-center gap-1.5 tv-transition ${
                        isUltraPremium
                          ? 'bg-[#F59E0B] hover:bg-[#D97706] text-black'
                          : 'bg-[#4F46E5] hover:bg-[#4338CA] text-white'
                      }`}
                    >
                      <ArrowUpRight className="w-4 h-4" />
                      <span>
                        Upgrade to {plan.name} (₹{effectiveMonthly}/mo)
                      </span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onSelectPlan(plan.id)}
                      className="w-full py-2.5 rounded-md bg-[#0E1017] hover:bg-[#1E2230] border border-[#1E2230] text-xs font-medium text-[#8A94A6] hover:text-[#F3F4F6] flex items-center justify-center gap-1.5 tv-transition"
                    >
                      <ArrowDownRight className="w-4 h-4" />
                      <span>
                        Downgrade to {plan.name} (₹{effectiveMonthly}/mo)
                      </span>
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Detailed Side-by-Side Comparison Matrix (Requirement 3) */}
      <div className="rounded-lg bg-[#131620] border border-[#1E2230] overflow-hidden">
        <div className="px-5 py-4 border-b border-[#1E2230]">
          <h3 className="text-[15px] font-bold text-[#F3F4F6]">
            Complete Feature & Quota Comparison Matrix
          </h3>
          <p className="text-xs text-[#8A94A6] mt-0.5">
            Transparent platform orchestration limits across FREE, PRO, and ULTRA. External cloud storage space is governed by your connected cloud providers.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#1E2230] bg-[#090A0F] font-mono text-[#8A94A6]">
                <th className="py-3 px-4 font-semibold text-[#F3F4F6]">Capability / Quota</th>
                <th className="py-3 px-4 font-semibold">FREE (₹{plans.free.baseMonthlyInr}/mo)</th>
                <th className="py-3 px-4 font-semibold text-[#818CF8]">
                  PRO (₹{plans.pro.baseMonthlyInr}/mo · Popular)
                </th>
                <th className="py-3 px-4 font-semibold text-[#F59E0B]">
                  ULTRA (₹{plans.ultra.baseMonthlyInr}/mo · Premium)
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E2230] text-[#F3F4F6]">
              <tr>
                <td className="py-3 px-4 font-medium">Connected Cloud Accounts</td>
                <td className="py-3 px-4 font-mono">Up to {plans.free.maxMounts} accounts</td>
                <td className="py-3 px-4 font-mono font-bold text-[#818CF8]">
                  Up to {plans.pro.maxMounts} accounts
                </td>
                <td className="py-3 px-4 font-mono font-bold text-[#F59E0B]">
                  Up to {plans.ultra.maxMounts} accounts
                </td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-medium">Daily Upload & Download Quota</td>
                <td className="py-3 px-4 font-mono">{plans.free.dailyTransferLimitGB} GB / day</td>
                <td className="py-3 px-4 font-mono">{plans.pro.dailyTransferLimitGB} GB / day</td>
                <td className="py-3 px-4 font-mono">{plans.ultra.dailyTransferLimitGB} GB / day</td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-medium">Monthly Cross-Cloud Transfer Quota</td>
                <td className="py-3 px-4 font-mono">{plans.free.monthlyTransferLimitGB} GB / mo</td>
                <td className="py-3 px-4 font-mono">{plans.pro.monthlyTransferLimitGB} GB / mo</td>
                <td className="py-3 px-4 font-mono">{plans.ultra.monthlyTransferLimitGB} GB / mo</td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-medium">Bulk File Upload / Download Batch</td>
                <td className="py-3 px-4 font-mono">Up to {plans.free.maxBulkFiles} files</td>
                <td className="py-3 px-4 font-mono">Up to {plans.pro.maxBulkFiles} files</td>
                <td className="py-3 px-4 font-mono">Up to {plans.ultra.maxBulkFiles} files</td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-medium">Search & Indexing</td>
                <td className="py-3 px-4 text-[#8A94A6]">Basic name search</td>
                <td className="py-3 px-4">Advanced search & category filtering</td>
                <td className="py-3 px-4 text-[#F59E0B]">Full cross-cloud indexing & instant filter</td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-medium">Automated File Organization</td>
                <td className="py-3 px-4 text-[#8A94A6]">
                  <X className="w-4 h-4 text-[#8A94A6]" />
                </td>
                <td className="py-3 px-4">
                  <Check className="w-4 h-4 text-[#10B981]" />
                </td>
                <td className="py-3 px-4">
                  <Check className="w-4 h-4 text-[#10B981]" />
                </td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-medium">Scheduled & Recurring Transfers</td>
                <td className="py-3 px-4 text-[#8A94A6]">Manual only</td>
                <td className="py-3 px-4">Daily scheduled transfers</td>
                <td className="py-3 px-4 text-[#F59E0B]">Hourly, daily & weekly recurring sync</td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-medium">Cross-Cloud Synchronization</td>
                <td className="py-3 px-4 text-[#8A94A6]">
                  <X className="w-4 h-4 text-[#8A94A6]" />
                </td>
                <td className="py-3 px-4 text-[#8A94A6]">
                  <X className="w-4 h-4 text-[#8A94A6]" />
                </td>
                <td className="py-3 px-4">
                  <Check className="w-4 h-4 text-[#10B981]" />
                </td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-medium">Telegram Webhook Alert Integration</td>
                <td className="py-3 px-4 text-[#8A94A6]">Basic completion alerts</td>
                <td className="py-3 px-4">Advanced bot rules & quota alerts</td>
                <td className="py-3 px-4 text-[#F59E0B]">Multi-channel webhook & sync telemetry</td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-medium">Processing Priority & Support</td>
                <td className="py-3 px-4 text-[#8A94A6]">{plans.free.priorityLabel} · Standard</td>
                <td className="py-3 px-4">{plans.pro.priorityLabel} · Priority · No Ads</td>
                <td className="py-3 px-4 text-[#F59E0B]">
                  {plans.ultra.priorityLabel} · Early Access
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
