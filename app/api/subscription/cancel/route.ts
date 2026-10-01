import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeClinicRequest, roleDenied, ADMIN_ROLES } from '@/lib/services/clinicAuthorization';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { logEvent } from '@/lib/server/logging';
import { cancelStripeSubscriptionAtPeriodEnd } from '@/lib/payments/stripe';

const cancelSchema = z.object({
  clinic_id: z.string().uuid().optional(),
  reason: z.string().max(500).optional(),
});

export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const body = await req.json().catch(() => ({}));
    const parsed = cancelSchema.safeParse(body);
    const clinicId = url.searchParams.get('clinic_id') ?? (parsed.success ? parsed.data.clinic_id ?? null : null);

    if (!clinicId) {
      return NextResponse.json({ error: 'clinic_id is required' }, { status: 400 });
    }

    const authorization = await authorizeClinicRequest(req, clinicId);
    if (!authorization.authorized) {
      return NextResponse.json({ error: authorization.status === 401 ? 'Unauthorized' : 'Forbidden' }, { status: authorization.status });
    }

    const gate = roleDenied(authorization, ADMIN_ROLES);
    if (gate) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { data: subscription, error: subscriptionError } = await supabaseAdmin
      .from('subscriptions')
      .select('id, clinic_id, stripe_subscription_id, status, cancel_at_period_end')
      .eq('clinic_id', clinicId)
      .is('deleted_at', null)
      .maybeSingle();

    if (subscriptionError) throw new Error(subscriptionError.message);
    if (!subscription) {
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
    }

    let cancelAt: number | null = null;
    if (subscription.stripe_subscription_id) {
      const result = await cancelStripeSubscriptionAtPeriodEnd(subscription.stripe_subscription_id);
      cancelAt = result.cancel_at ?? null;
    }

    const { error: updateError } = await supabaseAdmin
      .from('subscriptions')
      .update({
        status: 'canceled',
        cancel_at_period_end: true,
      })
      .eq('clinic_id', clinicId)
      .is('deleted_at', null);

    if (updateError) throw new Error(updateError.message);

    logEvent('subscription_cancel_scheduled', {
      clinic_id: clinicId,
      subscription_id: subscription.id,
      reason: parsed.success ? parsed.data.reason ?? null : null,
      cancel_at: cancelAt,
    });

    return NextResponse.json({
      success: true,
      cancel_at: cancelAt,
      message: 'تمت جدولة إلغاء الاشتراك حتى نهاية الدورة الحالية.',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    logEvent('subscription_cancel_error', { error: message }, 'error');
    return NextResponse.json({ error: 'تعذر إلغاء الاشتراك', message }, { status: 500 });
  }
}
