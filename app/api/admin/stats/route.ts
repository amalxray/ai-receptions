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

  logEvent('admin_stats_viewed', {});
  return NextResponse.json({
    data: {
      clinics: clinicsCount ?? 0,
      active_clinics: activeClinicsCount ?? 0,
      members: membersCount ?? 0,
      active_subscriptions: subscriptionsCount ?? 0,
      payments_volume: totalVolume,
    },
  });
}