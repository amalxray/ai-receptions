import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePlatformAdmin } from '@/lib/services/platformAdmin';
import {
  ProspectEmailError,
  sendProspectEmail,
} from '@/lib/services/prospecting/prospectEmail';

const bodySchema = z.object({
  subject: z.string().trim().max(300).optional(),
  body: z.string().trim().max(20_000).optional(),
  generateDraft: z.boolean().optional().default(false),
  // Used by the UI to populate the editor without sending the generated draft.
  preview: z.boolean().optional().default(false),
});

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const gate = await requirePlatformAdmin(req);
  if (!gate.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: gate.status });

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'يجب إرسال JSON صالح.' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: 'بيانات الرسالة غير صالحة.', details: parsed.error.issues }, { status: 400 });
  }

  try {
    const result = await sendProspectEmail(params.id, parsed.data);
    if (result.preview) return NextResponse.json({ draft: { subject: result.subject, body: result.body } });
    return NextResponse.json({ data: result });
  } catch (error) {
    if (error instanceof ProspectEmailError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'فشل إرسال البريد.' },
      { status: 500 },
    );
  }
}
