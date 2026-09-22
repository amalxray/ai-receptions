import { supabaseAdmin } from '@/lib/supabase/admin';
import { logEvent } from '@/lib/server/logging';
import { verifyLahzaTransaction, type VerifiedTransaction } from './lahza';

/**
 * Lahza subscription activation — the SINGLE code path that may turn a payment
 * into an active subscription. Both entry points call it:
 *   * GET /api/payments/lahza/callback  (browser redirect — instant feedback)
 *   * POST /api/payments/lahza/webhook  (charge.success — durable backstop)
 *
 * Invariants:
 *   - Activation REQUIRES a successful live `verify` call whose amount+currency
 *     match the intent we created. A webhook payload alone activates nothing.
 *   - Idempotent: the intent row is the mutex (`status: paid` short-circuits), so
 *     callback-then-webhook (or N webhook retries) cannot double-extend a period.
 *   - Tenant-scoped: the clinic comes from OUR intent row, never the request body.
 *   - Writes ONLY to pre-existing `subscriptions` columns (no coupling to any
 *     single gateway's schema).
 */

export type ActivationOutcome =
  | { status: 'activated'; clinicId: string; planId: string; subscriptionId: string }
  | { status: 'already_active'; clinicId: string; planId: string }
  | { status: 'failed'; clinicId: string; reason: string }
  | { status: 'unknown_reference' };

type IntentRow = {
  id: string;
  provider: string;
  reference: string;
  clinic_id: string;
  plan_id: string;
  billing_interval: 'month' | 'year' | 'trial';
  amount_minor: number;
  currency: string;
  status: 'pending' | 'paid' | 'failed' | 'expired';
};

/**
 * Period end for a purchased interval. Day-clamped so a Jan-31 purchase ends on
 * Feb-28/29 instead of silently sliding into March (naive setMonth drift).
 */
export function periodEndFor(interval: 'month' | 'year' | 'trial', from: Date): Date {
  const end = new Date(from.getTime());
  const months = interval === 'year' ? 12 : 1;
  const day = end.getDate();
  end.setDate(1);
  end.setMonth(end.getMonth() + months);
  const lastDay = new Date(end.getFullYear(), end.getMonth() + 1, 0).getDate();
  end.setDate(Math.min(day, lastDay));
  return end;
}

/** Loads the gateway intent that owns this reference (tenant = the intent's). */
async function loadIntent(reference: string): Promise<IntentRow | null> {
  const { data, error } = await supabaseAdmin
    .from('payment_checkout_intents')
    .select('id, provider, reference, clinic_id, plan_id, billing_interval, amount_minor, currency, status')
    .eq('provider', 'lahza')
    .eq('reference', reference)
    .maybeSingle();
  if (error) {
    // PGRST205 = the table does not exist yet → the migration was not applied.
    // Surfaced loudly instead of silently reporting "payment failed".
    throw new Error(`INTENT_LOOKUP_FAILED: ${error.code ?? ''} ${error.message}`.trim());
  }
  return (data as IntentRow | null) ?? null;
}

export async function activateLahzaSubscription(
  reference: string,
  source: 'callback' | 'webhook'
): Promise<ActivationOutcome> {
  if (!reference) return { status: 'unknown_reference' };

  const intent = await loadIntent(reference);
  if (!intent) {
    logEvent('lahza_activation_unknown_reference', { reference, source }, 'error');
    return { status: 'unknown_reference' };
  }

  // Idempotency: the intent is already settled → nothing to do (no re-extension).
  if (intent.status === 'paid') {
    return { status: 'already_active', clinicId: intent.clinic_id, planId: intent.plan_id };
  }

  // Authoritative gateway state (the ONE thing that can activate).
  const verified: VerifiedTransaction = await verifyLahzaTransaction(reference);

  if (verified.status !== 'success') {
    await supabaseAdmin
      .from('payment_checkout_intents')
      .update({ status: 'failed', failure_reason: `gateway_status:${verified.status}` })
      .eq('id', intent.id);
    logEvent('lahza_payment_not_successful', {
      reference,
      source,
      clinic_id: intent.clinic_id,
      gateway_status: verified.status,
    });
    return { status: 'failed', clinicId: intent.clinic_id, reason: verified.status };
  }

  // Underpayment / currency-swap guard: the verified amount must cover what we
  // asked for, in the currency we asked for.
  if (verified.amountMinor < intent.amount_minor) {
    await supabaseAdmin
      .from('payment_checkout_intents')
      .update({ status: 'failed', failure_reason: `underpaid:${verified.amountMinor}<${intent.amount_minor}` })
      .eq('id', intent.id);
    logEvent('lahza_payment_underpaid', {
      reference,
      source,
      clinic_id: intent.clinic_id,
      expected: intent.amount_minor,
      received: verified.amountMinor,
    }, 'error');
    return { status: 'failed', clinicId: intent.clinic_id, reason: 'underpaid' };
  }
  if (verified.currency && verified.currency !== intent.currency.toLowerCase()) {
    await supabaseAdmin
      .from('payment_checkout_intents')
      .update({ status: 'failed', failure_reason: `currency_mismatch:${verified.currency}` })
      .eq('id', intent.id);
    logEvent('lahza_payment_currency_mismatch', {
      reference,
      source,
      clinic_id: intent.clinic_id,
      expected: intent.currency,
      received: verified.currency,
    }, 'error');
    return { status: 'failed', clinicId: intent.clinic_id, reason: 'currency_mismatch' };
  }

  const interval = intent.billing_interval === 'year' ? 'year' : 'month';
  const now = new Date();
  const periodEnd = periodEndFor(interval, now);

  const payload = {
    clinic_id: intent.clinic_id,
    plan_id: intent.plan_id,
    status: 'active' as const,
    billing_status: interval === 'year' ? 'yearly' : 'monthly',
    current_period_start: now.toISOString(),
    current_period_end: periodEnd.toISOString(),
    cancel_at_period_end: false,
    // Provider-agnostic column: the Lahza customer code (CUS_…) of this payer.
    billing_customer_id: verified.customerCode ?? null,
    deleted_at: null,
  };

  const { data: existing } = await supabaseAdmin
    .from('subscriptions')
    .select('id')
    .eq('clinic_id', intent.clinic_id)
    .is('deleted_at', null)
    .maybeSingle();

  let subscriptionId: string;
  if (existing?.id) {
    const { data: updated, error } = await supabaseAdmin
      .from('subscriptions')
      .update(payload)
      .eq('id', existing.id)
      .select('id')
      .single();
    if (error) throw new Error(`SUBSCRIPTION_UPDATE_FAILED: ${error.message}`);
    subscriptionId = updated.id;
  } else {
    const { data: inserted, error } = await supabaseAdmin
      .from('subscriptions')
      .insert(payload)
      .select('id')
      .single();
    if (error) throw new Error(`SUBSCRIPTION_INSERT_FAILED: ${error.message}`);
    subscriptionId = inserted.id;
  }

  // Settle the intent LAST: if anything above threw, the intent stays pending and
  // the gateway retry (or the next callback) replays safely.
  const { error: settleError } = await supabaseAdmin
    .from('payment_checkout_intents')
    .update({
      status: 'paid',
      paid_at: verified.paidAt ?? now.toISOString(),
      failure_reason: null,
    })
    .eq('id', intent.id);
  if (settleError) {
    logEvent('lahza_intent_settle_failed', { reference, error: settleError.message }, 'error');
  }

  logEvent('lahza_subscription_activated', {
    reference,
    source,
    clinic_id: intent.clinic_id,
    plan_id: intent.plan_id,
    interval,
    channel: verified.channel,
  });

  return {
    status: 'activated',
    clinicId: intent.clinic_id,
    planId: intent.plan_id,
    subscriptionId,
  };
}

/** Durable webhook dedup key — Lahza sends no event id, so event+reference. */
export function lahzaEventKey(event: string, reference: string | null): string {
  return `${event}:${reference ?? 'none'}`;
}

export async function wasLahzaEventProcessed(eventKey: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('lahza_webhook_events')
    .select('id')
    .eq('event_key', eventKey)
    .maybeSingle();
  return !!data;
}

export async function markLahzaEventProcessed(
  eventKey: string,
  event: string,
  reference: string | null,
  clinicId: string | null,
  outcome: 'processed' | 'skipped' | 'error' = 'processed'
): Promise<void> {
  await supabaseAdmin
    .from('lahza_webhook_events')
    .upsert(
      { event_key: eventKey, event, reference, clinic_id: clinicId, outcome },
      { onConflict: 'event_key' }
    );
}
