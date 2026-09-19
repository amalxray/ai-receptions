/**
 * AUDIT — subscription data + foreign-key semantics (READ ONLY).
 *
 * Prints:
 *   1. billing_plans (full rows)
 *   2. subscriptions (live rows, no soft-deleted)
 *   3. plan_activity_caps counts per plan
 *   4. activity_capabilities registry
 *   5. entitlement_usage counters
 *   6. FK metadata for every constraint referencing billing_plans(plan_id)
 *      — confupdtype / confdeltype decide whether renaming or deleting a
 *        plan_id is even possible (NO ACTION = the rename is rejected).
 *
 * Performs no writes. Safe to run at any time.
 */
import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const env = {};
readFileSync('.env.local', 'utf-8').split('\n').forEach((line) => {
  const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
});

const accessToken = process.env.SUPABASE_ACCESS_TOKEN || env.SUPABASE_ACCESS_TOKEN;
const ref = env.NEXT_PUBLIC_SUPABASE_URL.replace('https://', '').split('.')[0];

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const { data: plans } = await sb.from('billing_plans').select('*').order('display_order');
console.log('=== billing_plans ===');
console.log(JSON.stringify(plans, null, 2));

const { data: subs } = await sb
  .from('subscriptions')
  .select('id, clinic_id, plan_id, status, billing_status, stripe_subscription_id, current_period_end, deleted_at');
console.log('\n=== subscriptions (all rows incl. soft-deleted) ===');
console.log(JSON.stringify(subs, null, 2));

const { data: pac } = await sb.from('plan_activity_caps').select('plan_id, activity_type, capability_key, limit_value');
const byPlan = {};
for (const r of pac || []) byPlan[r.plan_id] = (byPlan[r.plan_id] || 0) + 1;
console.log('\n=== plan_activity_caps per plan ===');
console.log(JSON.stringify(byPlan, null, 2));

const { data: ac } = await sb.from('activity_capabilities').select('capability_key, label, applies_to, standard_cap');
console.log('\n=== activity_capabilities ===');
console.log(JSON.stringify(ac, null, 2));

const { data: eu } = await sb.from('entitlement_usage').select('clinic_id, resource, used_count, period_start');
console.log('\n=== entitlement_usage ===');
console.log(JSON.stringify(eu, null, 2));

// ── FK semantics (read-only introspection via the Management API) ────────────
const ACTION = {
  a: 'NO ACTION',
  r: 'RESTRICT',
  c: 'CASCADE',
  n: 'SET NULL',
  d: 'SET DEFAULT',
};

if (accessToken) {
  const sql = `
    select
      con.conname                              as constraint_name,
      src.relname                              as child_table,
      (select string_agg(att.attname, ',' order by att.attnum)
         from unnest(con.conkey) as k(attnum)
         join pg_attribute att on att.attrelid = con.conrelid and att.attnum = k.attnum) as child_columns,
      case con.confupdtype when 'a' then 'NO ACTION' when 'r' then 'RESTRICT'
        when 'c' then 'CASCADE' when 'n' then 'SET NULL' when 'd' then 'SET DEFAULT' end as on_update,
      case con.confdeltype when 'a' then 'NO ACTION' when 'r' then 'RESTRICT'
        when 'c' then 'CASCADE' when 'n' then 'SET NULL' when 'd' then 'SET DEFAULT' end as on_delete
    from pg_constraint con
    join pg_class src on src.oid = con.conrelid
    join pg_class tgt on tgt.oid = con.confrelid
    where con.contype = 'f'
      and tgt.relname = 'billing_plans'
    order by src.relname`;
  try {
    const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ query: sql }),
    });
    const body = await res.json();
    console.log('\n=== FKs referencing billing_plans(plan_id) ===');
    console.log(JSON.stringify(body, null, 2));
  } catch (e) {
    console.log('\nFК introspection failed:', e.message);
  }
} else {
  console.log('\n(no SUPABASE_ACCESS_TOKEN — skipped FK introspection)');
}
