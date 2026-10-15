import { supabaseAdmin } from '@/lib/supabase/admin';
import { logEvent } from '@/lib/server/logging';
import { createInAppNotification } from '@/lib/notifications/inAppNotifier';
import { getEmailProvider } from '@/lib/communications/email/provider';
import { getAppBaseUrl } from '@/lib/communications/links';

/**
 * Phase 4c — new-review notifications (fire-and-forget).
 *
 * Called from POST /api/public/reviews after a successful insert.
 * Never throws: every failure is logged and swallowed so the review
 * flow is never broken by a notification problem.
 *
 * Two channels:
 *  1. In-app (Dashboard bell) — always attempted via createInAppNotification.
 *  2. Email (Resend) — to clinic owners; silently skipped when no provider
 *     is configured (noop) or no owner email can be resolved.
 */

export type NewReviewNotification = {
  clinicId: string;
  clinicSlug: string;
  clinicName: string;
  reviewId: string;
  rating: number;
  authorName: string;
  comment: string | null;
};

function stars(rating: number): string {
  return '⭐'.repeat(Math.max(1, Math.min(5, Math.round(rating))));
}

function snippet(comment: string | null, max = 120): string {
  if (!comment) return 'بدون تعليق';
  const t = comment.trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

async function resolveOwnerEmails(clinicId: string): Promise<string[]> {
  try {
    const { data: members, error } = await supabaseAdmin
      .from('clinic_users')
      .select('user_id')
      .eq('clinic_id', clinicId)
      .eq('role', 'owner')
      .is('deleted_at', null);
    if (error || !members?.length) return [];
    const emails: string[] = [];
    for (const m of members) {
      try {
        const { data, error: uErr } = await supabaseAdmin.auth.admin.getUserById(m.user_id);
        const email = !uErr ? data?.user?.email : null;
        if (email) emails.push(email);
      } catch {
        // One unresolvable user must not block the others.
      }
    }
    return Array.from(new Set(emails));
  } catch (err) {
    logEvent('review_notify_owners_lookup_failed', {
      clinic_id: clinicId,
      error: err instanceof Error ? err.message : String(err),
    }, 'warn');
    return [];
  }
}

export async function notifyNewReview(params: NewReviewNotification): Promise<void> {
  const { clinicId, clinicSlug, clinicName, reviewId, rating, authorName, comment } = params;
  const link = `/dashboard/${clinicSlug}/reviews`;
  const title = `⭐ تقييم جديد من ${authorName}`;
  const body = `${stars(rating)} (${rating}/5) — ${snippet(comment)}`;

  // 1) In-app notification (Dashboard bell) — fail-safe internally.
  try {
    await createInAppNotification({
      clinicId,
      event: 'system',
      title,
      body,
      link,
    });
  } catch (err) {
    logEvent('review_notify_inapp_failed', {
      clinic_id: clinicId,
      review_id: reviewId,
      error: err instanceof Error ? err.message : String(err),
    }, 'warn');
  }

  // 2) Email to clinic owners — skipped silently when unconfigured.
  try {
    const provider = getEmailProvider();
    if (provider.name === 'noop' || provider.name === 'console') {
      logEvent('review_notify_email_skipped', { clinic_id: clinicId, provider: provider.name });
      return;
    }
    const recipients = await resolveOwnerEmails(clinicId);
    if (recipients.length === 0) {
      logEvent('review_notify_email_no_recipients', { clinic_id: clinicId });
      return;
    }
    const base = getAppBaseUrl();
    for (const to of recipients) {
      await provider.send({
        to,
        subject: `تقييم جديد في ${clinicName} — ${rating}/5 ⭐`,
        text: [
          `تقييم جديد في ${clinicName}`,
          '',
          `النجوم: ${stars(rating)} (${rating}/5)`,
          `الاسم: ${authorName}`,
          `التعليق: ${snippet(comment, 500)}`,
          '',
          `للمراجعة: ${base}${link}`,
        ].join('\n'),
      });
    }
    logEvent('review_notify_email_sent', { clinic_id: clinicId, review_id: reviewId, count: recipients.length });
  } catch (err) {
    logEvent('review_notify_email_failed', {
      clinic_id: clinicId,
      review_id: reviewId,
      error: err instanceof Error ? err.message : String(err),
    }, 'warn');
  }
}
