import { canUseFeature, getRequiredPlan, type FeatureKey } from './featureGate';
import { getPlan } from './plans';
import { effectivePlanIdFor, loadSubscriptionRow } from './entitlements';

/**
 * Server-side feature gate (Phase 2 — API protection).
 *
 * Resolves the clinic's effective plan through the approved 15C status policy
 * (same source as every other entitlement), then applies the plan→feature
 * matrix from featureGate.ts. Purely plan-based — usage counters are NOT
 * consumed here (assertEntitlement stays responsible for metered resources).
 *
 * Legacy grandfathering: 'founding' subscriptions keep every feature
 * (canUseFeature handles it), so live founding clinics are never downgraded.
 *
 * Never import from a client component (imports supabaseAdmin indirectly via
 * lib/subscription/entitlements).
 */
/**
 * FLAT decision object — every field is present in EVERY branch, so API routes
 * (HTTP 402 payload) never have to narrow a union and can always read
 * `requiredPlan` / `planNameAr`. Both are empty strings when the feature is
 * allowed (nothing to upgrade to).
 */
export interface FeatureGateDecision {
  /** True when the plan unlocks the feature. */
  allowed: boolean;
  /** The clinic's effective plan id (canonical gating tier). */
  planId: string;
  /** Cheapest plan id that unlocks the feature; '' when allowed. */
  requiredPlan: string;
  /** Arabic name of `requiredPlan`; '' when allowed. */
  planNameAr: string;
}

export async function featureGateForClinic(
  clinicId: string,
  feature: FeatureKey
): Promise<FeatureGateDecision> {
  const row = await loadSubscriptionRow(clinicId);
  const { planId } = effectivePlanIdFor(row);

  if (canUseFeature(planId, feature)) {
    return { allowed: true, planId, requiredPlan: '', planNameAr: '' };
  }

  const required = getRequiredPlan(feature);
  const plan = getPlan(required);
  return {
    allowed: false,
    planId,
    requiredPlan: required,
    planNameAr: plan?.name ?? required,
  };
}

export { getRequiredPlan } from './featureGate';
