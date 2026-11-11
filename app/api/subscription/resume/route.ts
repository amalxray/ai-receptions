import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ADMIN_ROLES } from '@/lib/services/clinicAuthorization';
import { permissionDenied } from '@/lib/services/permissionGate';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { logEvent } from '@/lib/server/logging';
import { resumeStripeSubscription } from '@/lib/payments/stripe';

const resumeSchema = z.object({
  clinic_id: z.string().uuid().optional(),
});

export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const body = await req.json().catch(() => ({}));
    const parsed = resumeSchema.safeParse(body);
    const clinicId = url.searchParams.get('clinic_id') ?? (parsed.success ? parsed.data.clinic_id : null);

    if (!clinicId) {
      return NextResponse.json({ error: 'clinic_id is required' }, { status: 400 });
    }

    const permission = await permissionDenied(req, clinicId, 'manage_subscription', { allowedRoles: ADMIN_ROLES });
    if (permission) return permission;

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

    if (subscription.stripe_subscription_id) {
      await resumeStripeSubscription(subscription.stripe_subscription_id);
    }

    const nextStatus = subscription.status === 'trialing' ? 'trialing' : 'active';
    const { error: updateError } = await supabaseAdmin
      .from('subscriptions')
      .update({
        status: nextStatus,
        cancel_at_period_end: false,
      })
      .eq('clinic_id', clinicId)
      .is('deleted_at', null);

    if (updateError) throw new Error(updateError.message);

    const { error: clinicUpdateError } = await supabaseAdmin
      .from('clinics')
      .update({ subscription_status: 'active' })
      .eq('id', clinicId);

    if (clinicUpdateError) throw new Error(clinicUpdateError.message);

    logEvent('subscription_resumed', {
      clinic_id: clinicId,
      subscription_id: subscription.id,
      stripe_subscription_id: subscription.stripe_subscription_id,
    });

    return NextResponse.json({
      success: true,
      message: 'تمت استعادة الاشتراك بنجاح.',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    logEvent('subscription_resume_error', { error: message }, 'error');
    return NextResponse.json({ error: 'تعذر استعادة الاشتراك', message }, { status: 500 });
  }
}
