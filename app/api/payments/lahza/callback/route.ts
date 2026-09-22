import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { logEvent } from '@/lib/server/logging';
import { getLahzaConfig } from '@/lib/payments/lahza';
import { activateLahzaSubscription } from '@/lib/payments/lahzaActivation';

export const runtime = 'nodejs';

/**
 * GET /api/payments/lahza/callback?reference=…
 *
 * Where Lahza sends the browser after a payment attempt (the docs: "Lahza will
 * redirect the user back to a callback_url you set. We'll append the transaction
 * reference in the URL"). We never trust that redirect: the reference is
 * re-verified against Lahza's API and activation is idempotent, so arriving here
 * twice (or with a forged reference) changes nothing.
 *
 * The user always lands on their clinic's subscription page with an explicit
 * outcome flag; activation failures are left to the charge.success webhook.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const reference = url.searchParams.get('reference') ?? url.searchParams.get('trxref');
  const fallback = (query: string) => NextResponse.redirect(new URL(`/dashboard/subscription?${query}`, url.origin), 302);

  if (!reference) {
    logEvent('lahza_callback_missing_reference', { query: url.search }, 'error');
    return fallback('payment=missing_reference');
  }

  const config = getLahzaConfig();
  if (config.mode === 'unconfigured') {
    logEvent('lahza_callback_unconfigured', { reference }, 'error');
    return fallback('payment=unconfigured');
  }

  // Activate FIRST: the intent row read inside activation is the single source of
  // truth for the tenant, the plan and the amount (no duplicate lookup here).
  let outcome: Awaited<ReturnType<typeof activateLahzaSubscription>>;
  try {
    outcome = await activateLahzaSubscription(reference, 'callback');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logEvent('lahza_callback_error', { reference, error: message }, 'error');
    // A missing table means the migration was never applied — say so precisely.
    if (/PGRST205|INTENT_LOOKUP_FAILED/.test(message)) {
      return fallback('payment=schema_missing');
    }
    // Anything else (gateway timeout, DB write failure) is genuinely pending:
    // the charge.success webhook finishes the job server-side.
    return fallback(`session_id=${encodeURIComponent(reference)}&status=pending`);
  }

  if (outcome.status === 'unknown_reference') {
    return fallback('payment=unknown_reference');
  }

  const { data: clinic } = await supabaseAdmin
    .from('clinics')
    .select('slug')
    .eq('id', outcome.clinicId)
    .maybeSingle();
  const slug = clinic?.slug ?? null;
  const target = (query: string) =>
    NextResponse.redirect(
      new URL(slug ? `/dashboard/${slug}/subscription?${query}` : `/dashboard/subscription?${query}`, url.origin),
      302
    );

  if (outcome.status === 'failed') {
    return target(
      `session_id=${encodeURIComponent(reference)}&status=failed&reason=${encodeURIComponent(outcome.reason)}`
    );
  }
  return target(`session_id=${encodeURIComponent(reference)}&status=success`);
}
