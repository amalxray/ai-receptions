// ============================================================================
// seed-platform-admin.mjs — idempotent platform admin bootstrap (P2)
// ----------------------------------------------------------------------------
// 1. Finds (or creates) the auth user for the platform owner email.
// 2. Upserts the `platform_admins` row with role=owner.
//
// Usage (password passed via env — NEVER committed):
//   SEED_ADMIN_PASSWORD='...' node scripts/seed-platform-admin.mjs
//
// Requires .env.local with NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
// ============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '../.env.local');

const env = {};
for (const raw of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const line = raw.trim();
  const eq = line.indexOf('=');
  if (line && eq > 0 && !line.startsWith('#')) {
    env[line.slice(0, eq)] = line.slice(eq + 1);
  }
}

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, '');
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_EMAIL = 'shadi_nouri78@hotmail.com';
const ADMIN_ROLE = 'owner';

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

async function findAuthUser() {
  // GoTrue admin list is paginated; scan until empty.
  let page = 1;
  const perPage = 200;
  while (page < 50) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?page=${page}&per_page=${perPage}`, {
      headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
    });
    if (!res.ok) throw new Error(`auth list HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const body = await res.json();
    const users = body.users ?? [];
    const hit = users.find((u) => (u.email ?? '').toLowerCase() === ADMIN_EMAIL);
    if (hit) return hit;
    if (users.length < perPage) break;
    page += 1;
  }
  return null;
}

async function main() {
  let user = await findAuthUser();

  if (!user) {
    const password = process.env.SEED_ADMIN_PASSWORD;
    if (!password) {
      console.error('Admin user missing and SEED_ADMIN_PASSWORD not set — nothing created.');
      process.exit(1);
    }
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: ADMIN_EMAIL,
        password,
        email_confirm: true,
        user_metadata: { full_name: 'Platform Owner', platform_admin: true },
      }),
    });
    if (!res.ok) throw new Error(`auth create HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    user = await res.json();
    console.log(`auth user created: ${user.email} (${user.id})`);
  } else {
    console.log(`auth user already exists: ${user.email} (${user.id})`);
  }

  // Upsert via the REST layer (service role) — same path the admin APIs use.
  const upsert = await fetch(`${SUPABASE_URL}/rest/v1/platform_admins?on_conflict=user_id`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SERVICE_KEY}`,
      apikey: SERVICE_KEY,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify({ user_id: user.id, email: ADMIN_EMAIL, role: ADMIN_ROLE }),
  });
  if (!upsert.ok) throw new Error(`upsert platform_admins HTTP ${upsert.status}: ${(await upsert.text()).slice(0, 300)}`);
  const rows = await upsert.json();
  const data = Array.isArray(rows) ? rows[0] : rows;
  console.log(`platform_admin ready: ${data.email} | role=${data.role} | id=${data.id}`);
}

main().catch((err) => {
  console.error('SEED FAILED:', err.message);
  process.exit(1);
});