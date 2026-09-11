import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { requirePlatformAdmin } from '@/lib/services/platformAdmin';
import { logEvent } from '@/lib/server/logging';

/** GET /api/admin/clinics — all clinics (list) with owner + member counts. */
export async function GET(req: Request) {
  const gate = await requirePlatformAdmin(req);
  if (!gate.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: gate.status });

  const { data: clinics, error } = await supabaseAdmin
    .from('clinics')
    .select('id, name, slug, activity_type, created_at, deleted_at')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = [];
  for (const clinic of clinics ?? []) {
    const { count: members } = await supabaseAdmin
      .from('clinic_users')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', clinic.id)
      .is('deleted_at', null);
    rows.push({ ...clinic, members: members ?? 0 });
  }

  logEvent('admin_clinics_listed', { count: rows.length });
  return NextResponse.json({ data: { clinics: rows } });
}