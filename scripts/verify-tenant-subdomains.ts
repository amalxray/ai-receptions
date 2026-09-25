/**
 * READ-ONLY tenant verification — proves the canonical-migration surfaces work
 * end to end against PRODUCTION, for every live tenant:
 *
 *   1. https://{slug}.dentairec.com/        → 200 (host registered + cert issued)
 *   2. /q/{public_id} on the platform host  → 302 → follow → 200 (printed QR codes)
 *   3. https://www.dentairec.com/c/{slug}   → 200 and its canonical tag points at
 *                                             the tenant host (never a dead one)
 *
 * WHY: the failure this guards against is invisible to unit tests — a tenant
 * whose slug is live in the DB but whose host was never registered in Vercel
 * resolves to nothing, so every 301 / canonical / QR target became a dead end.
 * Read-only: performs GETs only, writes nothing.
 *
 * RUN:
 *   npm run verify:tenants
 *   npm run verify:tenants -- hala-clinic amal-clinic
 */
import fs from 'fs';
import { fileURLToPath } from 'url';

const envPath = fileURLToPath(new URL('../.env.local', import.meta.url));
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '').replace(/\r/g, '');
}

const TIMEOUT_MS = 25_000;

type Row = {
  slug: string;
  publicId: string | null;
  host: number | 'ERR';
  legacy: number | 'ERR';
  qr: string;
  canonical: string;
};

/** Status of a GET without following redirects. */
async function status(url: string): Promise<number | 'ERR'> {
  try {
    const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS) });
    return res.status;
  } catch {
    return 'ERR';
  }
}

/** `302 → https://…` then the final status after following it. */
async function redirectChain(url: string): Promise<string> {
  try {
    const first = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS) });
    const location = first.headers.get('location');
    if (!location) return `http=${first.status} (no location)`;
    const final = await fetch(new URL(location, url).toString(), {
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return `${first.status} → ${location} → ${final.status}`;
  } catch (e) {
    return `ERR ${e instanceof Error ? e.message : String(e)}`;
  }
}

/** Extracts the canonical href from a page (empty when absent). */
async function canonicalOf(url: string): Promise<string> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    const html = await res.text();
    return html.match(/rel="canonical"[^>]*href="([^"]+)"/)?.[1] ?? '(none)';
  } catch {
    return 'ERR';
  }
}

async function main() {
  const { supabaseAdmin } = await import('@/lib/supabase/admin');
  const { TENANT_ROOT_DOMAIN, clinicSpaceUrl } = await import('@/lib/vercel/domains');

  const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));

  const { data, error } = await supabaseAdmin
    .from('clinics')
    .select('slug, public_id')
    .is('deleted_at', null)
    .order('slug');
  if (error) throw new Error(error.message);

  const clinics = (data ?? []).filter((c) => only.length === 0 || only.includes(c.slug));
  console.log(`root domain = ${TENANT_ROOT_DOMAIN} | tenants = ${clinics.length}\n`);

  const rows: Row[] = [];
  for (const clinic of clinics) {
    const slug = clinic.slug as string;
    const publicId = (clinic.public_id as string | null) ?? null;
    const host = clinicSpaceUrl(slug);

    rows.push({
      slug,
      publicId,
      host: await status(`${host}/`),
      legacy: await status(`https://www.${TENANT_ROOT_DOMAIN}/c/${slug}`),
      qr: publicId ? await redirectChain(`https://www.${TENANT_ROOT_DOMAIN}/q/${publicId}`) : 'NO public_id',
      canonical: await canonicalOf(`https://www.${TENANT_ROOT_DOMAIN}/c/${slug}`),
    });
  }

  let failures = 0;
  for (const row of rows) {
    const expected = clinicSpaceUrl(row.slug);
    const canonicalOk = row.canonical === expected;
    const ok =
      row.host === 200 &&
      row.legacy === 200 &&
      !row.qr.startsWith('ERR') &&
      !row.qr.endsWith('NO public_id') &&
      !row.qr.includes('(no location)') &&
      canonicalOk;
    if (!ok) failures += 1;

    console.log(`${ok ? '✓' : '✗'} ${row.slug}`);
    console.log(`   host       ${row.host}`);
    console.log(`   /c/ legacy ${row.legacy}`);
    console.log(`   QR ${row.publicId?.slice(0, 8) ?? '-'}…  ${row.qr}`);
    console.log(`   canonical  ${row.canonical}${canonicalOk ? '' : `  ← EXPECTED ${expected}`}`);
  }

  console.log(`\n${rows.length - failures}/${rows.length} tenants fully reachable`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e instanceof Error ? `${e.name}: ${e.message}\n${e.stack}` : String(e));
  process.exitCode = 1;
});
