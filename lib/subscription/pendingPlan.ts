/**
 * STEP 15G-C — Pending selected plan vs effective plan.
 *
 * When an owner selects a paid plan, checkout keeps the subscription row as
 * `status: 'unpaid'` with the SELECTED plan_id until the Stripe webhook confirms
 * payment (which flips the row to `active`). Entitlements correctly keep the
 * effective plan degraded meanwhile — but the UI must show the SELECTED plan as
 * "awaiting payment" instead of silently displaying the fallback.
 *
 * Pure + testable. Never grants the pending plan any effectiveness.
 */
export type PendingSubscriptionLike = {
  plan_id: string | null | undefined;
  status: string | null | undefined;
} | null;

/**
 * Plan ids that can legitimately await payment: the six paid v2 tiers plus the
 * legacy paid ids (historical rows written before the v2 catalog). Free states
 * (free_trial, limited, legacy starter) never need a checkout, so they are
 * never "pending".
 */
const PAID_PENDING_PLAN_IDS: ReadonlySet<string> = new Set([
  'basic',
  'advanced',
  'center',
  'basic_yearly',
  'advanced_yearly',
  'center_yearly',
  // legacy paid ids (kept for historical unpaid rows)
  'growth',
  'pro',
  'founding',
]);

/**
 * Returns the plan_id awaiting payment, or null when nothing is pending.
 * - `unpaid` + a paid plan_id → that plan is pending payment.
 * - `unpaid` + a free plan_id (limited / legacy starter / free_trial) → nothing
 *   pending (no checkout needed).
 * - any other status (active/trialing/…) → nothing pending (plan already effective).
 */
export function resolvePendingSelectedPlan(subscription: PendingSubscriptionLike): string | null {
  if (!subscription) return null;
  if (subscription.status !== 'unpaid') return null;
  const planId = subscription.plan_id ?? null;
  if (!planId || !PAID_PENDING_PLAN_IDS.has(planId)) return null;
  return planId;
}

