import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeClinicRequest } from '@/lib/services/clinicAuthorization';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { logEvent } from '@/lib/server/logging';
import {
  NOTIFICATION_TEMPLATE_TYPES,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_LANGUAGES,
} from '@/lib/notification/templateContract';

const templateUpdateSchema = z.object({
  template_type: z.enum(NOTIFICATION_TEMPLATE_TYPES).optional(),
  channel: z.enum(NOTIFICATION_CHANNELS).optional(),
  language: z.enum(NOTIFICATION_LANGUAGES).optional(),
  subject: z.string().max(200).optional().nullable(),
  body: z.string().max(5000).optional().nullable(),
});

export async function PUT(req: Request) {
  try {
    const { pathname, searchParams } = new URL(req.url);
    const templateId = pathname.split('/').filter(Boolean).pop();
    const clinicId = searchParams.get('clinic_id');
    if (!templateId) return NextResponse.json({ error: 'template_id is required' }, { status: 400 });
    if (!clinicId) return NextResponse.json({ error: 'clinic_id is required' }, { status: 400 });

    const authorization = await authorizeClinicRequest(req, clinicId);
    if (!authorization.authorized) return NextResponse.json({ error: 'Unauthorized' }, { status: authorization.status });

    const body = await req.json();
    const parsed = templateUpdateSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Invalid payload', details: parsed.error.errors }, { status: 400 });

    const update: Record<string, any> = {};
    if (parsed.data.template_type !== undefined) update.template_type = parsed.data.template_type;
    if (parsed.data.channel !== undefined) update.channel = parsed.data.channel;
    if (parsed.data.language !== undefined) update.language = parsed.data.language;
    if (parsed.data.subject !== undefined) update.subject = parsed.data.subject;
    if (parsed.data.body !== undefined) update.body = parsed.data.body;

    const { data, error } = await supabaseAdmin
      .from('clinic_notification_templates')
      .update(update)
      .eq('id', templateId)
      .eq('clinic_id', clinicId)
      .select()
      .single();

    if (error) throw error;
    logEvent('clinic_notification_template_updated', { clinic_id: clinicId, template_id: templateId });
    return NextResponse.json({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logEvent('clinic_notification_templates_put_error', { error: message }, 'error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { pathname, searchParams } = new URL(req.url);
    const templateId = pathname.split('/').filter(Boolean).pop();
    const clinicId = searchParams.get('clinic_id');
    if (!templateId) return NextResponse.json({ error: 'template_id is required' }, { status: 400 });
    if (!clinicId) return NextResponse.json({ error: 'clinic_id is required' }, { status: 400 });

    const authorization = await authorizeClinicRequest(req, clinicId);
    if (!authorization.authorized) return NextResponse.json({ error: 'Unauthorized' }, { status: authorization.status });

    const { error } = await supabaseAdmin
      .from('clinic_notification_templates')
      .delete()
      .eq('id', templateId)
      .eq('clinic_id', clinicId);

    if (error) throw error;
    logEvent('clinic_notification_template_deleted', { clinic_id: clinicId, template_id: templateId });
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logEvent('clinic_notification_templates_delete_error', { error: message }, 'error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
