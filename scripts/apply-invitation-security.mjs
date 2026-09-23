/**
 * Applies db/migrations/20261017_invitation_security.sql through the Supabase
 * Management API and verifies every object it creates (columns, defaults,
 * constraint, index, the four SECURITY DEFINER functions and their grants).
 *
 * The migration is idempotent (IF NOT EXISTS / CREATE OR REPLACE), so running
 * this twice is safe. Prints PASS/FAIL per check; NEVER prints credentials.
 *
 * Usage:
 *   node scripts/apply-invitation-security.mjs
 *   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/apply-invitation-security.mjs
 *
 * Needs SUPABASE_ACCESS_TOKEN (https://supabase.com/dashboard/account/tokens).
 * Without a token: paste the .sql file into the Supabase SQL editor, then run
 *   node scripts/apply-invitation-security.mjs --verify-only
 */
import fs from 'fs';

const SQL_FILE = process.argv[2] && process.argv[2].endsWith('.sql')
  ? process.argv[2]
  : 'db/migrations/20261017_invitation_security.sql';
const VERIFY_ONLY = process.argv.includes('--verify-only');

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
if (!fs.existsSync(SQL_FILE)) {
  console.log(`BLOCKED — ${SQL_FILE} not found`);
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
  if (!res.ok) {
    const msg = body?.message || `HTTP ${res.status}`;
    if (res.status === 401) {
      throw new Error(
        `${msg} — SUPABASE_ACCESS_TOKEN is expired/revoked. Create a new one at ` +
          'https://supabase.com/dashboard/account/tokens and put it in .env.local',
      );
    }
    throw new Error(msg);
  }
  return body;
}

if (VERIFY_ONLY) {
  console.log(`Verify-only mode — skipping apply of ${SQL_FILE}`);
} else {
  console.log(`Applying ${SQL_FILE} ...`);
  try {
    await runQuery(fs.readFileSync(SQL_FILE, 'utf8'));
    console.log('APPLY: OK');
  } catch (e) {
    console.log('APPLY FAILED:', e.message);
    if (/expired|revoked|401|Unauthorized/i.test(e.message)) {
      console.log('\nManagement API token unusable → running the live PostgREST suite instead');
      console.log('(same migration, verified behaviourally — no token required).\n');
      const { run } = await import('./verify-invitation-security.mjs');
      process.exit((await run()) ? 1 : 0);
    }
    process.exit(1);
  }
}

/** A query returning >= 1 row means PASS (checks are written as EXISTS(...)). */
const checks = [
  ['invitations.opened_at column',
    "select 1 as ok where exists (select 1 from information_schema.columns where table_schema='public' and table_name='invitations' and column_name='opened_at')"],
  ['invitations.session_expires_at column',
    "select 1 as ok where exists (select 1 from information_schema.columns where table_schema='public' and table_name='invitations' and column_name='session_expires_at')"],
  ['invitations.accept_count column',
    "select 1 as ok where exists (select 1 from information_schema.columns where table_schema='public' and table_name='invitations' and column_name='accept_count')"],
  ['invitations.extend_count column',
    "select 1 as ok where exists (select 1 from information_schema.columns where table_schema='public' and table_name='invitations' and column_name='extend_count')"],
  ['expires_at default is 24 hours',
    "select 1 as ok from pg_attrdef d join pg_attribute a on a.attrelid=d.adrelid and a.attnum=d.adnum where d.adrelid='public.invitations'::regclass and a.attname='expires_at' and pg_get_expr(d.adbin, d.adrelid) like '%24 hours%'"],
  ['invitations_single_use constraint',
    "select 1 as ok from pg_constraint where conrelid='public.invitations'::regclass and conname='invitations_single_use'"],
  ['idx_invitations_expiring index',
    "select 1 as ok from pg_indexes where schemaname='public' and indexname='idx_invitations_expiring'"],
  ['open_invitation(text) is security definer',
    "select 1 as ok from pg_proc where proname='open_invitation' and prosecdef and proconfig::text like '%search_path=public%'"],
  ['accept_invitation(text, uuid) is security definer',
    "select 1 as ok from pg_proc where proname='accept_invitation' and prosecdef and proconfig::text like '%search_path=public%'"],
  ['extend_invitation(5 args) is security definer',
    "select 1 as ok from pg_proc where proname='extend_invitation' and prosecdef and proconfig::text like '%search_path=public%'"],
  ['expire_stale_invitations() is security definer',
    "select 1 as ok from pg_proc where proname='expire_stale_invitations' and prosecdef and proconfig::text like '%search_path=public%'"],
  ['anon CANNOT execute open_invitation',
    "select 1 as ok where not has_function_privilege('anon','public.open_invitation(text)','execute')"],
  ['anon CANNOT execute accept_invitation',
    "select 1 as ok where not has_function_privilege('anon','public.accept_invitation(text, uuid)','execute')"],
  ['service_role CAN execute accept_invitation',
    "select 1 as ok where has_function_privilege('service_role','public.accept_invitation(text, uuid)','execute')"],
  ['backfill: no accepted row with accept_count = 0',
    "select 1 as ok where not exists (select 1 from public.invitations where status='accepted' and accept_count=0)"],
  ['no duplicate pending tokens',
    "select 1 as ok where not exists (select token from public.invitations where status='pending' group by token having count(*)>1)"],
];

let failed = 0;
for (const [name, sql] of checks) {
  try {
    const rows = await runQuery(sql);
    const ok = Array.isArray(rows) && rows.length > 0;
    console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}`);
    if (!ok) failed += 1;
  } catch (e) {
    console.log(`FAIL | ${name} | ${e.message}`);
    failed += 1;
  }
}
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
process.exit(failed ? 1 : 0);
