/**
 * Applies db/migrations/20260921_subscription_foundation_fixes.sql
 * (FIX-5 activity_capabilities + FIX-7 clinic_user_role enum) through the
 * Supabase Management API and verifies the outcome.
 *
 * READ-ONLY with respect to business data: the migration only inserts one
 * registry row and adds enum labels. It never touches billing_plans,
 * subscriptions, plan_activity_caps or entitlement_usage — the three live
 * subscriptions must keep resolving exactly as before.
 *
 * Bonus verification: proves billing_plans / subscriptions / plan_activity_caps
 * row counts are unchanged after the apply (continuity evidence).
 *
 * Never prints credentials. Exit 0 on PASS, 1 on any failure.
 */
import fs from 'node:fs';

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

async function runQuery(sql) {
  const res = await fetch(apiBase, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ query: sql }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.message || `HTTP ${res.status}`);
  return body;
}

const FILE = 'db/migrations/20260921_subscription_foundation_fixes.sql';

async function count(table) {
  const rows = await runQuery(`select count(*)::int as c from public.${table}`);
  return Array.isArray(rows) ? rows[0]?.c : undefined;
}

// ── before ───────────────────────────────────────────────────────────────────
const before = {
  billing_plans: await count('billing_plans'),
  subscriptions: await count('subscriptions'),
  plan_activity_caps: await count('plan_activity_caps'),
  activity_capabilities: await count('activity_capabilities'),
};
console.log('BEFORE:', JSON.stringify(before));

// ── apply ────────────────────────────────────────────────────────────────────
console.log(`Applying ${FILE} ...`);
try {
  await runQuery(fs.readFileSync(FILE, 'utf8'));
  console.log('APPLY: OK');
} catch (e) {
  // ALTER TYPE ... ADD VALUE cannot share a multi-statement implicit transaction
  // on some PostgreSQL builds — retry statement-by-statement.
  console.log('APPLY (single call) FAILED:', e.message);
  console.log('Retrying statement-by-statement ...');
  const statements = fs
    .readFileSync(FILE, 'utf8')
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s && !s.split('\n').every((l) => l.trim() === '' || l.trim().startsWith('--')));
  try {
    for (const stmt of statements) await runQuery(stmt);
    console.log('APPLY (per-statement): OK');
  } catch (e2) {
    console.log('APPLY FAILED:', e2.message);
    process.exit(1);
  }
}

// ── verify ───────────────────────────────────────────────────────────────────
const checks = [];
checks.push([
  'capability registry has all four keys',
  `select count(*)::int as c from public.activity_capabilities
     where capability_key in ('imaging_requests_limit','imaging_services_limit','lab_cases_limit','lab_services_limit')`,
  4,
]);
checks.push([
  'imaging_services_limit registered for imaging_center',
  `select count(*)::int as c from public.activity_capabilities
     where capability_key = 'imaging_services_limit'
       and applies_to @> array['imaging_center']::activity_type[]`,
  1,
]);
checks.push([
  'clinic_user_role carries the 5 application roles',
  `select count(*)::int as c from pg_enum e
     join pg_type t on t.oid = e.enumtypid
    where t.typname = 'clinic_user_role'
      and e.enumlabel in ('staff','doctor','manager','accountant','viewer')`,
  5,
]);
checks.push([
  'clinic_user_role keeps the 3 original roles',
  `select count(*)::int as c from pg_enum e
     join pg_type t on t.oid = e.enumtypid
    where t.typname = 'clinic_user_role'
      and e.enumlabel in ('owner','admin','receptionist')`,
  3,
]);

let failed = 0;
for (const [name, sql, expected] of checks) {
  let actual;
  try {
    const rows = await runQuery(sql);
    actual = Array.isArray(rows) ? rows[0]?.c : undefined;
  } catch (e) {
    console.log(`FAIL  ${name} — ${e.message}`);
    failed += 1;
    continue;
  }
  const ok = Number(actual) === expected;
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS ' : 'FAIL '} ${name} (expected ${expected}, got ${actual})`);
}

// ── continuity: business tables must be byte-identical in row counts ─────────
const after = {
  billing_plans: await count('billing_plans'),
  subscriptions: await count('subscriptions'),
  plan_activity_caps: await count('plan_activity_caps'),
  activity_capabilities: await count('activity_capabilities'),
};
console.log('AFTER: ', JSON.stringify(after));

for (const key of ['billing_plans', 'subscriptions', 'plan_activity_caps']) {
  const ok = before[key] === after[key];
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS ' : 'FAIL '} continuity ${key} unchanged (${before[key]} → ${after[key]})`);
}
const okCaps = after.activity_capabilities === before.activity_capabilities + 1;
if (!okCaps) failed += 1;
console.log(
  `${okCaps ? 'PASS ' : 'FAIL '} activity_capabilities +1 (${before.activity_capabilities} → ${after.activity_capabilities})`
);

console.log(failed === 0 ? '\nALL CHECKS PASSED' : `\n${failed} CHECK(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
