import { supabaseAdmin } from '@/lib/supabase/admin';
import { logEvent } from '@/lib/server/logging';
import { tenantDashboardUrl } from '@/lib/services/dashboardPaths';
import {
  buildReferralNotification,
  type ReferralNotificationEvent,
} from '@/lib/services/referralWorkflow';
import { createInAppNotification } from './inAppNotifier';

/**
 * REFERRAL NOTIFICATIONS (B20) — one fail-safe writer for the whole referral
 * lifecycle.
 *
 * Every referral route calls THIS instead of inserting into `notifications`
 * directly, so the bell/toast wording, the deep link and the recipient
 * resolution stay in one place:
 *   * recipient = the OTHER side of the referral, resolved from the row itself
 *     (never from client input) and passed in by the caller as a clinic id.
 *   * `user_id` is null on purpose: the notification is for the tenant team, and
 *     the bell reads by `clinic_id` (a specific staff assignee does not exist
 *     for cross-tenant requests yet).
 *   * the link always points at the recipient's own tenant detail page.
 *
 * Fail-safe by contract: a notification problem must NEVER fail the referral
 * itself, so this function swallows and logs every error.
 */
export type ReferralNotifyInput = {
  /** The partner organization that must be told (the other side of the row). */
  recipientClinicId: string;
  requestId: string;
  event: ReferralNotificationEvent;
  patientRef?: string | null;
  counterpartName?: string | null;
  serviceName?: string | null;
  /** Only meaningful for `referral_needs_clarification`. */
  note?: string | null;
};

/** `/dashboard/{slug}/referrals/{id}` — the recipient's own detail page. */
export function referralLink(slug: string | null | undefined, requestId: string): string {
  const base = slug ? tenantDashboardUrl(slug, 'referrals') : '/dashboard/referrals';
  return `${base}/${encodeURIComponent(requestId)}`;
}

export async function notifyReferral(input: ReferralNotifyInput) {
  try {
    if (!input.recipientClinicId) return null;

    // The recipient's slug decides the deep link; a missing slug degrades to the
    // legacy flat path (which the tenant compat-redirect resolves after login).
    const { data: clinic } = await supabaseAdmin
      .from('clinics')
      .select('slug')
      .eq('id', input.recipientClinicId)
      .maybeSingle();
    const slug = typeof clinic?.slug === 'string' && clinic.slug ? clinic.slug : null;

    const payload = buildReferralNotification(input.event, {
      requestId: input.requestId,
      link: referralLink(slug, input.requestId),
      patientRef: input.patientRef,
      counterpartName: input.counterpartName,
      serviceName: input.serviceName,
      note: input.note,
    });

    const created = await createInAppNotification({
      clinicId: input.recipientClinicId,
      userId: null,
      patientId: null,
      appointmentId: null,
      event: payload.event,
      title: payload.title,
      body: payload.body,
      link: payload.link,
    });

    logEvent('referral_notification_dispatched', {
      clinic_id: input.recipientClinicId,
      request_id: input.requestId,
      event: input.event,
      delivered: Boolean(created),
    });
    return created;
  } catch (err) {
    logEvent(
      'referral_notification_failed',
      {
        clinic_id: input.recipientClinicId,
        request_id: input.requestId,
        event: input.event,
        error: err instanceof Error ? err.message : String(err),
      },
      'warn',
    );
    return null;
  }
}
