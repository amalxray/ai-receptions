/**
 * STEP 15A / v2 — Server-only Stripe Price ID resolution from the environment.
 *
 * The DB catalog (`billing_plans.stripe_price_id`) is the FIRST source of truth;
 * this module is the documented fallback used when the catalog row is missing or
 * malformed (see lib/subscription/planCatalog.getStripePriceIdAsync).
 *
 * A paid plan MUST have a real, well-formed Stripe Price ID configured or
 * checkout fails loudly (PAYMENT_NOT_CONFIGURED). Placeholder strings such as
 * 'price_growth_monthly' are rejected by PRICE_ID_PATTERN on purpose.
 *
 * This module is server-only: it reads process.env and must never be imported
 * from a client component.
 */

// The six paid v2 tiers (monthly + yearly) created by
// scripts/stripe-create-subscription-prices.mjs.
const PRICE_ENV_KEY: Record<string, string> = {
  basic: 'STRIPE_PRICE_BASIC_MONTHLY',
  advanced: 'STRIPE_PRICE_ADVANCED_MONTHLY',
  center: 'STRIPE_PRICE_CENTER_MONTHLY',
  basic_yearly: 'STRIPE_PRICE_BASIC_YEARLY',
  advanced_yearly: 'STRIPE_PRICE_ADVANCED_YEARLY',
  center_yearly: 'STRIPE_PRICE_CENTER_YEARLY',
};

/** Real Stripe Price IDs always look like `price_<base58>`. */
const PRICE_ID_PATTERN = /^price_[A-Za-z0-9]+$/;

/** True when the id is a syntactically valid Stripe Price ID. */
export function isValidStripePriceId(value: unknown): value is string {
  return typeof value === 'string' && PRICE_ID_PATTERN.test(value.trim());
}

/**
 * Returns the configured Stripe Price ID for a plan, or null when missing,
 * empty or malformed (e.g. the old literal `price_growth_monthly` placeholders).
 * Read lazily from process.env at call time (safe under test env mutation and
 * Next.js runtime env injection alike).
 */
export function getStripePriceId(planId: string): string | null {
  const envKey = PRICE_ENV_KEY[planId];
  if (!envKey) return null;
  const id = process.env[envKey];
  if (!id) return null;
  const trimmed = id.trim();
  return PRICE_ID_PATTERN.test(trimmed) ? trimmed : null;
}

/** The plan ids this module can resolve (monthly + yearly paid tiers). */
export const PRICE_ENV_PLAN_IDS: readonly string[] = Object.keys(PRICE_ENV_KEY);
