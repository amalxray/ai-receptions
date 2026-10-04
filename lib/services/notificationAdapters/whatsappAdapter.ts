import { getWhatsAppConfig, type WhatsAppConfig } from '@/lib/config/whatsapp';
import { templateForNotificationType, type WhatsAppTemplateName } from '@/lib/constants/whatsappTemplates';

type WhatsAppApiResponse = {
  messages?: Array<{ id?: string }>;
  error?: { message?: string; type?: string; code?: number };
};

export function buildWhatsAppMessagesUrl(phoneId: string, apiVersion = 'v19.0'): string {
  if (!phoneId.trim()) throw new Error('WHATSAPP_PHONE_ID is not configured');
  return `https://graph.facebook.com/${apiVersion}/${encodeURIComponent(phoneId)}/messages`;
}

function normalizeRecipientPhone(phone: string): string {
  const normalized = phone.replace(/[^\d]/g, '');
  if (!/^\d{8,15}$/.test(normalized)) {
    throw new Error('recipientPhone must be a valid international phone number (8–15 digits)');
  }
  return normalized;
}

/**
 * Sends an approved WhatsApp Business template via Meta's Cloud API.
 * Parameters are positional body variables in the same order as the approved template.
 */
export async function sendTemplateMessage(
  recipientPhone: string,
  templateName: WhatsAppTemplateName | string,
  languageCode = 'ar',
  parameters: string[] = [],
  config: WhatsAppConfig = getWhatsAppConfig(),
): Promise<WhatsAppApiResponse> {
  if (!config.accessToken) throw new Error('WHATSAPP_ACCESS_TOKEN is not configured');
  const url = buildWhatsAppMessagesUrl(config.phoneId, config.apiVersion);
  const to = normalizeRecipientPhone(recipientPhone);
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: languageCode },
      ...(parameters.length > 0
        ? {
            components: [{
              type: 'body',
              parameters: parameters.map((text) => ({ type: 'text', text })),
            }],
          }
        : {}),
    },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const result = await response.json().catch(() => ({} as WhatsAppApiResponse));
  if (!response.ok) {
    const reason = result.error?.message || response.statusText || 'Unknown provider error';
    throw new Error(`WhatsApp Cloud API error (${response.status}): ${reason}`);
  }
  return result;
}

/** Loads only clinic-scoped appointment data and sends the matching approved template. */
export async function sendAppointmentTemplateMessage(
  notification: Record<string, unknown>,
  recipientPhone: string,
): Promise<WhatsAppApiResponse> {
  const clinicId = String(notification.clinic_id ?? '');
  const appointmentId = String(notification.appointment_id ?? '');
  const patientId = String(notification.patient_id ?? '');
  if (!clinicId || !appointmentId || !patientId) {
    throw new Error('WhatsApp appointment notification is missing clinic, appointment, or patient identifiers');
  }

  const { supabaseAdmin } = await import('@/lib/supabase/admin');
  const [{ data: appointment, error: appointmentError }, { data: clinic, error: clinicError }] = await Promise.all([
    supabaseAdmin
      .from('appointments')
      .select('appointment_date, scheduled_at')
      .eq('id', appointmentId)
      .eq('clinic_id', clinicId)
      .eq('patient_id', patientId)
      .maybeSingle(),
    supabaseAdmin
      .from('clinics')
      .select('name')
      .eq('id', clinicId)
      .maybeSingle(),
  ]);
  if (appointmentError || !appointment) throw new Error('Unable to resolve appointment for WhatsApp notification');
  if (clinicError || !clinic) throw new Error('Unable to resolve clinic for WhatsApp notification');

  const templateName = templateForNotificationType(String(notification.type ?? 'appointment_reminder'));
  const parameters = templateName === 'appointment_reminder'
    ? [String(clinic.name)]
    : [
        String(clinic.name),
        String(appointment.appointment_date ?? ''),
        appointment.scheduled_at
          ? new Date(String(appointment.scheduled_at)).toISOString().slice(11, 16)
          : '',
      ];

  return sendTemplateMessage(recipientPhone, templateName, 'ar', parameters);
}
