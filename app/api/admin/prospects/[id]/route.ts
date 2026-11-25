import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePlatformAdmin } from '@/lib/services/platformAdmin';
import { supabaseAdmin } from '@/lib/supabase/admin';

const paramsSchema = z.string().uuid();
const bodySchema = z.object({
  action: z.enum(['opened', 'replied', 'no_reply', 'rejected']),
});

type ProspectMetadata = Record<string, unknown>;

function metadataRecord(value: unknown): ProspectMetadata {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  return { ...(value as ProspectMetadata) };
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  const gate = await requirePlatformAdmin(req);
  if (!gate.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: gate.status });

  const id = paramsSchema.safeParse(params.id);
  if (!id.success) return NextResponse.json({ error: 'معرّف العيادة غير صالح.' }, { status: 400 });

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'يجب إرسال JSON صالح.' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: 'إجراء التواصل غير صالح.' }, { status: 400 });
  }

  const { data: prospect, error: loadError } = await supabaseAdmin
    .from('prospects')
    .select('id, status, metadata')
    .eq('id', id.data)
    .maybeSingle();
  if (loadError) {
    return NextResponse.json({ error: loadError.message }, { status: 500 });
  }
  if (!prospect) {
    return NextResponse.json({ error: 'العيادة المحتملة غير موجودة.' }, { status: 404 });
  }

  const metadata = metadataRecord(prospect.metadata);
  let status = prospect.status;
  const now = new Date().toISOString();

  switch (parsed.data.action) {
    case 'opened': {
      const previousCount = metadata.whatsapp_sent;
      const count = typeof previousCount === 'number' && Number.isFinite(previousCount) && previousCount > 0
        ? Math.floor(previousCount)
        : 0;
      metadata.last_whatsapp_at = now;
      metadata.whatsapp_sent = count + 1;
      if (status === 'new') status = 'contacted';
      break;
    }
    case 'replied':
      status = 'replied';
      break;
    case 'no_reply':
      metadata.last_whatsapp_no_reply = now;
      break;
    case 'rejected':
      status = 'rejected';
      break;
  }

  const { data, error } = await supabaseAdmin
    .from('prospects')
    .update({ metadata, status })
    .eq('id', id.data)
    .select('id, status, metadata')
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}
