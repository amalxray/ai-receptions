/**
 * PHASE 2 — Subscription feature gating (CLIENT-SAFE, pure).
 *
 * Maps a v2 plan id to the advanced/center features it unlocks and produces a
 * SINGLE FLAT decision object consumed by BOTH the API routes (HTTP 402) and the
 * dashboard navigation (🔒 locks).
 *
 * This module is intentionally pure: no React, no process.env, no supabaseAdmin.
 * The server-side wrapper (featureGateServer.ts) resolves the caller's plan id
 * and then delegates here, so a client component can call canUseFeature() to
 * render a lock without any extra round-trip.
 *
 * TIER MAPPING (v2 catalog — lib/subscription/plans.ts)
 *   free_trial   -> advanced   (owner decision: the trial carries ALL Advanced features)
 *   basic        -> basic
 *   advanced     -> advanced
 *   center       -> center
 *   *_yearly     -> its base tier
 *   limited      -> limited    ($0 post-trial / safe fallback)
 *   founding     -> center     (legacy grandfathered — full access, never locked)
 *   growth       -> advanced   (legacy v1)
 *   pro          -> center     (legacy v1)
 *   starter      -> limited    (legacy v1)
 *
 * Unknown / missing plan ids fail CLOSED (limited) except for unknown FEATURE
 * keys, which fail OPEN (a feature we do not gate is never a paywall).
 */
import { getPlan, type SubscriptionPlan } from './plans';

export type FeatureKey =
  | 'invoices'
  | 'payments'
  | 'expenses'
  | 'reports'
  | 'whatsapp'
  | 'team'
  | 'before-after'
  | 'badges'
  | 'analytics';

export const FEATURE_KEYS: readonly FeatureKey[] = [
  'invoices',
  'payments',
  'expenses',
  'reports',
  'whatsapp',
  'team',
  'before-after',
  'badges',
  'analytics',
];

/** Tiers that unlock a feature. `center` is implicitly all-inclusive. */
const FEATURE_PLANS: Record<FeatureKey, readonly string[]> = {
  invoices: ['advanced', 'center'],
  payments: ['advanced', 'center'],
  expenses: ['advanced', 'center'],
  reports: ['advanced', 'center'],
  whatsapp: ['advanced', 'center'],
  team: ['advanced', 'center'],
  'before-after': ['center'],
  badges: ['center'],
  analytics: ['center'],
};

export const FEATURE_LABELS_AR: Record<FeatureKey, string> = {
  invoices: 'الفواتير',
  payments: 'المدفوعات',
  expenses: 'المصروفات',
  reports: 'التقارير',
  whatsapp: 'واتساب',
  team: 'إدارة الفريق',
  'before-after': 'صور قبل/بعد',
  badges: 'شارات الإنجازات',
  analytics: 'التحليلات المتقدمة',
};

export type GatingTier = 'basic' | 'advanced' | 'center' | 'limited';

/** Canonical plan id -> gating tier (legacy + yearly variants included). */
const TIER_TREATMENT: Record<string, GatingTier> = {
  free_trial: 'advanced', // trial = all Advanced features
  basic: 'basic',
  advanced: 'advanced',
  center: 'center',
  basic_yearly: 'basic',
  advanced_yearly: 'advanced',
  center_yearly: 'center',
  limited: 'limited',
  // legacy v1 ids kept resolvable for live subscriptions
  founding: 'center',
  growth: 'advanced',
  pro: 'center',
  starter: 'limited',
};

export function isFeatureKey(value: unknown): value is FeatureKey {
  return typeof value === 'string' && (FEATURE_KEYS as readonly string[]).includes(value);
}

/** Resolves any (including legacy / yearly) plan id to its gating tier. */
export function gatingTier(planId: string | null | undefined): GatingTier {
  if (!planId) return 'limited';
  return TIER_TREATMENT[planId] ?? 'limited';
}

/**
 * The paywall decision for one plan + feature.
 * `center` (and the legacy `founding` that maps onto it) unlocks everything.
 */
export function canUseFeature(planId: string | null | undefined, feature: FeatureKey): boolean {
  const allowed = FEATURE_PLANS[feature];
  if (!allowed) return true; // ungated feature -> never a paywall
  const tier = gatingTier(planId);
  if (tier === 'center') return true;
  return allowed.includes(tier);
}

/** Cheapest v2 tier that unlocks a feature ('advanced' or 'center'). */
export function getRequiredPlan(feature: FeatureKey): string {
  const allowed = FEATURE_PLANS[feature];
  if (!allowed || allowed.includes('advanced')) return 'advanced';
  return 'center';
}

/** Localized (Arabic) name of the plan that unlocks a feature. */
export function getRequiredPlanNameAr(feature: FeatureKey): string {
  return getPlanDisplayNameAr(getRequiredPlan(feature));
}

/** Localized (Arabic) plan name; '' when the id is unknown. */
export function getPlanDisplayNameAr(planId: string | null | undefined): string {
  const plan: SubscriptionPlan = getPlan(planId);
  return plan?.name ?? '';
}

/** Marketing payload for the /upgrade/[feature] page. */
export function getFeatureInfo(feature: FeatureKey): {
  feature: FeatureKey;
  labelAr: string;
  requiredPlan: string;
  requiredPlanNameAr: string;
  features: string[];
} {
  const requiredPlan = getRequiredPlan(feature);
  const plan: SubscriptionPlan = getPlan(requiredPlan);
  return {
    feature,
    labelAr: FEATURE_LABELS_AR[feature] ?? feature,
    requiredPlan,
    requiredPlanNameAr: plan?.name ?? requiredPlan,
    features: plan?.features ?? [],
  };
}

export type FeatureGateReason = 'allowed' | 'plan_required' | 'unknown_feature';

/**
 * FLAT decision object — every field is present in EVERY branch so callers (and
 * TypeScript) never have to narrow a union. `requiredPlan` / `planNameAr` are
 * empty strings when the feature is allowed.
 */
export interface FeatureGateDecision {
  /** Echo of the requested feature key (or the raw unknown string). */
  feature: string;
  /** True when the plan unlocks the feature (or the key is not gated/known). */
  allowed: boolean;
  /** Canonical gating tier resolved from the plan id (never a legacy id). */
  planId: GatingTier;
  /** Cheapest tier that unlocks the feature ('advanced' | 'center'); '' if allowed. */
  requiredPlan: string;
  /** Arabic name of `requiredPlan`; '' if allowed. */
  planNameAr: string;
  /** Arabic name of `requiredPlan` (always filled when known). */
  requiredPlanNameAr: string;
  /** Arabic label of the feature. */
  labelAr: string;
  /** Why the decision came out this way. */
  reason: FeatureGateReason;
}

/** The single entry point used by API routes (402) and the dashboard nav (🔒). */
export function evaluateFeatureGate(
  planId: string | null | undefined,
  feature: string
): FeatureGateDecision {
  const tier = gatingTier(planId);
  const base = {
    feature,
    planId: tier,
    requiredPlan: '',
    planNameAr: '',
    requiredPlanNameAr: '',
    labelAr: '',
  };

  // Unknown feature keys are NOT a paywall (fail open) — only a bug signal.
  if (!isFeatureKey(feature)) {
    return { ...base, allowed: true, reason: 'unknown_feature' };
  }

  const labelAr = FEATURE_LABELS_AR[feature];
  if (canUseFeature(planId, feature)) {
    return { ...base, allowed: true, labelAr, reason: 'allowed' };
  }

  const requiredPlan = getRequiredPlan(feature);
  const requiredPlanNameAr = getPlanDisplayNameAr(requiredPlan);
  return {
    ...base,
    allowed: false,
    labelAr,
    requiredPlan,
    planNameAr: requiredPlanNameAr,
    requiredPlanNameAr,
    reason: 'plan_required',
  };
}

/** Features locked for a plan — used to render the 🔒 sidebar badges. */
export function getLockedFeatures(planId: string | null | undefined): FeatureKey[] {
  return FEATURE_KEYS.filter((feature) => !canUseFeature(planId, feature));
}
