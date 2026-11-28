import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePlatformAdmin } from '@/lib/services/platformAdmin';
import {
  ProspectEmailError,
  sendProspectEmail,
} from '@/lib/services/prospecting/prospectEmail';
import {
  ProspectEmailRegenerateError,
  regenerateProspectEmail,
} from '@/lib/services/marketing/marketing-agent';
import { supabaseAdmin } from '@/lib/supabase/admin';

const bodySchema = z.object({
  subject: z.string().trim().max(300).optional(),
  body: z.string().trim().max(20_000).optional(),
  generateDraft: z.boolean().optional().default(false),
  // Used by the UI to populate the editor without sending the generated draft.
  preview: z.boolean().optional().default(false),
});

const regenerateSchema = z.object({
  instructions: z.string().trim().min(1).max(1000),
  currentSubject: z.string().trim().min(1).max(300),
  currentBody: z.string().trim().min(1).max(20_000),
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
    const result = await sendProspectEmail(params.id, parsed.data, { type: 'manual' });
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

export async function PUT(
  req: Request,
  { params }: { params: { id: string } },
) {
  const gate = await requirePlatformAdmin(req);
  if (!gate.ok) {
    return NextResponse.json({ error: 'غير مصرح' }, { status: gate.status });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'يجب إرسال JSON صالح.' }, { status: 400 });
  }

  const parsed = regenerateSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'تعليمات غير صالحة — يجب 1-1000 حرف.' },
      { status: 400 },
    );
  }

  const { data: prospect, error: dbError } = await supabaseAdmin
    .from('prospects')
    .select('clinic_name')
    .eq('id', params.id)
    .maybeSingle();

  if (dbError) {
    console.error('Failed to load prospect for email regeneration:', dbError);
    return NextResponse.json({ error: 'تعذّر تحميل بيانات العيادة.' }, { status: 500 });
  }
  if (!prospect) {
    return NextResponse.json({ error: 'العيادة غير موجودة.' }, { status: 404 });
  }

  try {
    const result = await regenerateProspectEmail({
      clinicName: prospect.clinic_name,
      currentSubject: parsed.data.currentSubject,
      currentBody: parsed.data.currentBody,
      instructions: parsed.data.instructions,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ProspectEmailRegenerateError) {
      console.error('[send-email PUT] regenerate failed:', {
        code: error.code,
        message: error.message,
      });
      const userMessages: Record<string, string> = {
        provider_failed: 'تعذّر الاتصال بمزود الذكاء الاصطناعي — حاول مرة أخرى بعد دقيقة.',
        timeout: 'انتهت مهلة الاتصال بمزود الذكاء الاصطناعي — حاول مرة أخرى.',
        invalid_json: 'استجابة الذكاء الاصطناعي غير صالحة — حاول مرة أخرى.',
        missing_fields: 'استجابة الذكاء الاصطناعي ناقصة — حاول مرة أخرى.',
      };
      return NextResponse.json(
        {
          error: userMessages[error.code] ?? 'تعذّر إعادة توليد الرسالة',
          code: error.code,
        },
        { status: error.code === 'timeout' ? 504 : 502 },
      );
    }
    console.error('[send-email PUT] unexpected error:', error);
    return NextResponse.json(
      { error: 'تعذّر إعادة توليد الرسالة — حاول مرة أخرى.' },
      { status: 500 },
    );
  }
}
