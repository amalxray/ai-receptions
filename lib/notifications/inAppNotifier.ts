import { supabaseAdmin } from '@/lib/supabase/admin';
import { logEvent } from '@/lib/server/logging';
import type { ReferralNotificationEvent } from '@/lib/services/referralWorkflow';

/**
 * In-app events the platform can raise.
 *
 * `referral_*` (B20) are the cross-tenant referral events: submitted (clinic →
 * imaging center), accepted / rejected / needs_clarification (the answer coming
 * back) and result_ready (the study delivered to the referring clinic). The
 * event NAME lives in `ReferralNotificationEvent` so the referral routes, the
 * bell and the tests share one union instead of drifting literals.
 */
export type InAppNotificationEvent =
  | 'appointment_new'
  | 'appointment_cancelled'
  | 'appointment_rescheduled'
  | 'message_new'
  | 'payment_received'
  | 'system'
  | ReferralNotificationEvent;


export interface CreateInAppNotificationParams {
  clinicId: string;
  userId?: string | null;
  patientId?: string | null;
  appointmentId?: string | null;
  event: InAppNotificationEvent;
  title: string;
  body: string;
  link?: string | null;
}

/**
 * Creates an in-app notification row in the real notifications table (channel='inapp').
 * Fail-safe: will log warning on failure and never crash the caller.
 */
export async function createInAppNotification(params: CreateInAppNotificationParams) {
  try {
    const { clinicId, userId, patientId, appointmentId, event, title, body, link } = params;
    if (!clinicId) return null;

    const payload = {
      title,
      body,
      event,
      link: link || null,
    };

    const { data, error } = await supabaseAdmin
      .from('notifications')
      .insert({
        clinic_id: clinicId,
        user_id: userId || null,
        patient_id: patientId || null,
        appointment_id: appointmentId || null,
        channel: 'inapp',
        type: 'system',
        status: 'unread',
        payload,
      })
      .select('id, clinic_id, channel, status, payload, created_at')
      .single();

    if (error) {
      logEvent('inapp_notification_insert_error', { clinicId, event, error: error.message }, 'warn');
      return null;
    }

    logEvent('inapp_notification_created', { clinicId, event, notificationId: data.id });
    return data;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logEvent('inapp_notification_dispatch_exception', { error: message }, 'warn');
    return null;
  }
}
