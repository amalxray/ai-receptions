import { generateSalesEmail } from '@/lib/services/marketing/marketing-agent';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getEmailProvider } from '@/lib/communications/email/provider';

export const DAILY_EMAIL_LIMIT = 50;

type ProspectRecord = {
  id: string;
  clinic_name: string;
  doctor_name: string | null;
  email: string | null;
  city: string;
  status: string;
  metadata: unknown;
};

export type ProspectEmailInput = {
  subject?: string;
  body?: string;
  generateDraft?: boolean;
  preview?: boolean;
};

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
  return `مرحباً،

نتواصل معكم بخصوص ${prospect.clinic_name} في ${prospect.city}. نود تعريفكم بـ Dentairec، موظفة استقبال رقمية تساعد العيادات على متابعة اتصالات المرضى والحجوزات على مدار الساعة.

إذا كان ذلك مناسباً، يسعدنا ترتيب عرض مختصر للتعرّف على احتياجاتكم.

مع التحية`;
}

async function loadProspect(id: string): Promise<ProspectRecord> {
  const { data, error } = await supabaseAdmin
    .from('prospects')
    .select('id, clinic_name, doctor_name, email, city, status, metadata')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new ProspectEmailError(500, `تعذر تحميل العيادة: ${error.message}`);
  if (!data) throw new ProspectEmailError(404, 'العيادة المحتملة غير موجودة.');

  const prospect = data as ProspectRecord;
  if (!prospect.email?.trim()) throw new ProspectEmailError(400, 'لا يوجد بريد إلكتروني لهذه العيادة.');
  if (prospect.status === 'converted' || prospect.status === 'rejected') {
    throw new ProspectEmailError(400, 'لا يمكن إرسال بريد لعيادة محوّلة أو مرفوضة.');
  }
  return prospect;
}

export async function sendProspectEmail(
  id: string,
  input: ProspectEmailInput,
  options: { useDefaultBody?: boolean } = {},
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

  const dailyCount = await countDailyEmailSends();
  if (dailyCount >= DAILY_EMAIL_LIMIT) {
    throw new ProspectEmailError(429, `تم الوصول إلى الحد اليومي للإرسال (${DAILY_EMAIL_LIMIT}).`);
  }

  try {
    await getEmailProvider().send({ to: prospect.email.trim(), subject, text: body });
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'سبب غير معروف';
    throw new ProspectEmailError(500, `فشل إرسال البريد: ${reason}`);
  }

  const metadata = metadataRecord(prospect.metadata);
  const previousEmails = typeof metadata.emails_sent === 'number' ? metadata.emails_sent : 0;
  const sentAt = new Date().toISOString();
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

  return { id: prospect.id, email: prospect.email, subject, sentAt };
}
