/**
 * verify-permissions-rpc.mjs — live proof that the permissions save path is wired.
 *
 * Run AFTER applying:
 *   db/migrations/20261011_permissions_and_custom_roles.sql
 *   db/migrations/20261015_fix_set_user_permissions.sql
 *
 * It talks to PostgREST exactly like the API route does (service role), so the
 * result reflects production reality — not what the SQL editor believes:
 *
 *   A) the 4-arg overload must be REACHABLE  → P0001 'Unauthorized' for a bogus
 *      actor. That error comes from INSIDE the function body, which is only
 *      possible when PostgREST found and executed it.
 *   B) the retired 3-arg overload must be GONE → PGRST202.
 *   C) with a REAL active owner id the function must reach its membership guard
 *      → P0001 'TARGET_NOT_MEMBER' (still side-effect free: it raises before any
 *      delete/insert).
 *
 * PGRST202 on (A) means the function is missing from the DB/cache — i.e. the
 * migration did not land (this is the exact failure mode that produced
 * PERMISSIONS_MIGRATION_REQUIRED in the dashboard).
 *
 * Never prints credentials. Exits 1 on any FAIL.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envRaw = fs.readFileSync(path.join(repoRoot, '.env.local'), 'utf8');
const get = (key) => {
  const line = envRaw.split('\n').find((l) => l.startsWith(key + '='));
  return line ? line.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '') : '';
};

const url = get('NEXT_PUBLIC_SUPABASE_URL');
const serviceKey = get('SUPABASE_SERVICE_ROLE_KEY');
if (!url || !serviceKey) {
  console.log('BLOCKED — missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' };
const callRpc = async (payload) => {
  const res = await fetch(`${url}/rest/v1/rpc/set_user_permissions`, {
    method: 'POST', headers, body: JSON.stringify(payload),
  });
  let body = {};
  try { body = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, code: body.code ?? null, message: body.message ?? '' };
};

let failed = 0;
const check = (ok, label, detail) => {
  console.log(`${ok ? '✅ PASS' : '❌ FAIL'} — ${label}${detail ? `\n     ${detail}` : ''}`);
  if (!ok) failed += 1;
};

const ZERO = '00000000-0000-0000-0000-000000000001';

console.log('=== PERMISSIONS RPC — LIVE VERIFICATION ===\n');

// A) 4-arg overload reachable?
const bogus = await callRpc({
  p_actor_user_id: ZERO, p_user_id: ZERO, p_clinic_id: ZERO, p_permissions: {},
});
check(
  bogus.code === 'P0001' && /Unauthorized/i.test(bogus.message),
  '4-arg set_user_permissions is reachable and executing (expect P0001 Unauthorized)',
  `status=${bogus.status} code=${bogus.code} message=${bogus.message.slice(0, 120)}`
);

// B) retired 3-arg overload gone?
const legacy = await callRpc({ p_user_id: ZERO, p_clinic_id: ZERO, p_permissions: {} });
check(
  legacy.code === 'PGRST202',
  'retired 3-arg overload is gone (expect PGRST202)',
  `status=${legacy.status} code=${legacy.code} message=${legacy.message.slice(0, 120)}`
);

// C) with a REAL owner the function must reach its membership guard.
const ownersRes = await fetch(
  `${url}/rest/v1/clinic_users?select=user_id,clinic_id&role=eq.owner&deleted_at=is.null&limit=1`,
  { headers }
);
const owners = await ownersRes.json();
if (Array.isArray(owners) && owners.length > 0) {
  const { user_id: ownerId, clinic_id: clinicId } = owners[0];
  const real = await callRpc({
    p_actor_user_id: ownerId, p_user_id: ZERO, p_clinic_id: clinicId, p_permissions: {},
  });
  check(
    real.code === 'P0001' && /TARGET_NOT_MEMBER/i.test(real.message),
    'real owner + non-member target reaches the membership guard (expect TARGET_NOT_MEMBER)',
    `status=${real.status} code=${real.code} message=${real.message.slice(0, 120)}`
  );
} else {
  console.log('⚠️  SKIP — no active owner row readable (cannot run check C)');
}

console.log(`\n${failed === 0 ? 'ALL CHECKS PASSED' : `${failed} CHECK(S) FAILED — apply db/migrations/20261015_fix_set_user_permissions.sql`}`);
process.exit(failed === 0 ? 0 : 1);
