/**
 * STEP 15B / v2 — Subscription Source of Truth (catalog loader).
 *
 * `public.billing_plans` (migration 20260830, extended by 20260922) is the
 * official source of truth for plan metadata (name, currency, monthly/yearly
 * price, interval, trial, Stripe price id, features, limits, metadata). The
 * static list in `lib/subscription/plans.ts` remains ONLY as a harmless fallback
 * so nothing breaks on environments where the migration has not been applied yet
 * (see docs/SUBSCRIPTION_PLANS.md for the full source-of-truth order).
 *
 * v2 RESOLUTION RULES:
 *   - rows are NOT filtered by is_active: the DB marks superseded v1 rows
 *     (starter/growth/pro) inactive so they leave the public catalog, but a live
 *     subscription may still carry such a plan_id. Filtering here would have made
 *     a paying clinic fall back to the static $0 plan.
 *   - a legacy plan_id resolves to its v2 successor via `canonicalCatalogPlanId`
 *     (pro -> center, growth -> advanced, starter -> limited).
 *   - when a PAID plan cannot be resolved at all, the loader serves the smallest
 *     paid tier (UNRESOLVED_PAID_PLAN_ID) — never the 5-patient `limited` state.
 *
 * Everything here is server-only (imports supabaseAdmin). Never import from a
 * client component.
 */
import { supabaseAdmin } from '@/lib/supabase/admin';
import { SUBSCRIPTION_PLANS, PLAN_BY_ID, getPlan, type SubscriptionPlan, type BillingInterval } from './plans';
import { getStripePriceId as getStripePriceIdFromEnv, isValidStripePriceId } from './planPrices';
import { canonicalCatalogPlanId } from './entitlements';

export type BillingPlanRow = {
  plan_id: string;
  name: string;
  name_en: string;
  currency: string;
  price_per_month: number;
  billing_interval: string;
  trial_days: number | null;
  stripe_price_id: string | null;
  is_active: boolean;
  is_public: boolean;
  display_order: number;
  features: unknown;
  limits: unknown;
  metadata: unknown;
};

function intervalFrom(value: string): BillingInterval {
  if (value === 'year') return 'year';
  if (value === 'trial') return 'trial';
  return 'month';
}

function rowToPlan(row: BillingPlanRow | null): SubscriptionPlan | null {
  if (!row || !row.plan_id) return null;
  const staticPlan = PLAN_BY_ID[row.plan_id];
  const features = Array.isArray(row.features) ? row.features.map(String) : (staticPlan?.features ?? []);
  return {
    id: row.plan_id,
    name: row.name ?? staticPlan?.name ?? row.plan_id,
    nameEn: row.name_en ?? staticPlan?.nameEn ?? row.plan_id,
    pricePerMonth: Number(row.price_per_month) || 0,
    currency: row.currency || staticPlan?.currency || 'usd',
    interval: intervalFrom(row.billing_interval),
    trialDays: row.trial_days ?? staticPlan?.trialDays ?? null,
    priceId: isValidStripePriceId(row.stripe_price_id) ? row.stripe_price_id.trim() : null,
    features,
  };
}

/**
 * Returns all catalog plans (fallback: the static list).
 * v2 — no is_active filter: superseded v1 rows stay readable so a live
 * subscription carrying a legacy plan_id never degrades to the static $0 plan.
 */
export async function loadBillingPlansAll(): Promise<SubscriptionPlan[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from('billing_plans')
      .select('*')
      .order('display_order', { ascending: true });
    if (error || !data || data.length === 0) return SUBSCRIPTION_PLANS;
    const mapped = (data as BillingPlanRow[]).map(rowToPlan).filter(Boolean) as SubscriptionPlan[];
    return mapped.length > 0 ? mapped : SUBSCRIPTION_PLANS;
  } catch {
    return SUBSCRIPTION_PLANS;
  }
}

/** Returns one plan from the catalog, falling back to the static definition. */
export async function getPlanOrFallback(planId: string | null | undefined): Promise<SubscriptionPlan> {
  if (!planId) return getPlan(null);
  // v2 — legacy ids resolve to their successor (pro -> center, …) and the lookup
  // deliberately ignores is_active (see loadBillingPlansAll).
  const resolvedId = canonicalCatalogPlanId(planId);
  try {
    const { data, error } = await supabaseAdmin
      .from('billing_plans')
      .select('*')
      .eq('plan_id', resolvedId)
      .limit(1)
      .maybeSingle();
    if (!error && data?.plan_id) {
      const mapped = rowToPlan(data as BillingPlanRow);
      if (mapped) return mapped;
    }
  } catch {
    // fall through to static fallback
  }
  return getPlan(resolvedId);
}

/**
 * Resolves the real Stripe Price ID for a plan. Priority:
 *   1) billing_plans.stripe_price_id (official source of truth),
 *   2) env via lib/subscription/planPrices (15A behavior).
 * Returns null when neither is configured (checkout fails loudly, per 15A).
 */
export async function getStripePriceIdAsync(planId: string): Promise<string | null> {
  const resolvedId = canonicalCatalogPlanId(planId);
  try {
    const { data, error } = await supabaseAdmin
      .from('billing_plans')
      .select('stripe_price_id, plan_id')
      .eq('plan_id', resolvedId)
      .limit(1)
      .maybeSingle();
    const fromCatalog = data?.stripe_price_id;
    if (!error && isValidStripePriceId(fromCatalog)) return fromCatalog.trim();
  } catch {
    // fall through to env fallback
  }
  return getStripePriceIdFromEnv(resolvedId);
}

/**
 * Billing interval a plan id charges on ('year' for the *_yearly twins, 'trial'
 * for free_trial, else 'month'). Used by checkout/webhook to store an accurate
 * subscriptions.billing_status.
 */
export function planBillingInterval(planId: string): 'month' | 'year' | 'trial' {
  if (planId === 'free_trial') return 'trial';
  return planId.endsWith('_yearly') ? 'year' : 'month';
}

/**
 * Resolves a plan for CHECKOUT: the catalog row (or static fallback) plus the
 * real Stripe Price ID. Returns `priceId: null` when the plan is not sellable /
 * not configured, so the caller can fail loudly (PAYMENT_NOT_CONFIGURED).
 */
export async function resolveCheckoutPlan(planId: string): Promise<{
  plan: SubscriptionPlan;
  priceId: string | null;
  interval: 'month' | 'year' | 'trial';
}> {
  const plan = await getPlanOrFallback(planId);
  const priceId = plan.pricePerMonth > 0 ? await getStripePriceIdAsync(planId) : null;
  return { plan, priceId, interval: planBillingInterval(planId) };
}

/** Guards to be used by future entitlement gates; kept here for the catalog. */
export function planRequiresPayment(plan: SubscriptionPlan): boolean {
  return plan.pricePerMonth > 0;
}