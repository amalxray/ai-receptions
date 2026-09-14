import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { requirePlatformAdmin } from '@/lib/services/platformAdmin';
import { logEvent } from '@/lib/server/logging';

/** GET /api/admin/stats — platform statistics for the owner dashboard. */
export async function GET(req: Request) {
  const gate = await requirePlatformAdmin(req);
  if (!gate.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: gate.status });

  const { count: clinicsCount } = await supabaseAdmin
    .from('clinics')
    .select('id', { count: 'exact', head: true })
    .is('deleted_at', null);
  const { count: activeClinicsCount } = await supabaseAdmin
    .from('clinics')
    .select('id', { count: 'exact', head: true })
    .is('deleted_at', null);
  const { count: membersCount } = await supabaseAdmin
    .from('clinic_users')
    .select('id', { count: 'exact', head: true })
    .is('deleted_at', null);
  const { count: subscriptionsCount } = await supabaseAdmin
    .from('subscriptions')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'active')
    .is('deleted_at', null);
  const { data: volume } = await supabaseAdmin
    .from('clinic_payments')
    .select('amount')
    .is('voided_at', null);
  const totalVolume = (volume ?? []).reduce((s, p) => s + Number(p.amount ?? 0), 0);

  // --- chart breakdowns (grouped in JS to avoid extra RPCs) ---
  const { data: clinicTypes } = await supabaseAdmin
    .from('clinics')
    .select('activity_type')
    .is('deleted_at', null);
  const clinicsByType = tally(clinicTypes ?? [], 'activity_type');

  const { data: memberRoles } = await supabaseAdmin
    .from('clinic_users')
    .select('role')
    .is('deleted_at', null);
  const membersByRole = tally(memberRoles ?? [], 'role');

  const { data: subStatuses } = await supabaseAdmin
    .from('subscriptions')
    .select('status')
    .is('deleted_at', null);
  const subscriptionsByStatus = tally(subStatuses ?? [], 'status');

  const { data: recentClinics } = await supabaseAdmin
    .from('clinics')
    .select('id, name, slug, activity_type, created_at')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(6);

  logEvent('admin_stats_viewed', {});
  return NextResponse.json({
    data: {
      clinics: clinicsCount ?? 0,
      active_clinics: activeClinicsCount ?? 0,
      members: membersCount ?? 0,
      active_subscriptions: subscriptionsCount ?? 0,
      payments_volume: totalVolume,
      clinics_by_type: clinicsByType,
      members_by_role: membersByRole,
      subscriptions_by_status: subscriptionsByStatus,
      recent_clinics: recentClinics ?? [],
    },
  });
}

/** Groups rows by a key and returns a descending [{ key, count }] list. */
function tally(rows: Record<string, unknown>[], key: string) {
  const map = new Map<string, number>();
  for (const row of rows) {
    const k = String(row[key] ?? 'غير محدد');
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}