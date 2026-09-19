/**
 * READ-ONLY Stripe catalog listing (no create/update/delete).
 *
 * Prints the live Prices + Products so they can be matched against
 * public.billing_plans.stripe_price_id. Only identifiers and amounts are shown —
 * the secret key is never printed.
 *
 * Usage: node scripts/stripe-list-prices.mjs
 */
import fs from 'node:fs';

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
console.log(`KEY MODE: ${secret.startsWith('sk_test') ? 'test' : secret.startsWith('sk_live') ? 'live' : 'unknown'}`);

async function stripe(path) {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
  return json;
}

const products = await stripe('/products?limit=100&active=true');
console.log('\n=== PRODUCTS ===');
for (const p of products.data ?? []) {
  console.log(`  ${p.id}  ${String(p.name)}  default_price=${p.default_price ?? '—'}  tier=${p.metadata?.tier ?? '—'}`);
}

const prices = await stripe('/prices?limit=100&active=true&expand[]=data.product');
console.log('\n=== PRICES (active) ===');
for (const p of prices.data ?? []) {
  const interval = p.recurring?.interval ?? 'one_time';
  const productName = typeof p.product === 'object' ? p.product?.name : p.product;
  console.log(
    `  ${p.id}  ${p.currency.toUpperCase()} ${((p.unit_amount ?? 0) / 100).toFixed(2).padStart(9)} ` +
      `${String(interval).padEnd(8)} lookup=${String(p.lookup_key ?? '—').padEnd(22)} ` +
      `product=${productName ?? '—'} nick=${p.nickname ?? '—'}`
  );
}
console.log(`\nprice count: ${prices.data?.length ?? 0}`);
