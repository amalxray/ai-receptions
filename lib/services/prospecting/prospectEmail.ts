import {
  buildProspectSalesEmail,
  generateSalesEmail,
} from '@/lib/services/marketing/marketing-agent';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getEmailProvider } from '@/lib/communications/email/provider';
import { getAppBaseUrl } from '@/lib/communications/links';

export const DAILY_EMAIL_LIMIT = 50;
export type ProspectEmailType = 'initial' | 'follow_up_1' | 'follow_up_2' | 'manual';

type ProspectRecord = {
  id: string;
  clinic_name: string;
  doctor_name: string | null;
  email: string | null;
  city: string;
  status: string;
  metadata: unknown;
  unsubscribe_token: string;
  unsubscribed_at: string | null;
};

export type ProspectEmailInput = {
  subject?: string;
  body?: string;
  generateDraft?: boolean;
  preview?: boolean;
};

type EligibleProspect = Pick<ProspectRecord, 'email' | 'unsubscribed_at'>;

export class ProspectEmailError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ProspectEmailError';
    this.status = status;
  }
}

function metadataRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

function isToday(timestamp: unknown, now: Date) {
  if (typeof timestamp !== 'string') return false;
  const value = new Date(timestamp).getTime();
  if (!Number.isFinite(value)) return false;
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return value >= start && value < start + 24 * 60 * 60 * 1000;
}

export async function countDailyEmailSends(now = new Date()): Promise<number> {
  const { data, error } = await supabaseAdmin.from('prospects').select('metadata');
  if (error) throw new ProspectEmailError(500, `تعذر حساب إرساليات اليوم: ${error.message}`);

  return (data ?? []).filter((row) => {
    const metadata = metadataRecord(row.metadata);
    return isToday(metadata.last_emailed_at, now);
  }).length;
}

function defaultSubject(clinicName: string) {
  return `اقتراح لتحسين تواصل ${clinicName} مع المرضى`;
}

function defaultBody(prospect: ProspectRecord) {
  return buildProspectSalesEmail(prospect.clinic_name);
}

function exactIlikePattern(value: string) {
  return value.replace(/[\\%_]/g, '\\$&');
}

export async function canSendEmail(prospect: EligibleProspect): Promise<boolean> {
  const email = prospect.email?.trim();
  if (!email || prospect.unsubscribed_at) return false;

  const { data, error } = await supabaseAdmin
    .from('prospects')
    .select('id')
    .ilike('email', exactIlikePattern(email))
    .not('unsubscribed_at', 'is', null)
    .limit(1)
    .maybeSingle();
  if (error) throw new ProspectEmailError(500, `تعذّر التحقق من حالة إلغاء الاشتراك: ${error.message}`);
  return !data;
}

export async function claimEmailSlot(
  prospectId: string,
  type: ProspectEmailType,
  content: { subject: string; body: string } = { subject: '(pending)', body: '' },
): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from('prospect_emails')
    .insert({
      prospect_id: prospectId,
      type,
      subject: content.subject,
      body: content.body,
      status: 'queued',
    })
    .select('id')
    .single();

  if (error?.code === '23505') return null;
  if (error) throw new ProspectEmailError(500, `تعذّر حجز الإرسال: ${error.message}`);
  if (!data?.id) throw new ProspectEmailError(500, 'تعذّر حجز الإرسال: لم يُرجع سجل الرسالة معرّفاً.');
  return data.id;
}

async function loadProspect(id: string): Promise<ProspectRecord> {
  const { data, error } = await supabaseAdmin
    .from('prospects')
    .select('id, clinic_name, doctor_name, email, city, status, metadata, unsubscribe_token, unsubscribed_at')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new ProspectEmailError(500, `تعذر تحميل العيادة: ${error.message}`);
  if (!data) throw new ProspectEmailError(404, 'العيادة المحتملة غير موجودة.');

  const prospect = data as ProspectRecord;
  if (!prospect.email?.trim()) throw new ProspectEmailError(400, 'لا يوجد بريد إلكتروني لهذه العيادة.');
  if (!(await canSendEmail(prospect))) {
    throw new ProspectEmailError(409, 'تم إلغاء الاشتراك لهذا البريد الإلكتروني، ولن يتم إرسال رسائل إليه.');
  }
  if (prospect.status === 'converted' || prospect.status === 'rejected') {
    throw new ProspectEmailError(400, 'لا يمكن إرسال بريد لعيادة محوّلة أو مرفوضة.');
  }
  return prospect;
}

export async function sendProspectEmail(
  id: string,
  input: ProspectEmailInput,
  options: { useDefaultBody?: boolean; type?: ProspectEmailType } = {},
) {
  const prospect = await loadProspect(id);
  const subject = input.subject?.trim() || defaultSubject(prospect.clinic_name);
  let body = input.body?.trim() || '';

  if (!body && input.generateDraft) {
    body = await generateSalesEmail(
      prospect.clinic_name,
      prospect.doctor_name?.trim() || 'فريق العيادة',
      `العيادة تقع في مدينة ${prospect.city}. اكتب مسودة افتتاحية مخصصة للتواصل الأول.`,
    );
  }
  if (!body && options.useDefaultBody) body = defaultBody(prospect);
  if (!body) throw new ProspectEmailError(400, 'أدخل نص الرسالة أو فعّل توليد المسودة بالذكاء الاصطناعي.');

  if (input.preview) return { id: prospect.id, email: prospect.email, subject, body, preview: true };

  const provider = getEmailProvider();
  if (provider.name !== 'resend') {
    throw new ProspectEmailError(503, 'مزود البريد غير مُعدّ — الإرسال لن يعمل.');
  }

  const dailyCount = await countDailyEmailSends();
  if (dailyCount >= DAILY_EMAIL_LIMIT) {
    throw new ProspectEmailError(429, `تم الوصول إلى الحد اليومي للإرسال (${DAILY_EMAIL_LIMIT}).`);
  }

  const unsubscribeUrl = new URL(
    `/unsubscribe/${encodeURIComponent(prospect.unsubscribe_token)}`,
    getAppBaseUrl(),
  ).toString();
  const unsubscribeLine = `لإلغاء الاشتراك: ${unsubscribeUrl}`;
  const finalBody = body.includes(unsubscribeUrl) ? body : `${body.trim()}\n\n${unsubscribeLine}`;
  const emailType = options.type ?? 'manual';
  const emailId = await claimEmailSlot(prospect.id, emailType, { subject, body: finalBody });
  if (!emailId) {
    throw new ProspectEmailError(409, 'سبق حجز هذا النوع من الرسائل لهذه العيادة.');
  }

  let resendId: string;
  try {
    const result = await provider.send({ to: prospect.email.trim(), subject, text: finalBody });
    if (!result.id) throw new Error('لم يُرجع مزود البريد معرّف الرسالة.');
    resendId = result.id;
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'سبب غير معروف';
    const { error: updateError } = await supabaseAdmin
      .from('prospect_emails')
      .update({ status: 'failed', error: reason })
      .eq('id', emailId);
    if (updateError) {
      throw new ProspectEmailError(500, `فشل الإرسال وتعذّر تسجيل الفشل: ${updateError.message}`);
    }
    throw new ProspectEmailError(500, `فشل إرسال البريد: ${reason}`);
  }

  const sentAt = new Date().toISOString();
  const { error: emailUpdateError } = await supabaseAdmin
    .from('prospect_emails')
    .update({ status: 'sent', sent_at: sentAt, resend_id: resendId })
    .eq('id', emailId);
  if (emailUpdateError) {
    throw new ProspectEmailError(500, `تم الإرسال لكن تعذّر تسجيله في سجل الرسائل: ${emailUpdateError.message}`);
  }

  const metadata = metadataRecord(prospect.metadata);
  const previousEmails = typeof metadata.emails_sent === 'number' ? metadata.emails_sent : 0;
  const { error } = await supabaseAdmin
    .from('prospects')
    .update({
      status: 'contacted',
      metadata: {
        ...metadata,
        last_emailed_at: sentAt,
        emails_sent: previousEmails + 1,
        last_subject: subject,
      },
    })
    .eq('id', prospect.id);
  if (error) throw new ProspectEmailError(500, `تم الإرسال لكن تعذر تحديث بيانات العيادة: ${error.message}`);

  return { id: prospect.id, email: prospect.email, subject, sentAt, resendId };
}
