import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { requirePlatformAdmin } from '@/lib/services/platformAdmin';
import { logEvent } from '@/lib/server/logging';

/** GET /api/admin/users — platform users (auth accounts) + membership counts. */
export async function GET(req: Request) {
  const gate = await requirePlatformAdmin(req);
  if (!gate.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: gate.status });

  const { data: authUsers, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
  const users = [];
  for (const u of authUsers?.users ?? []) {
    const { count } = await supabaseAdmin
      .from('clinic_users')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', u.id)
      .is('deleted_at', null);
    users.push({ id: u.id, email: u.email, created_at: u.created_at, memberships: count ?? 0 });
  }

  const { data: platform } = await supabaseAdmin
    .from('platform_admins')
    .select('user_id, email, role');
  const platformIds = new Set((platform ?? []).map((p) => p.user_id));
  for (const u of users) u.is_platform_admin = platformIds.has(u.id);

  if (error) return NextResponse.json({ error: error.message ?? 'Failed to list users' }, { status: 500 });
  logEvent('admin_users_listed', { count: users.length });
  return NextResponse.json({ data: { users } });
}