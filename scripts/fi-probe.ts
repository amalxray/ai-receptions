/**
 * Read-only probe: runs the REAL lib/services/financialIntelligence against the
 * live DB for hala-clinic (breaks) and amal-x-ray-center (works).
 * No writes. Outputs only the failing message/stack + key figures.
 *
 * WHY THIS FILE LIVES INSIDE THE REPO (scripts/):
 *   The `@/*` path alias is declared in tsconfig.json (`paths: { "@/*": ["./*"] }`)
 *   and mirrored in vitest.config.ts. Both only apply to files under the project
 *   root, so a copy kept in /tmp cannot resolve `@/lib/services/financialIntelligence`
 *   (tsc: "Cannot find module", runtime: ERR_MODULE_NOT_FOUND) — and the service
 *   itself imports `@/lib/supabase/admin` + `@/lib/server/logging` internally.
 *
 * RUN (from the repo root; vite-node ships with vitest and honours the @ alias):
 *   node node_modules/vite-node/vite-node.mjs -c vitest.config.ts scripts/fi-probe.ts
 */
import fs from 'fs';
import { fileURLToPath } from 'url';

const envPath = fileURLToPath(new URL('../.env.local', import.meta.url));
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '').replace(/\r/g, '');
}

const HALA = 'ab05e3b9-8242-40e5-9392-aa412c8d9af4';
const AMAL = '14f6ad3a-f9bf-4108-a809-7e96ad3e2bf5';

const scenarios: Array<[string, string, { fromMonth?: string; toMonth?: string }]> = [
  ['hala-clinic / NO range (as my REST probe)', HALA, {}],
  ['hala-clinic / PAGE default range 3mo (2026-06-01..2026-09-01)', HALA, { fromMonth: '2026-06-01', toMonth: '2026-09-01' }],
  ['hala-clinic / PAGE prior window (2026-03-01..2026-05-01)', HALA, { fromMonth: '2026-03-01', toMonth: '2026-05-01' }],
  ['amal-x-ray-center / PAGE default range', AMAL, { fromMonth: '2026-06-01', toMonth: '2026-09-01' }],
];

async function main() {
  // Imported AFTER the env file is loaded: supabaseAdmin reads its env at module init.
  const mod = await import('@/lib/services/financialIntelligence');

  for (const [label, id, range] of scenarios) {
    try {
      const r = await mod.getFinancialIntelligence(id, range);
      console.log(`\n=== OK :: ${label} ===`);
      console.log(
        JSON.stringify(
          {
            kpis: r.kpis,
            meta: r.meta,
            pnlTrends: r.pnlTrends,
            cashTrends: r.cashTrends,
            receivables: {
              totalOutstanding: r.receivables.totalOutstanding,
              averageAgeDays: r.receivables.averageAgeDays,
              overdue90Share: r.receivables.overdue90Share,
              paymentMethods: r.receivables.paymentMethods,
              topOverdue: r.receivables.topOverdue,
            },
            profitability: r.profitability,
            cashRegister: r.cashRegister,
            anomalies: r.anomalies,
            recommendations: r.recommendations,
          },
          null,
          1
        )
      );
    } catch (e) {
      console.log(`\n=== FAILED :: ${label} ===`);
      console.log(e instanceof Error ? `${e.name}: ${e.message}\n--stack--\n${e.stack}` : String(e));
    }
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? `${e.name}: ${e.message}\n${e.stack}` : String(e));
  process.exitCode = 1;
});
