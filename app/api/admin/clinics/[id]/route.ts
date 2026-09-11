import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { requirePlatformAdmin } from '@/lib/services/platformAdmin';
import { logEvent } from '@/lib/server/logging';

const patchSchema = z.object({
  /** true → activate (deleted_at=null); false → soft-disable. */
  deleted: z.boolean().optional(),
});

/** GET /api/admin/clinics/[id] — single clinic detail. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const gate = await requirePlatformAdmin(req);
  if (!gate.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: gate.status });

  const { data: clinic } = await supabaseAdmin
    .from('clinics')
    .select('*')
    .eq('id', params.id)
    .maybeSingle();
  if (!clinic) return NextResponse.json({ error: 'Clinic not found' }, { status: 404 });

  const { data: members } = await supabaseAdmin
    .from('clinic_users')
    .select('id, role, user_id')
    .eq('clinic_id', params.id)
    .is('deleted_at', null);
  const { data: subscription } = await supabaseAdmin
    .from('subscriptions')
    .select('id, plan_id, status, current_period_end')
    .eq('clinic_id', params.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({ data: { clinic, members: members ?? [], subscription } });
}

/** PATCH /api/admin/clinics/[id] — activate / soft-disable a clinic. */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const gate = await requirePlatformAdmin(req);
  if (!gate.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: gate.status });

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body ?? {});
  if (!parsed.success) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });

  const next = parsed.data.deleted === true ? new Date().toISOString() : null;
  const { data, error } = await supabaseAdmin
    .from('clinics')
    .update({ deleted_at: next })
    .eq('id', params.id)
    .select('id, slug, deleted_at')
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  logEvent('admin_clinic_toggled', { clinic_id: params.id, deleted: parsed.data.deleted === true });
  return NextResponse.json({ data });
}