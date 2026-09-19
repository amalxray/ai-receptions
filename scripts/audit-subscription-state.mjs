/**
 * READ-ONLY inventory of the subscription objects. Prints plans, activity caps,
 * live subscriptions and the capability registry. Never writes anything.
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = {};
readFileSync('.env.local', 'utf-8')
  .split('\n')
  .forEach((line) => {
    const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  });

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const { data: plans } = await sb
  .from('billing_plans')
  .select('plan_id,name,currency,price_per_month,billing_interval,trial_days,is_active,is_public,display_order,stripe_price_id,limits,updated_at')
  .order('display_order');

console.log('=== billing_plans ===');
for (const p of plans ?? []) {
  console.log(
    `${String(p.plan_id).padEnd(16)} ${String(p.name).padEnd(12)} ${p.currency} ` +
      `$${(p.price_per_month / 100).toFixed(2).padStart(8)} ${String(p.billing_interval).padEnd(6)} ` +
      `trial=${String(p.trial_days).padEnd(4)} act=${p.is_active ? 'Y' : 'n'} pub=${p.is_public ? 'Y' : 'n'} ` +
      `#${String(p.display_order).padEnd(3)} price=${p.stripe_price_id ? 'set' : 'null'} upd=${p.updated_at}`
  );
}
console.log(`total: ${plans?.length ?? 0}`);
console.log('\nlimits:');
for (const p of plans ?? []) console.log(`  ${String(p.plan_id).padEnd(16)} ${JSON.stringify(p.limits)}`);

const { data: caps } = await sb.from('plan_activity_caps').select('plan_id,activity_type,capability_key,limit_value');
const per = {};
for (const c of caps ?? []) per[c.plan_id] = (per[c.plan_id] ?? 0) + 1;
console.log('\n=== plan_activity_caps ===');
console.log(`total: ${caps?.length ?? 0}`, JSON.stringify(per));
for (const c of caps ?? []) {
  console.log(`  ${String(c.plan_id).padEnd(16)} ${String(c.activity_type).padEnd(15)} ${String(c.capability_key).padEnd(24)} ${c.limit_value === null ? 'unlimited' : c.limit_value}`);
}

const { data: ac } = await sb.from('activity_capabilities').select('capability_key,label,applies_to');
console.log('\n=== activity_capabilities ===');
console.log(JSON.stringify(ac, null, 0));

const { data: subs } = await sb
  .from('subscriptions')
  .select('clinic_id,plan_id,status,billing_status,current_period_end,trial_end,stripe_subscription_id')
  .is('deleted_at', null);
const { data: clinics } = await sb.from('clinics').select('id,name,slug').is('deleted_at', null);
const nameOf = Object.fromEntries((clinics ?? []).map((c) => [c.id, c.slug]));
console.log('\n=== subscriptions (live) ===');
for (const s of subs ?? []) {
  console.log(
    `  ${String(nameOf[s.clinic_id] ?? s.clinic_id).padEnd(20)} ${String(s.plan_id).padEnd(10)} ` +
      `${String(s.status).padEnd(10)} ${String(s.billing_status).padEnd(8)} end=${s.current_period_end} ` +
      `stripe=${s.stripe_subscription_id ? 'linked' : 'none'}`
  );
}
