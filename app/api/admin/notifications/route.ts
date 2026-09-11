import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { requirePlatformAdmin } from '@/lib/services/platformAdmin';
import { logEvent } from '@/lib/server/logging';

const announceSchema = z.object({
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(2000),
  /** Optional clinic ids; when omitted, every active clinic receives it. */
  clinic_ids: z.array(z.string().uuid()).optional(),
});

/** POST /api/admin/notifications — platform announcement to clinics. */
export async function POST(req: Request) {
  const gate = await requirePlatformAdmin(req);
  if (!gate.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: gate.status });

  const body = await req.json().catch(() => null);
  const parsed = announceSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });

  let targets: string[] = [];
  if (parsed.data.clinic_ids && parsed.data.clinic_ids.length > 0) {
    targets = parsed.data.clinic_ids;
  } else {
    const { data: clinics } = await supabaseAdmin
      .from('clinics')
      .select('id')
      .is('deleted_at', null)
      .limit(500);
    targets = (clinics ?? []).map((c) => c.id);
  }

  const rows = targets.map((clinic_id) => ({
    clinic_id,
    channel: 'inapp',
    type: 'platform_announcement',
    payload: { title: parsed.data.title, body: parsed.data.body },
    sent_at: new Date().toISOString(),
  }));

  let error: { message: string } | null = null;
  if (rows.length > 0) {
    const res = await supabaseAdmin.from('notifications').insert(rows);
    error = res.error;
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  logEvent('admin_announcement_sent', { targets: targets.length });
  return NextResponse.json({ data: { sent_to: targets.length } }, { status: 201 });
}