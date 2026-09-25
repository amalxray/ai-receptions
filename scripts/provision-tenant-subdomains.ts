/**
 * P0 — TENANT SUBDOMAIN PROVISIONING (WRITES to the Vercel project).
 *
 * WHY: `addClinicSubdomain()` registers `{slug}.dentairec.com` on the Vercel
 * project, which is what makes the tenant host resolvable + certifiable at all.
 * Provisioning is best-effort inside registration/onboarding (every failure is
 * swallowed there so a tenant setup can never be blocked), so a tenant can end
 * up with a live slug and NO registered domain. The canonical-migration 301
 * (`middleware.ts`) then points at a host whose TLS handshake aborts — a dead
 * end for patients, printed QR codes and canonical tags.
 *
 * This script closes that gap for existing tenants and is IDEMPOTENT: Vercel's
 * `domain_already_exists` is reported as success (`alreadyExisted: true`), so
 * re-running it never fails and never removes anything.
 *
 * WHY THIS FILE LIVES INSIDE THE REPO (scripts/):
 *   The `@/*` path alias is declared in tsconfig.json and mirrored in
 *   vitest.config.ts; both only apply to files under the project root, so a copy
 *   in /tmp cannot resolve `@/lib/vercel/domains`.
 *
 * RUN (from the repo root; vite-node ships with vitest and honours the @ alias):
 *   npm run provision:tenants -- --persist amal-clinic ahmad-clinic alawael-clinic almtmizon
 *   npm run provision:tenants -- --persist            # default: the four above
 *
 * `--persist` also records the outcome in `clinics.settings.tenant`
 * (`subdomain_status: 'active' | 'failed'`, the existing contract in
 * `lib/services/clinicProvisioning.ts`) so the dashboard can show a real state.
 * Readiness itself stays Vercel-authoritative (P1) — the DB value is a record,
 * never the redirect decision.
 */
import fs from 'fs';
import { fileURLToPath } from 'url';

const envPath = fileURLToPath(new URL('../.env.local', import.meta.url));
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '').replace(/\r/g, '');
}

/** Tenants whose slug is live in the DB but whose host was never registered. */
const DEFAULT_SLUGS = ['amal-clinic', 'ahmad-clinic', 'alawael-clinic', 'almtmizon'];

async function main() {
  const argv = process.argv.slice(2);
  const persist = argv.includes('--persist');
  const requested = argv.filter((a) => !a.startsWith('--'));
  const targets = requested.length > 0 ? requested : DEFAULT_SLUGS;

  // Imported AFTER the env file is loaded: supabaseAdmin reads its env at module init.
  const domains = await import('@/lib/vercel/domains');
  const { persistClinicProvisioning } = await import('@/lib/services/clinicProvisioning');
  const { supabaseAdmin } = await import('@/lib/supabase/admin');

  console.log(`provision-tenant-subdomains — persist=${persist} targets=${targets.join(', ')}\n`);

  let failures = 0;

  for (const raw of targets) {
    const slug = domains.normalizeTenantSlug(raw);

    if (!domains.isValidTenantSlug(slug) || domains.isReservedSubdomain(slug)) {
      console.log(`✗ ${raw}: not a valid tenant slug (skipped, nothing sent)`);
      failures += 1;
      continue;
    }

    // The slug must belong to a live tenant: provisioning a host for a slug that
    // has no clinic row would publish an empty tenant site.
    const { data: clinic, error: readError } = await supabaseAdmin
      .from('clinics')
      .select('id, slug')
      .eq('slug', slug)
      .is('deleted_at', null)
      .maybeSingle();

    if (readError) {
      console.log(`✗ ${slug}: clinic lookup failed — ${readError.message}`);
      failures += 1;
      continue;
    }
    if (!clinic) {
      console.log(`✗ ${slug}: no live clinic with this slug (skipped, nothing sent)`);
      failures += 1;
      continue;
    }

    const result = await domains.addClinicSubdomain(slug);
    const domain = result.domain ?? domains.clinicSubdomain(slug);

    // `'error' in result` (not `!result.success`): the project compiles with
    // `strict: false`, where narrowing on the `success` discriminant does not
    // apply and `result.error` would be a type error (same note as the API route).
    const failed = 'error' in result;

    let persisted: boolean | undefined;
    if (persist) {
      persisted = failed
        ? await persistClinicProvisioning(clinic.id, {
            subdomain_status: 'failed',
            subdomain_error: result.error ?? 'unknown',
          })
        : await persistClinicProvisioning(clinic.id, {
            subdomain: domain,
            subdomain_status: 'active',
            // Clear a STALE failure message: `persistClinicProvisioning` merges
            // over the old object, so a tenant that failed once (e.g. the live
            // `almtmizon` row carried `subdomain_error: 'CREDENTIALS_MISSING'`)
            // would otherwise report "active" AND an error forever. `undefined`
            // is dropped by JSON serialisation, i.e. the key is removed.
            subdomain_error: undefined,
          });
    }

    const status = failed ? '✗' : '✓';
    console.log(
      `${status} ${slug} → ${domain}` +
        (failed
          ? ` | error=${result.error} code=${result.code}`
          : ` | verified=${result.verified === true} alreadyExisted=${result.alreadyExisted === true}`) +
        (persist ? ` | persisted=${persisted === true}` : '')
    );

    // Read-back through the SAME client the app uses: `persisted: true` only
    // proves the update was accepted, not that the row now says what we meant.
    if (persist) {
      const { data: after } = await supabaseAdmin
        .from('clinics')
        .select('settings')
        .eq('id', clinic.id)
        .maybeSingle();
      const tenant = (after?.settings as Record<string, unknown> | null)?.tenant;
      console.log(`   readback: ${JSON.stringify(tenant ?? null)}`);
    }

    if (failed) failures += 1;
  }

  console.log(`\ndone — ${targets.length - failures}/${targets.length} ok`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e instanceof Error ? `${e.name}: ${e.message}\n${e.stack}` : String(e));
  process.exitCode = 1;
});
