import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePlatformAdmin } from '@/lib/services/platformAdmin';
import {
  ProspectEmailError,
  sendProspectEmail,
} from '@/lib/services/prospecting/prospectEmail';

const requestSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(50),
  generateDraft: z.boolean().optional().default(false),
});

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

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
    return NextResponse.json({ error: 'يجب إرسال من 1 إلى 50 معرّفاً صالحاً.' }, { status: 400 });
  }

  const results: Array<{ id: string; ok: boolean; error?: string }> = [];
  for (let index = 0; index < parsed.data.ids.length; index += 1) {
    const id = parsed.data.ids[index];
    try {
      await sendProspectEmail(
        id,
        { generateDraft: parsed.data.generateDraft },
        { useDefaultBody: true, type: 'initial' },
      );
      results.push({ id, ok: true });
    } catch (error) {
      const message = error instanceof ProspectEmailError
        ? error.message
        : error instanceof Error ? error.message : 'فشل إرسال البريد.';
      results.push({ id, ok: false, error: message });

      if (error instanceof ProspectEmailError && error.status === 429) {
        for (let remaining = index + 1; remaining < parsed.data.ids.length; remaining += 1) {
          results.push({
            id: parsed.data.ids[remaining],
            ok: false,
            error: 'توقف الإرسال بعد الوصول إلى الحد اليومي.',
          });
        }
        break;
      }
    }

    if (index < parsed.data.ids.length - 1) await delay(1_000);
  }

  return NextResponse.json({
    sent: results.filter((result) => result.ok).length,
    failed: results.filter((result) => !result.ok).length,
    results,
  });
}
