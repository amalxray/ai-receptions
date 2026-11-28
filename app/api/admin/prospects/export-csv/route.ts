import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePlatformAdmin } from '@/lib/services/platformAdmin';
import { buildProspectBackupCsv } from '@/lib/services/prospecting/exportBackup';

const bodySchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
});

export async function POST(req: Request) {
  const gate = await requirePlatformAdmin(req);
  if (!gate.ok) {
    return NextResponse.json({ error: 'غير مصرح لك بتصدير بيانات العيادات.' }, { status: gate.status });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'يجب إرسال JSON صالح.' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'يجب إرسال قائمة من 1 إلى 200 معرّف عيادة صالح.' },
      { status: 400 },
    );
  }

  const ids = parsed.data.ids.filter((id, index, values) => values.indexOf(id) === index);
  try {
    const { csv } = await buildProspectBackupCsv(ids);
    const timestamp = new Date().toISOString()
      .replace('T', '-')
      .replace(/:/g, '')
      .replace(/\.\d{3}Z$/, '');

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="prospects-backup-${timestamp}.csv"`,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('Failed to generate prospect backup:', error);
    return NextResponse.json({ error: 'تعذّر إنشاء النسخة الاحتياطية.' }, { status: 500 });
  }
}
