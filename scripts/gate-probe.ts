/**
 * Read-only probe: is a clinic blocked by the FEATURE GATE or by ROLE/RLS?
 * No writes. Prints the real gate decision per feature + the raw
 * clinic_users / subscription-ish tables so a 402 can be told apart from a 403.
 *
 * WHY THIS FILE LIVES INSIDE THE REPO (scripts/):
 *   The `@/*` path alias is declared in tsconfig.json (`paths: { "@/*": ["./*"] }`)
 *   and mirrored in vitest.config.ts. Both only apply to files under the project
 *   root, so a copy kept in /tmp cannot resolve `@/lib/subscription/featureGateServer`
 *   (tsc: "Cannot find module", runtime: ERR_MODULE_NOT_FOUND) — and it would also
 *   miss `types: ["node"]`, hence 'fs'/'process' being unknown.
 *
 * RUN (from the repo root; vite-node ships with vitest and honours the @ alias):
 *   node node_modules/vite-node/vite-node.mjs -c vitest.config.ts scripts/gate-probe.ts
 */
import fs from 'fs';
import { fileURLToPath } from 'url';
import { FEATURE_KEYS, isFeatureKey } from '@/lib/subscription/featureGate';

const envPath = fileURLToPath(new URL('../.env.local', import.meta.url));
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '').replace(/\r/g, '');
}

const CLINICS: Array<[string, string]> = [
  ['hala-clinic', 'ab05e3b9-8242-40e5-9392-aa412c8d9af4'],
  ['amal-x-ray-center', '14f6ad3a-f9bf-4108-a809-7e96ad3e2bf5'],
];

// Names other layers ask about that are NOT registry features. canUseFeature()
// returns true for any unknown key (FEATURE_PLANS[feature] undefined ⇒ ungated),
// so probing them through the real function would print a misleading "allowed".
const NOT_REGISTRY = ['payroll', 'accounting'];

const TABLES = ['clinic_subscriptions', 'subscriptions', 'subscription_plans', 'plans', 'entitlements'];

async function main() {
  // Imported AFTER the env file is loaded: supabaseAdmin reads its env at module init.
  const gate = await import('@/lib/subscription/featureGateServer');
  const { supabaseAdmin: sb } = await import('@/lib/supabase/admin');

  console.log(`FEATURE_KEYS (registry) = ${FEATURE_KEYS.join(', ')}`);

  for (const [name, id] of CLINICS) {
    console.log(`\n===== ${name} (${id}) =====`);

    for (const feature of FEATURE_KEYS) {
      try {
        const g = await gate.featureGateForClinic(id, feature);
        console.log(`gate[${feature}] -> ${JSON.stringify(g)}`);
      } catch (e) {
        console.log(`gate[${feature}] THREW -> ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    for (const other of NOT_REGISTRY) {
      console.log(
        `gate[${other}] -> NOT IN REGISTRY (isFeatureKey=${isFeatureKey(other)}) ` +
          '— ungated by construction; never a reliable paywall signal'
      );
    }

    const { data: members, error: mErr } = await sb
      .from('clinic_users')
      .select('role, user_id, deleted_at')
      .eq('clinic_id', id);
    console.log(`clinic_users -> ${mErr ? `ERROR ${mErr.message}` : JSON.stringify(members)}`);

    for (const table of TABLES) {
      const { data, error } = await sb.from(table).select('*').limit(3);
      console.log(`${table} -> ${error ? `ERROR ${error.message}` : JSON.stringify(data)}`);
    }
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? `${e.name}: ${e.message}\n${e.stack}` : String(e));
  process.exitCode = 1;
});