import {
  generateFollowUpEmail1,
  generateFollowUpEmail2,
} from '@/lib/services/marketing/marketing-agent';
import { getAppBaseUrl } from '@/lib/communications/links';
import { supabaseAdmin } from '@/lib/supabase/admin';
import {
  ProspectEmailError,
  sendProspectEmail,
} from '@/lib/services/prospecting/prospectEmail';

export type FollowUpStage = 'stage_1' | 'stage_2';
type FollowUpEmailType = 'follow_up_1' | 'follow_up_2';

type Prospect = {
  id: string;
  clinic_name: string;
  doctor_name: string | null;
  phone: string | null;
  email: string | null;
  city: string;
  country: string;
  status: string;
  metadata: unknown;
  unsubscribed_at: string | null;
};

type ProspectEmail = {
  prospect_id: string;
  type: string;
  status: string;
  sent_at: string | null;
};

export type FollowUpProspect = Pick<
  Prospect,
  'id' | 'clinic_name' | 'doctor_name' | 'phone' | 'email' | 'city' | 'country'
> & {
  stage: FollowUpStage;
  due_at: string;
};

export type PendingFollowUps = {
  stage_1: FollowUpProspect[];
  stage_2: FollowUpProspect[];
};

const DAY_MS = 24 * 60 * 60 * 1000;
const ACTIVE_PROSPECT_STATUSES = new Set(['new', 'contacted']);
const SENT_EMAIL_STATUSES = new Set(['sent', 'delivered', 'opened', 'clicked']);
const PERMANENT_EMAIL_FAILURES = new Set(['bounced', 'complained']);
const PENDING_EMAIL_TYPES = ['initial', 'manual', 'follow_up_1', 'follow_up_2'];

function metadataRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function validTimestamp(value: string | null): number | null {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function isSkipped(metadata: unknown, stage: FollowUpStage): boolean {
  const key = stage === 'stage_1' ? 'follow_up_1_skipped_at' : 'follow_up_2_skipped_at';
  return typeof metadataRecord(metadata)[key] === 'string';
}

function byDueDate(left: FollowUpProspect, right: FollowUpProspect): number {
  return Date.parse(left.due_at) - Date.parse(right.due_at);
}

export async function getPendingFollowUps(now = new Date()): Promise<PendingFollowUps> {
  const [{ data: prospects, error: prospectsError }, { data: emails, error: emailsError }] =
    await Promise.all([
      supabaseAdmin
        .from('prospects')
        .select('id, clinic_name, doctor_name, phone, email, city, country, status, metadata, unsubscribed_at')
        .not('email', 'is', null),
      supabaseAdmin
        .from('prospect_emails')
        .select('prospect_id, type, status, sent_at')
        .in('type', PENDING_EMAIL_TYPES),
    ]);

  if (prospectsError) throw new ProspectEmailError(500, `تعذّر تحميل العيادات للمتابعة: ${prospectsError.message}`);
  if (emailsError) throw new ProspectEmailError(500, `تعذّر تحميل سجل الرسائل: ${emailsError.message}`);

  const prospectRows = (prospects ?? []) as Prospect[];
  const emailRows = (emails ?? []) as ProspectEmail[];
  const unsubscribedEmails = new Set(
    prospectRows
      .filter((prospect) => prospect.unsubscribed_at && prospect.email)
      .map((prospect) => prospect.email?.trim().toLocaleLowerCase())
      .filter((email): email is string => Boolean(email)),
  );
  const emailsByProspect = new Map<string, ProspectEmail[]>();
  for (const email of emailRows) {
    const records = emailsByProspect.get(email.prospect_id) ?? [];
    records.push(email);
    emailsByProspect.set(email.prospect_id, records);
  }

  const result: PendingFollowUps = { stage_1: [], stage_2: [] };
  const nowMs = now.getTime();

  for (const prospect of prospectRows) {
    const emailAddress = prospect.email?.trim();
    if (
      !emailAddress ||
      prospect.unsubscribed_at ||
      unsubscribedEmails.has(emailAddress.toLocaleLowerCase()) ||
      !ACTIVE_PROSPECT_STATUSES.has(prospect.status)
    ) continue;

    const records = emailsByProspect.get(prospect.id) ?? [];
    if (records.some((record) => PERMANENT_EMAIL_FAILURES.has(record.status))) continue;

    const initialMessages = records
      .filter((record) => (
        (record.type === 'initial' || record.type === 'manual') &&
        SENT_EMAIL_STATUSES.has(record.status)
      ))
      .map((record) => ({ record, sentAt: validTimestamp(record.sent_at) }))
      .filter((entry): entry is { record: ProspectEmail; sentAt: number } => entry.sentAt !== null)
      .sort((left, right) => left.sentAt - right.sentAt);
    const lastEmailedAt = metadataRecord(prospect.metadata).last_emailed_at;
    const initialSentAt = initialMessages[0]?.sentAt ??
      validTimestamp(typeof lastEmailedAt === 'string' ? lastEmailedAt : null);
    if (initialSentAt === null) continue;

    const sentFollowUp1 = records.find((record) =>
      record.type === 'follow_up_1' && SENT_EMAIL_STATUSES.has(record.status),
    );
    const followUp1SentAt = sentFollowUp1 ? validTimestamp(sentFollowUp1.sent_at) : null;
    const hasActiveFollowUp1 = records.some((record) =>
      record.type === 'follow_up_1' && record.status !== 'failed',
    );
    const hasActiveFollowUp2 = records.some((record) =>
      record.type === 'follow_up_2' && record.status !== 'failed',
    );

    if (
      nowMs >= initialSentAt + 3 * DAY_MS &&
      !hasActiveFollowUp1 &&
      !isSkipped(prospect.metadata, 'stage_1')
    ) {
      result.stage_1.push({
        id: prospect.id,
        clinic_name: prospect.clinic_name,
        doctor_name: prospect.doctor_name,
        phone: prospect.phone,
        email: emailAddress,
        city: prospect.city,
        country: prospect.country,
        stage: 'stage_1',
        due_at: new Date(initialSentAt + 3 * DAY_MS).toISOString(),
      });
      continue;
    }

    if (
      followUp1SentAt !== null &&
      nowMs >= followUp1SentAt + 7 * DAY_MS &&
      !hasActiveFollowUp2 &&
      !isSkipped(prospect.metadata, 'stage_2')
    ) {
      result.stage_2.push({
        id: prospect.id,
        clinic_name: prospect.clinic_name,
        doctor_name: prospect.doctor_name,
        phone: prospect.phone,
        email: emailAddress,
        city: prospect.city,
        country: prospect.country,
        stage: 'stage_2',
        due_at: new Date(followUp1SentAt + 7 * DAY_MS).toISOString(),
      });
    }
  }

  result.stage_1.sort(byDueDate);
  result.stage_2.sort(byDueDate);
  return result;
}

function emailTypeForStage(stage: FollowUpStage): FollowUpEmailType {
  return stage === 'stage_1' ? 'follow_up_1' : 'follow_up_2';
}

export async function sendFollowUp(
  id: string,
  stage: FollowUpStage,
): Promise<{ success: true } | { success: false; error: string; status: number }> {
  try {
    const pending = await getPendingFollowUps();
    const prospect = pending[stage].find((item) => item.id === id);
    if (!prospect) {
      return {
        success: false,
        error: 'لم تعد هذه العيادة مؤهلة للمتابعة أو سبق التعامل معها.',
        status: 409,
      };
    }

    const { data: row, error } = await supabaseAdmin
      .from('prospects')
      .select('unsubscribe_token')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new ProspectEmailError(500, `تعذّر تحميل رابط إلغاء الاشتراك: ${error.message}`);
    if (!row?.unsubscribe_token) {
      throw new ProspectEmailError(500, 'تعذّر إنشاء رابط إلغاء الاشتراك لهذه العيادة.');
    }

    const unsubscribeUrl = new URL(
      `/unsubscribe/${encodeURIComponent(row.unsubscribe_token)}`,
      getAppBaseUrl(),
    ).toString();
    const body = stage === 'stage_1'
      ? generateFollowUpEmail1(prospect.clinic_name, unsubscribeUrl)
      : generateFollowUpEmail2(prospect.clinic_name, unsubscribeUrl);
    const subject = stage === 'stage_1'
      ? `متابعة بخصوص Dentairec — ${prospect.clinic_name}`
      : `آخر متابعة بخصوص Dentairec — ${prospect.clinic_name}`;

    await sendProspectEmail(
      id,
      { subject, body },
      { type: emailTypeForStage(stage) },
    );
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'تعذّر إرسال رسالة المتابعة.',
      status: error instanceof ProspectEmailError ? error.status : 500,
    };
  }
}

export async function skipFollowUp(
  id: string,
  stage: FollowUpStage,
): Promise<{ success: true } | { success: false; error: string; status: number }> {
  const pending = await getPendingFollowUps();
  if (!pending[stage].some((prospect) => prospect.id === id)) {
    return { success: false, error: 'لم تعد هذه العيادة ضمن قائمة المتابعة.', status: 409 };
  }

  const { data: prospect, error: loadError } = await supabaseAdmin
    .from('prospects')
    .select('metadata')
    .eq('id', id)
    .maybeSingle();
  if (loadError) throw new ProspectEmailError(500, `تعذّر تحميل بيانات المتابعة: ${loadError.message}`);
  if (!prospect) throw new ProspectEmailError(404, 'العيادة المحتملة غير موجودة.');

  const key = stage === 'stage_1' ? 'follow_up_1_skipped_at' : 'follow_up_2_skipped_at';
  const { error } = await supabaseAdmin
    .from('prospects')
    .update({
      metadata: {
        ...metadataRecord(prospect.metadata),
        [key]: new Date().toISOString(),
      },
    })
    .eq('id', id);
  if (error) throw new ProspectEmailError(500, `تعذّر تخطي المتابعة: ${error.message}`);
  return { success: true };
}
