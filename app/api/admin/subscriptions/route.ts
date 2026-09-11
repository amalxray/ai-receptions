import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { requirePlatformAdmin } from '@/lib/services/platformAdmin';
import { logEvent } from '@/lib/server/logging';

const extendSchema = z.object({
  subscription_id: z.string().uuid(),
  months: z.number().int().min(1).max(36),
});

/** GET /api/admin/subscriptions — all subscriptions joined to clinic/plan. */
export async function GET(req: Request) {
  const gate = await requirePlatformAdmin(req);
  if (!gate.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: gate.status });

  const { data, error } = await supabaseAdmin
    .from('subscriptions')
    .select('id, clinic_id, plan_id, status, billing_status, current_period_end, cancel_at_period_end, created_at, deleted_at')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // enrich clinic names
  const rows = [];
  for (const sub of data ?? []) {
    const { data: clinic } = await supabaseAdmin
      .from('clinics')
      .select('name, slug')
      .eq('id', sub.clinic_id)
      .maybeSingle();
    rows.push({ ...sub, clinic_name: clinic?.name ?? '—', clinic_slug: clinic?.slug });
  }
  logEvent('admin_subscriptions_listed', { count: rows.length });
  return NextResponse.json({ data: { subscriptions: rows } });
}

/** POST /api/admin/subscriptions — manual extension (billing action). */
export async function POST(req: Request) {
  const gate = await requirePlatformAdmin(req);
  if (!gate.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: gate.status });

  const body = await req.json().catch(() => null);
  const parsed = extendSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  const { subscription_id, months } = parsed.data;

  const { data: existing } = await supabaseAdmin
    .from('subscriptions')
    .select('id, current_period_end')
    .eq('id', subscription_id)
    .maybeSingle();
  if (!existing) return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });

  const base = existing.current_period_end ? new Date(existing.current_period_end) : new Date();
  const nextEnd = new Date(base.setDate(base.getDate() + Math.round(months * 30.4))).toISOString();

  const { data, error } = await supabaseAdmin
    .from('subscriptions')
    .update({ current_period_end: nextEnd, status: 'active', cancel_at_period_end: false })
    .eq('id', subscription_id)
    .select('id, current_period_end, status')
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  logEvent('admin_subscription_extended', { subscription_id, months });
  return NextResponse.json({ data });
}