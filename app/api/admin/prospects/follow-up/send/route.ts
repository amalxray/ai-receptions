import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePlatformAdmin } from '@/lib/services/platformAdmin';
import {
  sendFollowUp,
  skipFollowUp,
} from '@/lib/services/prospecting/followUp';
import { ProspectEmailError } from '@/lib/services/prospecting/prospectEmail';

const requestSchema = z.object({
  id: z.string().uuid(),
  stage: z.enum(['stage_1', 'stage_2']),
  action: z.enum(['send', 'skip']).default('send'),
});

export async function POST(req: Request) {
  const gate = await requirePlatformAdmin(req);
  if (!gate.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: gate.status });

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'يجب إرسال JSON صالح.' }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: 'بيانات المتابعة غير صالحة.' }, { status: 400 });
  }

  try {
    const result = parsed.data.action === 'skip'
      ? await skipFollowUp(parsed.data.id, parsed.data.stage)
      : await sendFollowUp(parsed.data.id, parsed.data.stage);
    if (result.success === false) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    const status = error instanceof ProspectEmailError ? error.status : 500;
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'تعذّر تنفيذ إجراء المتابعة.',
    }, { status });
  }
}
