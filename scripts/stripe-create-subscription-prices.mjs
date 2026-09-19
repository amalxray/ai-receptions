/**
 * Creates (or reuses) the Stripe Products + Prices for the 4-tier USD
 * subscription catalog:
 *
 *   tier      monthly        yearly
 *   basic     $39  = 3900    $399  = 39900
 *   advanced  $69  = 6900    $699  = 69900
 *   center    $119 = 11900   $1199 = 119900
 *
 * Prices are in MINOR units (USD cents), matching billing_plans.price_per_month.
 *
 * Idempotent: every price is looked up by `lookup_key` (<tier>_<interval>_usd)
 * and reused when it already exists, so re-running never duplicates prices.
 *
 * Safety:
 *   - refuses to run against a live key unless --allow-live is passed
 *   - never prints the secret key or any token
 *   - with --write-env it appends STRIPE_PRICE_* keys to .env.local (untracked)
 *
 * Usage:
 *   node scripts/stripe-create-subscription-prices.mjs
 *   node scripts/stripe-create-subscription-prices.mjs --write-env
 *   node scripts/stripe-create-subscription-prices.mjs --allow-live --write-env
 */
import fs from 'node:fs';

const args = new Set(process.argv.slice(2));
const WRITE_ENV = args.has('--write-env');
const ALLOW_LIVE = args.has('--allow-live');

const raw = fs.readFileSync('.env.local', 'utf8');
const get = (k) => {
  const line = raw.split('\n').find((l) => l.startsWith(k + '='));
  return line ? line.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '') : '';
};

const secret = get('STRIPE_SECRET_KEY');
if (!secret) {
  console.log('BLOCKED — STRIPE_SECRET_KEY missing in .env.local');
  process.exit(1);
}
if (!secret.startsWith('sk_test') && !ALLOW_LIVE) {
  console.log('BLOCKED — key is not a test key. Re-run with --allow-live to create LIVE prices.');
  process.exit(1);
}

const TIERS = [
  { tier: 'basic', name: 'Basic', ar: 'أساسية', monthly: 3900, yearly: 39900 },
  { tier: 'advanced', name: 'Advanced', ar: 'متقدمة', monthly: 6900, yearly: 69900 },
  { tier: 'center', name: 'Center', ar: 'مركز', monthly: 11900, yearly: 119900 },
];

async function stripe(path, { method = 'GET', form } = {}) {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form ? new URLSearchParams(form).toString() : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.error?.message ?? `Stripe HTTP ${res.status}`;
    throw new Error(`${method} ${path} → ${msg}`);
  }
  return json;
}

/** Reuse an existing price by lookup_key so re-runs are idempotent. */
async function findPrice(lookupKey) {
  const json = await stripe(`/prices?lookup_keys[]=${encodeURIComponent(lookupKey)}&active=true&limit=1`);
  return json?.data?.[0] ?? null;
}

/** Reuse the tier product (Stripe Search on metadata), else create it. */
async function findOrCreateProduct(tier, name, ar) {
  try {
    const q = encodeURIComponent(`active:'true' AND metadata['tier']:'${tier}'`);
    const found = await stripe(`/products/search?query=${q}&limit=1`);
    if (found?.data?.[0]?.id) return { product: found.data[0], created: false };
  } catch {
    // Stripe Search may be unavailable → fall through and create a new product.
  }
  const product = await stripe('/products', {
    method: 'POST',
    form: {
      name: `AI Receptions — ${name}`,
      'description': `باقة ${ar} — الاشتراك الشهري/السنوي (USD)`,
      'metadata[tier]': tier,
      'metadata[source]': 'scripts/stripe-create-subscription-prices.mjs',
    },
  });
  return { product, created: true };
}

const out = {};

for (const { tier, name, ar, monthly, yearly } of TIERS) {
  const { product, created } = await findOrCreateProduct(tier, name, ar);
  console.log(`product ${tier}: ${product.id}${created ? ' (created)' : ' (reused)'}`);
  out[`STRIPE_PRICE_${tier.toUpperCase()}_MONTHLY`] = { amount: monthly, id: null };
  out[`STRIPE_PRICE_${tier.toUpperCase()}_YEARLY`] = { amount: yearly, id: null };

  for (const [interval, amount] of [['month', monthly], ['year', yearly]]) {
    const lookupKey = `${tier}_${interval === 'month' ? 'monthly' : 'yearly'}_usd`;
    let price = await findPrice(lookupKey);
    if (price) {
      const okAmount = price.unit_amount === amount && price.currency === 'usd';
      console.log(
        `price  ${lookupKey}: ${price.id} (reused, ${price.currency} ${price.unit_amount})` +
          (okAmount ? '' : ` — WARNING: expected usd ${amount}`)
      );
    } else {
      price = await stripe('/prices', {
        method: 'POST',
        form: {
          currency: 'usd',
          unit_amount: String(amount),
          'recurring[interval]': interval,
          product: product.id,
          lookup_key: lookupKey,
          nickname: `${name} ${interval === 'month' ? 'Monthly' : 'Yearly'} (USD)`,
          'metadata[tier]': tier,
          'metadata[interval]': interval,
        },
      });
      console.log(`price  ${lookupKey}: ${price.id} (created)`);
    }
    out[`STRIPE_PRICE_${tier.toUpperCase()}_${interval === 'month' ? 'MONTHLY' : 'YEARLY'}`].id = price.id;
  }
}

console.log('\n=== ENV KEYS (values are Price IDs, safe to print) ===');
for (const [key, v] of Object.entries(out)) {
  console.log(`${key}=${v.id}   # $${(v.amount / 100).toFixed(2)}`);
}

if (WRITE_ENV) {
  const lines = Object.entries(out).map(([key, v]) => `${key}=${v.id}`);
  const already = lines.every((l) => raw.includes(l.split('=')[0] + '='));
  if (already) {
    console.log('\n.env.local already carries all six keys — nothing to write.');
  } else {
    const block = [
      '',
      '# 4-tier USD subscription catalog (created by scripts/stripe-create-subscription-prices.mjs)',
      ...lines,
      '',
    ].join('\n');
    fs.appendFileSync('.env.local', block);
    console.log('\n.env.local: appended 6 STRIPE_PRICE_* keys.');
  }
}
