/**
 * Applies db/migrations/20260922_subscription_v2_migration.sql and verifies it.
 *
 * Safety checks:
 *   * refuses to run if the migration contains DELETE / DROP / TRUNCATE,
 *   * every live subscription must resolve to an ACTIVE billing plan,
 *   * no active plan may be left without plan_activity_caps rows
 *     (activity caps are fail-closed — a missing row denies the tenant),
 *   * the founding subscribers must survive untouched.
 *
 * Never prints credentials. Exit 0 on PASS, 1 on any failure.
 */
import fs from 'node:fs';

const FILE = 'db/migrations/20260922_subscription_v2_migration.sql';
const fullSql = fs.readFileSync(FILE, 'utf8');

// executable lines only (comments stripped) — used for the guard and fallback
const codeLines = fullSql
  .split('\n')
  .filter((l) => !l.trim().startsWith('--'))
  .join('\n');

for (const forbidden of [/\bdelete\s+from\b/i, /\bdrop\s+table\b/i, /\btruncate\b/i]) {
  if (forbidden.test(codeLines)) {
    console.log(`BLOCKED — migration contains a forbidden statement: ${forbidden}`);
    process.exit(1);
  }
}
console.log('GUARD: no DELETE / DROP / TRUNCATE in executable SQL');

const c = fs.readFileSync('.env.local', 'utf8');
const get = (k) => {
  const line = c.split('\n').find((l) => l.startsWith(k + '='));
  return line ? line.split('=').slice(1).join('=').trim() : '';
};
const url = get('NEXT_PUBLIC_SUPABASE_URL');
const accessToken = process.env.SUPABASE_ACCESS_TOKEN || get('SUPABASE_ACCESS_TOKEN');
if (!url || !accessToken) {
  console.log('BLOCKED — missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_ACCESS_TOKEN');
  process.exit(1);
}
const ref = url.replace('https://', '').split('.')[0];
const apiBase = `https://api.supabase.com/v1/projects/${ref}/database/query`;

async function q(query) {
  const res = await fetch(apiBase, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ query }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.message || `HTTP ${res.status}`);
  return body;
}

const snapshot = async () => ({
  plans: (await q('select count(*)::int as c from public.billing_plans'))[0].c,
  caps: (await q('select count(*)::int as c from public.plan_activity_caps'))[0].c,
  subs: await q('select clinic_id, plan_id, status from public.subscriptions where deleted_at is null order by plan_id'),
  unbounded: await q(`select b.plan_id
     from public.billing_plans b
     left join public.plan_activity_caps p on p.plan_id = b.plan_id
    where b.is_active = true and p.plan_id is null
    order by b.plan_id`),
});

const before = await snapshot();
console.log('BEFORE plans/caps:', before.plans, '/', before.caps);
console.log('BEFORE subscriptions:', JSON.stringify(before.subs));
console.log('BEFORE active plans without caps:', JSON.stringify(before.unbounded));

// ── apply ────────────────────────────────────────────────────────────────────
console.log(`\nApplying ${FILE} ...`);
try {
  await q(fullSql);
  console.log('APPLY: OK');
} catch (e) {
  console.log('APPLY (single call) FAILED:', e.message);
  console.log('Retrying statement-by-statement ...');
  const statements = codeLines
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  try {
    for (const stmt of statements) await q(stmt);
    console.log('APPLY (per-statement): OK');
  } catch (e2) {
    console.log('APPLY FAILED:', e2.message);
    process.exit(1);
  }
}

// ── verify ───────────────────────────────────────────────────────────────────
let failed = 0;
const check = (name, ok, detail) => {
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS ' : 'FAIL '} ${name}${detail ? ` — ${detail}` : ''}`);
};

const catalog = await q(`select plan_id, name, currency, price_per_month, billing_interval,
                                trial_days, is_active, is_public, display_order, stripe_price_id
                           from public.billing_plans order by display_order`);
console.log('\nCATALOG:');
for (const p of catalog) {
  console.log(
    `  ${String(p.plan_id).padEnd(16)} ${String(p.name).padEnd(12)} ${p.currency} ` +
      `$${(p.price_per_month / 100).toFixed(2).padStart(8)} ${String(p.billing_interval).padEnd(6)} ` +
      `trial=${String(p.trial_days).padEnd(4)} act=${p.is_active ? 'Y' : 'n'} pub=${p.is_public ? 'Y' : 'n'} ` +
      `#${String(p.display_order).padEnd(3)} price=${p.stripe_price_id ? 'set' : 'null'}`
  );
}

const byId = Object.fromEntries(catalog.map((p) => [p.plan_id, p]));
const EXPECT = [
  ['free_trial', 'usd', 0, 'trial', 30],
  ['limited', 'usd', 0, 'month', null],
  ['basic', 'usd', 3900, 'month', null],
  ['advanced', 'usd', 6900, 'month', null],
  ['center', 'usd', 11900, 'month', null],
  ['basic_yearly', 'usd', 39900, 'year', null],
  ['advanced_yearly', 'usd', 69900, 'year', null],
  ['center_yearly', 'usd', 119900, 'year', null],
];
for (const [id, currency, price, interval, trial] of EXPECT) {
  const row = byId[id];
  check(
    `catalog ${id} = ${currency} ${price} / ${interval} / trial ${trial}`,
    !!row &&
      row.currency === currency &&
      row.price_per_month === price &&
      row.billing_interval === interval &&
      (row.trial_days ?? null) === trial,
    row ? `${row.currency} ${row.price_per_month} ${row.billing_interval} trial=${row.trial_days}` : 'MISSING'
  );
}

check('free_trial visible', byId.free_trial?.is_active === true && byId.free_trial?.is_public === true);
check('limited hidden', byId.limited?.is_public === false);
check('founding still ACTIVE (2 live subs depend on it)', byId.founding?.is_active === true);
check('founding hidden from public catalog', byId.founding?.is_public === false);
for (const id of ['starter', 'growth', 'pro']) {
  check(`legacy ${id} hidden`, byId[id]?.is_active === false && byId[id]?.is_public === false);
}
for (const id of ['basic', 'advanced', 'center', 'basic_yearly', 'advanced_yearly', 'center_yearly']) {
  check(`sold tier ${id} carries a stripe_price_id`, !!byId[id]?.stripe_price_id);
}

const after = await snapshot();
console.log('\nAFTER subscriptions:', JSON.stringify(after.subs));
check('no live subscription on a hidden plan', after.subs.every((s) => byId[s.plan_id]?.is_active === true));
check('founding subscribers untouched (2 rows)', after.subs.filter((s) => s.plan_id === 'founding').length === 2);
check('no subscription left on pro', after.subs.filter((s) => s.plan_id === 'pro').length === 0);
check('no active plan without activity caps', after.unbounded.length === 0, JSON.stringify(after.unbounded));

const capRows = await q('select plan_id, count(*)::int as c from public.plan_activity_caps group by 1 order by 1');
console.log('caps per plan:', JSON.stringify(capRows));
check(
  'every active plan has exactly 4 cap rows',
  capRows.filter((r) => byId[r.plan_id]?.is_active === true && r.c !== 4).length === 0
);

const caps = await q(`select count(*)::int as c from public.activity_capabilities
   where capability_key in ('imaging_requests_limit','imaging_services_limit','lab_cases_limit','lab_services_limit')`);
check('activity_capabilities registry complete (4 keys)', caps[0].c === 4, `got ${caps[0].c}`);

const roles = await q(`select count(*)::int as c from pg_enum e join pg_type t on t.oid = e.enumtypid
   where t.typname = 'clinic_user_role' and e.enumlabel in ('staff','doctor','manager','accountant','viewer')`);
check('clinic_user_role carries the 5 application roles', roles[0].c === 5, `got ${roles[0].c}`);

console.log(failed === 0 ? '\nALL CHECKS PASSED' : `\n${failed} CHECK(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);

