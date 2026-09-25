/**
 * Read-only probe: pure entitlement policy matrix (plan × feature) + the 15C
 * status policy (active/trialing/past_due/... → effective plan id).
 * Pure functions only — no DB writes, no clinic data touched.
 *
 * WHY THIS FILE LIVES INSIDE THE REPO (scripts/): the `@/*` alias and
 * `types: ["node"]` both come from the project tsconfig/vitest config and do not
 * apply to a file kept in /tmp (tsc: "Cannot find module", unknown 'fs'/'process').
 *
 * RUN (from the repo root):
 *   node node_modules/vite-node/vite-node.mjs -c vitest.config.ts scripts/matrix-probe.ts
 */
import { FEATURE_KEYS } from '@/lib/subscription/featureGate';

const PLAN_IDS = [
  'limited',
  'free_trial',
  'basic',
  'basic_yearly',
  'advanced',
  'advanced_yearly',
  'center',
  'center_yearly',
  // legacy v1 ids still resolvable for live subscriptions
  'founding',
  'growth',
  'pro',
  'starter',
];

const STATUSES = ['active', 'trialing', 'past_due', 'unpaid', 'cancelled', 'canceled', 'expired', 'none'];

async function main() {
  const fg = await import('@/lib/subscription/featureGate');
  const plans = await import('@/lib/subscription/plans');
  const ent = await import('@/lib/subscription/entitlements');

  console.log('exports(plans):', Object.keys(plans).join(', '));
  console.log('exports(entitlements):', Object.keys(ent).join(', '));

  console.log('\nplan × feature (canUseFeature) — required plan in parentheses when denied:');
  const header = 'plan'.padEnd(16) + FEATURE_KEYS.map((f) => f.padEnd(14)).join('');
  console.log(header);
  for (const planId of PLAN_IDS) {
    const cells = FEATURE_KEYS.map((feature) =>
      (fg.canUseFeature(planId, feature) ? 'yes' : `no(${fg.getRequiredPlan(feature)})`).padEnd(14)
    );
    console.log(planId.padEnd(16) + cells.join(''));
  }

  console.log('\nstatus → effectivePlanIdFor({ plan_id: "advanced_yearly", status }):');
  for (const status of STATUSES) {
    const { planId, degraded } = ent.effectivePlanIdFor({
      plan_id: 'advanced_yearly',
      status,
    } as never);
    const features = FEATURE_KEYS.filter((f) => fg.canUseFeature(planId, f)).join(',') || '(none)';
    console.log(`  ${status.padEnd(10)} -> planId=${planId.padEnd(16)} degraded=${String(degraded).padEnd(5)} unlocked=${features}`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? `${e.name}: ${e.message}\n${e.stack}` : String(e));
  process.exitCode = 1;
});