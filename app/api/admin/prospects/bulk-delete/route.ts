import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePlatformAdmin } from '@/lib/services/platformAdmin';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { buildProspectBackupCsv } from '@/lib/services/prospecting/exportBackup';

const bodySchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
});

export async function POST(req: Request) {
  const gate = await requirePlatformAdmin(req);
  if (!gate.ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: gate.status });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'يجب إرسال قائمة من 1 إلى 200 معرّف عيادة صالح.' },
      { status: 400 },
    );
  }

  const ids = parsed.data.ids.filter((id, index, values) => values.indexOf(id) === index);
  let emailCount: number;
  try {
    ({ emailCount } = await buildProspectBackupCsv(ids));
  } catch (error) {
    console.error('Failed to create prospect backup before deletion:', error);
    return NextResponse.json(
      { error: 'تعذّر إنشاء النسخة الاحتياطية — لم يُنفَّذ الحذف.' },
      { status: 500 },
    );
  }

  const { data, error } = await supabaseAdmin
    .from('prospects')
    .delete()
    .in('id', ids)
    .select('id');

  if (error) {
    console.error('Failed to delete selected prospects:', error);
    return NextResponse.json({ error: 'تعذّر حذف العيادات المحددة.' }, { status: 500 });
  }

  return NextResponse.json({
    deleted: data?.length ?? 0,
    emails_deleted: emailCount,
    deleted_at: new Date().toISOString(),
  });
}
