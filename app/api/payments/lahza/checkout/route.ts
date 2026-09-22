import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeClinicRequest, roleDenied, ADMIN_ROLES } from '@/lib/services/clinicAuthorization';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { logEvent } from '@/lib/server/logging';
import { SUBSCRIPTION_PLANS } from '@/lib/subscription/plans';
import { resolveCheckoutPlan } from '@/lib/subscription/planCatalog';
import {
  getLahzaConfig,
  initializeLahzaTransaction,
  generateLahzaReference,
  isValidLahzaAmount,
} from '@/lib/payments/lahza';
import { PaymentProviderError } from '@/lib/payments/provider';

export const runtime = 'nodejs';

/**
 * POST /api/payments/lahza/checkout?clinic_id=…
 *
 * Creates a Lahza payment link for a subscription plan. Mirrors the Stripe route
 * contract so the dashboard UI can drive either gateway from one call site.
 *
 * Trust model: plan, amount, currency and reference are ALL server-derived — the
 * client only names a plan id.
 */

const bodySchema = z.object({
  plan_id: z.enum(SUBSCRIPTION_PLANS.map((p) => p.id) as [string, ...string[]]),
});

export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const clinicId = url.searchParams.get('clinic_id');
    if (!clinicId) return NextResponse.json({ error: 'clinic_id is required' }, { status: 400 });

    const authorization = await authorizeClinicRequest(req, clinicId);
    if (!authorization.authorized) {
      return NextResponse.json(
        { error: authorization.status === 401 ? 'Unauthorized' : 'Forbidden' },
        { status: authorization.status }
      );
    }
    // Only owner/manager may start a paid checkout for the clinic.
    if (roleDenied(authorization, ADMIN_ROLES)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'INVALID_PLAN', details: parsed.error.errors }, { status: 400 });
    }

    const config = getLahzaConfig();
    if (config.mode === 'unconfigured') {
      // Honest failure — never a silent "payment failed".
      return NextResponse.json(
        { error: 'PAYMENT_NOT_CONFIGURED', provider: 'lahza', message: 'لم يتم إعداد مفاتيح Lahza بعد.' },
        { status: 503 }
      );
    }

    // Plan + amount + currency come from the catalog (DB first), never the client.
    const { plan, interval } = await resolveCheckoutPlan(parsed.data.plan_id);
    if (plan.pricePerMonth <= 0) {
      return NextResponse.json({ error: 'هذه الباقة لا تتطلب دفعاً' }, { status: 400 });
    }
    const currency = (plan.currency || 'usd').toLowerCase();
    const amountMinor = Number(plan.pricePerMonth);
    if (!isValidLahzaAmount(amountMinor, currency)) {
      logEvent('lahza_checkout_invalid_amount', { clinic_id: clinicId, plan_id: plan.id, currency, amountMinor }, 'error');
      return NextResponse.json(
        { error: 'PAYMENT_AMOUNT_UNSUPPORTED', message: `المبلغ أو العملة غير مدعومين لدى Lahza (${currency}).` },
        { status: 503 }
      );
    }

    // Customer email = the AUTHENTICATED owner/admin (Lahza requires an email and
    // the dashboard has no billing-email field yet — the buyer IS the account).
    const email = authorization.user.email ?? null;
    if (!email) {
      return NextResponse.json(
        { error: 'PAYMENT_EMAIL_REQUIRED', message: 'لا يوجد بريد مرتبط بحسابك.' },
        { status: 400 }
      );
    }

    const reference = generateLahzaReference('sub');
    const callbackUrl = `${url.origin}/api/payments/lahza/callback`;

    // Persist the intent BEFORE calling the gateway: if Lahza succeeds but our
    // insert failed, we would be left with an un-activatable payment.
    const { error: intentError } = await supabaseAdmin
      .from('payment_checkout_intents')
      .insert({
        provider: 'lahza',
        reference,
        clinic_id: clinicId,
        plan_id: plan.id,
        billing_interval: interval,
        amount_minor: amountMinor,
        currency,
        status: 'pending',
        customer_email: email,
        created_by: authorization.user.id,
        metadata: { mode: config.mode, plan_name: plan.name },
      });

    if (intentError) {
      logEvent('lahza_intent_insert_failed', {
        clinic_id: clinicId,
        error: intentError.message,
        code: intentError.code,
      }, 'error');
      const migrationMissing =
        intentError.code === 'PGRST205' || /relation .* does not exist/i.test(intentError.message);
      return NextResponse.json(
        {
          error: migrationMissing ? 'PAYMENT_SCHEMA_MISSING' : 'PAYMENT_INTENT_FAILED',
          message: migrationMissing
            ? 'جدول نوايا الدفع غير موجود: طبّق الترحيل db/migrations/20261013_lahza_gateway.sql.'
            : 'تعذر تسجيل عملية الدفع.',
          detail: `${intentError.code ?? ''} ${intentError.message}`.trim(),
        },
        { status: 500 }
      );
    }

    const session = await initializeLahzaTransaction({
      amountMinor,
      currency,
      email,
      reference,
      callbackUrl,
      metadata: {
        clinic_id: clinicId,
        plan_id: plan.id,
        billing_interval: interval,
        kind: 'subscription',
      },
    });

    // Store the hosted URL + access code for support and callback cross-checks.
    await supabaseAdmin
      .from('payment_checkout_intents')
      .update({
        authorization_url: session.authorizationUrl,
        access_code: session.accessCode,
        reference: session.reference,
      })
      .eq('provider', 'lahza')
      .eq('reference', reference);

    logEvent('lahza_checkout_created', {
      clinic_id: clinicId,
      plan_id: plan.id,
      reference: session.reference,
      mode: config.mode,
    });

    return NextResponse.json({
      url: session.authorizationUrl,
      reference: session.reference,
      session_id: session.reference,
      provider: 'lahza',
      mode: config.mode,
    });
  } catch (err) {
    if (err instanceof PaymentProviderError) {
      logEvent('lahza_checkout_provider_error', { code: err.code, message: err.message }, 'error');
      return NextResponse.json(
        { error: err.code, message: err.message, detail: err.message },
        { status: err.status }
      );
    }
    const message = err instanceof Error ? err.message : 'Internal server error';
    logEvent('lahza_checkout_error', { error: message }, 'error');
    return NextResponse.json({ error: 'تعذر إنشاء جلسة الدفع', detail: message }, { status: 500 });
  }
}
