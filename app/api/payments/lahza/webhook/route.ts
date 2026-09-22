import { NextResponse } from 'next/server';
import { logEvent } from '@/lib/server/logging';
import {
  LAHZA_SIGNATURE_HEADER,
  clientIpFromHeaders,
  getLahzaConfig,
  isLahzaSourceIp,
  verifyLahzaSignature,
} from '@/lib/payments/lahza';
import {
  activateLahzaSubscription,
  lahzaEventKey,
  markLahzaEventProcessed,
  wasLahzaEventProcessed,
} from '@/lib/payments/lahzaActivation';

export const runtime = 'nodejs';

/**
 * POST /api/payments/lahza/webhook
 *
 * Lahza events (documented): charge.success, refund.pending, refund.processing,
 * refund.processed, refund.failed. No user faces this route and it takes no auth
 * header — security comes from three independent layers:
 *
 *   1. HMAC-SHA512 signature verification when Lahza sends
 *      `x-lahza-signature` (absent → allowed, since Lahza's public docs do not
 *      (yet) document the header; PRESENT-but-wrong → hard 400).
 *   2. Source-IP allowlist against Lahza's published webhook addresses.
 *   3. THE DECIDING LAYER: nothing is activated from this body. Activation does
 *      a live `GET /transaction/verify/:reference` and requires a success status
 *      with a matching amount + currency. A forged `charge.success` therefore
 *      grants nothing — the forged reference either does not exist at Lahza or
 *      was never paid.
 *
 * Responses: 200 for handled/duplicate/ignored events (Lahza retries failures
 * for 72h, so we only return 5xx when a retry could actually help).
 */
export async function POST(req: Request) {
  const rawBody = await req.text();

  // Layer 1 — signature (only enforced when actually provided).
  const signatureState = verifyLahzaSignature(rawBody, req.headers.get(LAHZA_SIGNATURE_HEADER));
  if (signatureState === 'invalid') {
    logEvent('lahza_webhook_invalid_signature', {}, 'error');
    return NextResponse.json({ error: 'invalid signature' }, { status: 400 });
  }

  // Layer 2 — source IP allowlist.
  const ip = clientIpFromHeaders(req.headers);
  if (ip && !isLahzaSourceIp(ip)) {
    logEvent('lahza_webhook_rejected_ip', { ip }, 'error');
    return NextResponse.json({ error: 'forbidden source' }, { status: 403 });
  }
  if (!ip) {
    // Not fatal: layer 3 still decides. Worth flagging in logs.
    logEvent('lahza_webhook_missing_client_ip', { signature: signatureState }, 'error');
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'invalid payload' }, { status: 400 });
  }

  const eventName: string = String(event?.event ?? event?.type ?? 'unknown');
  const data = event?.data ?? {};
  const reference: string | null = data?.reference ? String(data.reference) : null;
  const eventKey = lahzaEventKey(eventName, reference);

  // Durable dedup — the same delivery (or a replay) is processed exactly once.
  try {
    if (await wasLahzaEventProcessed(eventKey)) {
      return NextResponse.json({ received: true, duplicate: true });
    }
  } catch (err) {
    // Ledger unreadable (migration not applied yet) — activation is still
    // idempotent via the intent row, so we continue instead of dropping the event.
    logEvent('lahza_webhook_ledger_unavailable', {
      error: err instanceof Error ? err.message : String(err),
    }, 'error');
  }

  const config = getLahzaConfig();
  if (config.mode === 'unconfigured') {
    logEvent('lahza_webhook_unconfigured', { event: eventName }, 'error');
    return NextResponse.json({ received: true, ignored: 'unconfigured' });
  }

  if (eventName !== 'charge.success') {
    // Refund events do not change entitlement today (documented, deliberate).
    await safeMark(eventKey, eventName, reference, null, 'skipped');
    return NextResponse.json({ received: true, ignored: eventName });
  }

  if (!reference) {
    await safeMark(eventKey, eventName, null, null, 'skipped');
    logEvent('lahza_webhook_missing_reference', { event: eventName }, 'error');
    return NextResponse.json({ received: true, ignored: 'no-reference' });
  }

  try {
    const outcome = await activateLahzaSubscription(reference, 'webhook');

    if (outcome.status === 'unknown_reference') {
      // Not our transaction (or a stale/manual call): ack so Lahza stops retrying.
      await safeMark(eventKey, eventName, reference, null, 'skipped');
      return NextResponse.json({ received: true, ignored: 'unknown-reference' });
    }

    await safeMark(eventKey, eventName, reference, outcome.clinicId, 'processed');
    return NextResponse.json({ received: true, status: outcome.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logEvent('lahza_webhook_handler_error', { error: message, event: eventName, reference }, 'error');
    await safeMark(eventKey, eventName, reference, null, 'error');
    // 500 → Lahza retries (transient gateway/DB failures are recoverable).
    return NextResponse.json({ error: 'handler error', detail: message }, { status: 500 });
  }
}

async function safeMark(
  eventKey: string,
  event: string,
  reference: string | null,
  clinicId: string | null,
  outcome: 'processed' | 'skipped' | 'error'
) {
  try {
    await markLahzaEventProcessed(eventKey, event, reference, clinicId, outcome);
  } catch {
    // Ledger write failures must never break webhook acknowledgement.
  }
}
