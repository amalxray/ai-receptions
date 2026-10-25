import { supabaseAdmin } from '@/lib/supabase/admin';
import { logEvent } from '@/lib/server/logging';

export const EXPIRED_TRIAL_MESSAGE = 'انتهت تجربتك، ارقّي الآن.';

type SubscriptionAccessRow = {
  id: string;
  status: string | null;
  trial_end: string | null;
};

export type ClinicSubscriptionAccess = {
  allowed: boolean;
  expired: boolean;
  status: string | null;
  trialEnd: string | null;
};

/**
 * Reads the current subscription and marks elapsed trials as expired.
 * A missing row or a temporary database read failure preserves existing
 * clinic behavior; a known expired trial is always denied, even if the status
 * update fails because the enum migration has not reached the database yet.
 */
export async function getClinicSubscriptionAccess(
  clinicId: string,
  now = new Date(),
): Promise<ClinicSubscriptionAccess> {
  try {
    const { data, error } = await supabaseAdmin
      .from('subscriptions')
      .select('id, status, trial_end')
      .eq('clinic_id', clinicId)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return { allowed: true, expired: false, status: null, trialEnd: null };

    const subscription = data as SubscriptionAccessRow;
    const trialEndTime = subscription.trial_end ? new Date(subscription.trial_end).getTime() : NaN;
    const trialExpired = Number.isFinite(trialEndTime) && trialEndTime <= now.getTime();
    const status = (subscription.status ?? '').toLowerCase();

    if (status === 'expired') {
      return { allowed: false, expired: true, status, trialEnd: subscription.trial_end };
    }

    if (status === 'trialing' && trialExpired) {
      let updateError: { message: string } | null = null;
      try {
        const result = await supabaseAdmin
          .from('subscriptions')
          .update({ status: 'expired' })
          .eq('id', subscription.id)
          .eq('status', 'trialing');
        updateError = result.error;
      } catch (error) {
        updateError = { message: error instanceof Error ? error.message : String(error) };
      }

      if (updateError) {
        logEvent('trial_expiry_status_update_failed', {
          clinic_id: clinicId,
          error: updateError.message,
        }, 'error');
      } else {
        logEvent('clinic_trial_expired', { clinic_id: clinicId });
      }

      return { allowed: false, expired: true, status: 'expired', trialEnd: subscription.trial_end };
    }

    if (trialExpired && status !== 'active') {
      return { allowed: false, expired: true, status: status || null, trialEnd: subscription.trial_end };
    }

    return { allowed: true, expired: false, status: status || null, trialEnd: subscription.trial_end };
  } catch (error) {
    logEvent('subscription_access_check_failed', {
      clinic_id: clinicId,
      error: error instanceof Error ? error.message : String(error),
    }, 'error');
    return { allowed: true, expired: false, status: null, trialEnd: null };
  }
}
