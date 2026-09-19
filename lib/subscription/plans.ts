/**
 * Subscription catalog — static fallback + the sellable tier list.
 *
 * ⚠️ SERVER-ONLY PRICE RESOLUTION
 *   `priceId` is deliberately kept at `null` here so this module stays safe to
 *   import from client components (the dashboard subscription page imports
 *   SUBSCRIPTION_PLANS to render the plan grid). The REAL Stripe Price ID is
 *   resolved server-side at checkout time:
 *     lib/subscription/planCatalog.getStripePriceIdAsync(planId)   (DB first)
 *     lib/subscription/planPrices.getStripePriceId(planId)         (env fallback)
 *   This file previously carried placeholder strings ('price_founding_monthly'),
 *   which is exactly the mismatch STEP 15A removed. Do not reintroduce them.
 *
 * SOURCE OF TRUTH ORDER (see docs/SUBSCRIPTION_PLANS.md):
 *   1. public.billing_plans  (DB catalog — migrations 20260830 / 20260922)
 *   2. this file             (static fallback when the catalog is unreachable)
 *   3. components/landing/PricingSection.tsx + lib/landing/landing-copy.ts
 *      (display only — must always mirror the two above)
 *
 * v2 CATALOG (USD, minor units = cents):
 *   free_trial   $0      30 days, advanced features → limited afterwards
 *   basic        $39/mo  $399/yr   (3900 / 39900)
 *   advanced     $69/mo  $699/yr   (6900 / 69900)
 *   center       $119/mo $1199/yr  (11900 / 119900)
 *   limited      $0      post-trial / non-paying fallback (NOT sellable)
 *
 * Legacy plan_ids (starter / growth / pro / founding) stay resolvable in the DB
 * for historical subscriptions and are mapped to their successors by
 * lib/subscription/entitlements.ts (LEGACY_PLAN_ALIASES).
 */

export type BillingInterval = 'month' | 'year' | 'trial';

export interface SubscriptionPlan {
  id: string;
  name: string;
  nameEn: string;
  pricePerMonth: number; // integer, minor units of `currency` (cents for USD)
  currency: string;      // ISO 4217 (lowercase)
  interval: BillingInterval;
  trialDays: number | null;
  priceId: string | null; // ALWAYS null here — resolved server-side (see header)
  features: string[];
}

/** v2 trial length (owner decision: 30 days, was 14). */
export const TRIAL_DAYS = 30;

/** Plan applied once the trial window ends (and the safe default for unknown states). */
export const FALLBACK_PLAN_ID = 'limited';

/** Legacy plan_ids kept in the DB for history; mapped to v2 successors. */
export const LEGACY_PLAN_ALIASES: Record<string, string> = {
  starter: FALLBACK_PLAN_ID, // $0 tier  -> limited
  growth: 'advanced',        // $120     -> advanced
  pro: 'center',             // $300     -> center
};

/** Plans that may be selected/purchased. `limited` is excluded (not sellable). */
export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    id: 'free_trial',
    name: 'تجريبي',
    nameEn: 'Trial',
    pricePerMonth: 0,
    currency: 'usd',
    interval: 'trial',
    trialDays: TRIAL_DAYS,
    priceId: null,
    features: [
      'تجربة 30 يوماً',
      'كل ميزات المتقدمة',
      'حتى 50 مريضاً',
      '100 محادثة AI شهرياً',
      'بدون بطاقة',
    ],
  },
  {
    id: 'basic',
    name: 'أساسية',
    nameEn: 'Basic',
    pricePerMonth: 3900, // $39.00
    currency: 'usd',
    interval: 'month',
    trialDays: null,
    priceId: null,
    features: ['عيادة واحدة', 'حتى 500 مريض', 'مستخدم واحد', 'محادثات AI غير محدودة'],
  },
  {
    id: 'advanced',
    name: 'متقدمة',
    nameEn: 'Advanced',
    pricePerMonth: 6900, // $69.00
    currency: 'usd',
    interval: 'month',
    trialDays: null,
    priceId: null,
    features: [
      'عيادات متعددة',
      'مرضى غير محدود',
      '4 مستخدمين',
      'فواتير ومدفوعات',
      'واتساب',
      'إدارة فريق',
      'تقارير',
    ],
  },
  {
    id: 'center',
    name: 'مركز',
    nameEn: 'Center',
    pricePerMonth: 11900, // $119.00
    currency: 'usd',
    interval: 'month',
    trialDays: null,
    priceId: null,
    features: [
      'عيادات غير محدودة',
      '10 مستخدمين',
      'قبل/بعد Gallery',
      'شارات إنجازات',
      'تحليلات متقدمة',
      'أولوية الدعم',
    ],
  },
  {
    id: 'basic_yearly',
    name: 'أساسية سنوي',
    nameEn: 'Basic Yearly',
    pricePerMonth: 39900, // $399.00
    currency: 'usd',
    interval: 'year',
    trialDays: null,
    priceId: null,
    features: ['كل ميزات الأساسية', 'شهران مجاناً'],
  },
  {
    id: 'advanced_yearly',
    name: 'متقدمة سنوي',
    nameEn: 'Advanced Yearly',
    pricePerMonth: 69900, // $699.00
    currency: 'usd',
    interval: 'year',
    trialDays: null,
    priceId: null,
    features: ['كل ميزات المتقدمة', 'شهران مجاناً'],
  },
  {
    id: 'center_yearly',
    name: 'مركز سنوي',
    nameEn: 'Center Yearly',
    pricePerMonth: 119900, // $1199.00
    currency: 'usd',
    interval: 'year',
    trialDays: null,
    priceId: null,
    features: ['كل ميزات المركز', 'شهران مجاناً'],
  },
];

/**
 * Post-trial / non-paying plan. Not part of SUBSCRIPTION_PLANS (never offered in
 * the pricing grid and never accepted by the checkout schema), but resolvable so
 * the entitlement policy and the DB catalog agree.
 */
export const LIMITED_PLAN: SubscriptionPlan = {
  id: FALLBACK_PLAN_ID,
  name: 'محدودة',
  nameEn: 'Limited',
  pricePerMonth: 0,
  currency: 'usd',
  interval: 'month',
  trialDays: null,
  priceId: null,
  features: ['5 مرضى', '10 محادثات AI شهرياً', 'ميزات أساسية فقط'],
};

const ALL_PLANS: SubscriptionPlan[] = [...SUBSCRIPTION_PLANS, LIMITED_PLAN];

export const PLAN_BY_ID: Record<string, SubscriptionPlan> = Object.fromEntries(
  ALL_PLANS.map((p) => [p.id, p])
);

/** Legacy ids resolve to their successor plan (never to an unrelated plan). */
export function getPlan(planId: string | null | undefined): SubscriptionPlan {
  if (planId) {
    if (PLAN_BY_ID[planId]) return PLAN_BY_ID[planId];
    const alias = LEGACY_PLAN_ALIASES[planId];
    if (alias && PLAN_BY_ID[alias]) return PLAN_BY_ID[alias];
  }
  return PLAN_BY_ID[FALLBACK_PLAN_ID];
}

/**
 * A plan requires a Stripe checkout when it has a non-zero price.
 * The Price ID is resolved server-side (planCatalog/planPrices), NOT from here.
 */
export function requiresPayment(plan: SubscriptionPlan): boolean {
  return plan.pricePerMonth > 0;
}

/** True when the plan id is one of the paid v2 tiers (monthly or yearly). */
export function isPaidPlanId(planId: string): boolean {
  return /^(basic|advanced|center)(_yearly)?$/.test(planId);
}

/** Billing interval encoded in a v2 plan id ('year' for *_yearly, else 'month'). */
export function planIntervalFromId(planId: string): BillingInterval {
  return planId.endsWith('_yearly') ? 'year' : 'month';
}

