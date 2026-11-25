import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePlatformAdmin } from '@/lib/services/platformAdmin';
import { supabaseAdmin } from '@/lib/supabase/admin';

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
  const { data, error } = await supabaseAdmin
    .from('prospects')
    .update({ status: 'archived' })
    .in('id', ids)
    .select('id');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ deleted: data?.length ?? 0 });
}
