/**
 * LIVE verification of migration 20261017_invitation_security.sql.
 *
 * Runs with the service-role key ONLY, so it still works when the Supabase
 * Management API token is expired/revoked:
 *   - schema facts come from PostgREST (queryability + the OpenAPI default);
 *   - policies are proven behaviourally — each SECURITY DEFINER function is
 *     called and must raise its own error code, `anon`/`authenticated` must be
 *     refused, and the single-use CHECK constraint must reject bad rows;
 *   - every row/user created for a test is deleted again before exit.
 *
 * Usage: node scripts/verify-invitation-security.mjs
 *        (also imported by scripts/apply-invitation-security.mjs as fallback)
 * Exit code: 0 when every check passes.
 */
import fs from 'fs';

const ROOT = process.cwd();

function readEnv() {
  const fromProcess = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };
  if (!fs.existsSync(`${ROOT}/.env.local`)) return fromProcess;
  const c = fs.readFileSync(`${ROOT}/.env.local`, 'utf8');
  const get = (k) => {
    const line = c.split('\n').find((l) => l.startsWith(k + '='));
    return line ? line.slice(k.length + 1).trim().replace(/^["']|["']$/g, '') : '';
  };
  return {
    url: get('NEXT_PUBLIC_SUPABASE_URL') || fromProcess.url,
    serviceKey: get('SUPABASE_SERVICE_ROLE_KEY') || fromProcess.serviceKey,
    anonKey: get('NEXT_PUBLIC_SUPABASE_ANON_KEY') || fromProcess.anonKey,
  };
}

const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

export async function run(opts = {}) {
  const { url, serviceKey, anonKey } = { ...readEnv(), ...opts };
  if (!url || !serviceKey) {
    console.log('BLOCKED — NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing');
    return 1;
  }

  const short = (body) => JSON.stringify(body ?? null).slice(0, 170);

  async function req(path, { key = serviceKey, method = 'GET', body, prefer } = {}) {
    const res = await fetch(`${url}${path}`, {
      method,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        ...(prefer ? { Prefer: prefer } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await res.text();
    let parsed = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    return { status: res.status, ok: res.ok, body: parsed };
  }

  async function rpc(name, body, key = serviceKey) {
    const r = await req(`/rest/v1/rpc/${name}`, { key, method: 'POST', body });
    return { ...r, code: r.body?.code, message: r.body?.message || '' };
  }

  // A token that cannot exist — proves the functions are reachable and validating.
  const MISSING_TOKEN = `verify-missing-${Date.now()}`;
  // An existing clinic satisfies the invitations FK in the DML checks.
  const clinics = await req('/rest/v1/clinics?select=id&limit=1');
  const clinicId = Array.isArray(clinics.body) && clinics.body[0] ? clinics.body[0].id : ZERO_UUID;
  const testToken = `verify-single-use-${Date.now()}`;
  const testRow = {
    clinic_id: clinicId,
    invited_email: 'verify-single-use@example.com',
    role: 'staff',
    token: testToken,
  };
  const cleanupTestRow = () =>
    req(`/rest/v1/invitations?token=eq.${encodeURIComponent(testToken)}`, { method: 'DELETE' });

  const selectable = (col) => async () => {
    const r = await req(`/rest/v1/invitations?select=${col}&limit=1`);
    return { ok: r.ok, detail: `${r.status}${r.ok ? '' : ` ${short(r.body)}`}` };
  };

  const checks = [
    ['invitations.opened_at column', selectable('opened_at')],
    ['invitations.session_expires_at column', selectable('session_expires_at')],
    ['invitations.accept_count column', selectable('accept_count')],
    ['invitations.extend_count column', selectable('extend_count')],
    ['expires_at default is 24 hours', async () => {
      const r = await req('/rest/v1/');
      const def = r.body?.definitions?.invitations?.properties?.expires_at?.default ?? '';
      return { ok: typeof def === 'string' && def.includes('24'), detail: def || '(no default found)' };
    }],
    ['open_invitation(text) callable + raises INVITATION_NOT_FOUND', async () => {
      const r = await rpc('open_invitation', { p_token: MISSING_TOKEN });
      return {
        ok: r.status === 400 && r.message === 'INVITATION_NOT_FOUND',
        detail: `${r.status} ${r.code || ''} ${r.message}`,
      };
    }],
    ['accept_invitation(text, uuid) callable + raises INVITATION_NOT_FOUND', async () => {
      const r = await rpc('accept_invitation', { p_token: MISSING_TOKEN, p_user_id: ZERO_UUID });
      return {
        ok: r.status === 400 && r.message === 'INVITATION_NOT_FOUND',
        detail: `${r.status} ${r.code || ''} ${r.message}`,
      };
    }],
    ['extend_invitation(5 args) enforces actor authorization', async () => {
      const existing = await req('/rest/v1/invitations?select=id,clinic_id&limit=1');
      const row = Array.isArray(existing.body) && existing.body[0] ? existing.body[0] : null;
      const r = await rpc('extend_invitation', {
        p_actor_user_id: ZERO_UUID,
        p_clinic_id: row ? row.clinic_id : clinicId,
        p_invitation_id: row ? row.id : ZERO_UUID,
        p_hours: 24,
        p_max_extends: 3,
      });
      return {
        ok: r.status === 400 && (r.message === 'Unauthorized' || r.message === 'INVITATION_NOT_FOUND'),
        detail: `${r.status} ${r.code || ''} ${r.message}${row ? '' : ' (no invitation row to target)'}`,
      };
    }],
    ['expire_stale_invitations() returns a sweep count', async () => {
      const r = await rpc('expire_stale_invitations', {});
      return { ok: r.ok && typeof r.body === 'number', detail: `${r.status} swept=${short(r.body)}` };
    }],
    ['single-use CHECK rejects status=accepted with accept_count=0', async () => {
      const r = await req('/rest/v1/invitations', {
        method: 'POST',
        body: { ...testRow, status: 'accepted', accept_count: 0 },
      });
      if (r.ok) await cleanupTestRow();
      return {
        ok: !r.ok && String(r.body?.code) === '23514',
        detail: `${r.status} ${r.body?.code || ''} ${r.body?.message || ''}`,
      };
    }],
    ['single-use CHECK rejects status=pending with accept_count>=1', async () => {
      const r = await req('/rest/v1/invitations', {
        method: 'POST',
        body: { ...testRow, status: 'pending', accept_count: 1 },
      });
      if (r.ok) await cleanupTestRow();
      return {
        ok: !r.ok && String(r.body?.code) === '23514',
        detail: `${r.status} ${r.body?.code || ''} ${r.body?.message || ''}`,
      };
    }],
    ['anon CANNOT execute open_invitation', async () => {
      const r = await rpc('open_invitation', { p_token: MISSING_TOKEN }, anonKey);
      const denied =
        !r.ok &&
        (r.status === 401 || r.status === 403) &&
        (String(r.code) === '42501' || /permission denied/i.test(r.message));
      return { ok: denied, detail: `${r.status} ${r.code || ''} ${r.message}` };
    }],
    ['anon CANNOT execute accept_invitation', async () => {
      const r = await rpc('accept_invitation', { p_token: MISSING_TOKEN, p_user_id: ZERO_UUID }, anonKey);
      const denied =
        !r.ok &&
        (r.status === 401 || r.status === 403) &&
        (String(r.code) === '42501' || /permission denied/i.test(r.message));
      return { ok: denied, detail: `${r.status} ${r.code || ''} ${r.message}` };
    }],
    ['authenticated CANNOT execute accept_invitation', async () => {
      const email = `verify-role-${Date.now()}@example.com`;
      const password = `V3rify-${Date.now().toString(36)}!aA`;
      const created = await req('/auth/v1/admin/users', {
        method: 'POST',
        body: { email, password, email_confirm: true },
      });
      const uid = created.body?.id;
      try {
        const signIn = await fetch(`${url}/auth/v1/token?grant_type=password`, {
          method: 'POST',
          headers: { apikey: anonKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        const session = await signIn.json().catch(() => null);
        const jwt = session?.access_token;
        if (!jwt) {
          return { ok: false, detail: `could not mint an authenticated JWT: ${signIn.status} ${short(session)}` };
        }
        const res = await fetch(`${url}/rest/v1/rpc/accept_invitation`, {
          method: 'POST',
          headers: { apikey: anonKey, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ p_token: MISSING_TOKEN, p_user_id: uid || ZERO_UUID }),
        });
        const text = await res.text();
        let body = null;
        try {
          body = text ? JSON.parse(text) : null;
        } catch {
          body = text;
        }
        const denied =
          !res.ok &&
          (res.status === 401 || res.status === 403) &&
          (String(body?.code) === '42501' || /permission denied/i.test(body?.message || ''));
        return { ok: denied, detail: `${res.status} ${body?.code || ''} ${body?.message || ''}` };
      } finally {
        if (uid) await req(`/auth/v1/admin/users/${uid}`, { method: 'DELETE' });
      }
    }],
    ['backfill: no accepted invitation with accept_count = 0', async () => {
      const r = await req('/rest/v1/invitations?select=id&status=eq.accepted&accept_count=eq.0&limit=5');
      const rows = Array.isArray(r.body) ? r.body : null;
      return {
        ok: r.ok && rows?.length === 0,
        detail: r.ok ? `offending rows: ${rows.length}` : `${r.status} ${short(r.body)}`,
      };
    }],
    ['no duplicate pending tokens', async () => {
      const r = await req('/rest/v1/invitations?select=token&status=eq.pending&limit=1000');
      const rows = Array.isArray(r.body) ? r.body : [];
      const seen = new Map();
      for (const row of rows) seen.set(row.token, (seen.get(row.token) || 0) + 1);
      const dupes = [...seen.entries()].filter(([, n]) => n > 1);
      return { ok: r.ok && dupes.length === 0, detail: `${rows.length} pending rows, ${dupes.length} duplicated` };
    }],
  ];

  console.log(`channel: postgrest (service-role) | project: ${url.replace(/^https:\/\//, '')}`);
  let failed = 0;
  for (const [name, fn] of checks) {
    try {
      const { ok, detail } = await fn();
      console.log(`${ok ? 'PASS' : 'FAIL'} | ${name} | ${detail}`);
      if (!ok) failed += 1;
    } catch (e) {
      console.log(`FAIL | ${name} | ${e instanceof Error ? e.message : String(e)}`);
      failed += 1;
    }
  }
  console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
  return failed;
}

const isMain = process.argv[1]?.endsWith('verify-invitation-security.mjs');
if (isMain) {
  process.exit((await run()) ? 1 : 0);
}
