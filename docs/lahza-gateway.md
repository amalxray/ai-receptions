# Lahza Payment Gateway — subscriptions (local payments)

Status: **implemented (Phase 1: link + callback + webhook + activation)**.

## Why a second gateway

The subscription catalog is priced in USD and Stripe handled international cards
only. Palestinian clinics need local card acceptance, so Lahza was added **behind
the same contract** as Stripe: the dashboard picks a gateway, the server resolves
the plan/amount, and activation always happens server-side.

## Documented API surface used (docs.lahza.io / api-docs.lahza.io)

| Item | Value |
|---|---|
| Base URL | `https://api.lahza.io` |
| Create transaction | `POST /transaction/initialize` (`Authorization: Bearer SECRET_KEY`) |
| Verify transaction | `GET /transaction/verify/:reference` |
| Amount unit | lowest currency value — agora (ILS), qirsh (JOD), cents (USD) |
| Currencies | ILS, JOD, USD |
| Events | `charge.success`, `refund.{pending,processing,processed,failed}` |
| Webhook source IPs | `161.35.20.140`, `209.38.219.189` (test **and** live) |
| Reference charset | `-`, `.`, `=` and alphanumerics only |
| Test cards | Visa `4111111111111111`, MC `5424000000000015` (CVV 004, exp 03/30) |

## Flow

```
[Subscription page] choose(plan_id, gateway='lahza')
        │  POST /api/payments/lahza/checkout?clinic_id=…
        ▼
auth (owner/manager) → plan+amount+currency from the catalog (never the client)
        │  insert payment_checkout_intents (status=pending, reference=sub-…)
        ▼
POST /transaction/initialize  → authorization_url
        │  browser → Lahza hosted checkout
        ▼
    ┌──────────────────────────────┬───────────────────────────────┐
    │ GET /api/payments/lahza/     │ POST /api/payments/lahza/     │
    │ callback?reference=…         │ webhook  (charge.success)     │
    │ (instant, browser)           │ (durable backstop + retries)  │
    └──────────────┬───────────────┴───────────────┬───────────────┘
                   ▼                               ▼
        activateLahzaSubscription(reference, source)   ← single code path
                   │
        GET /transaction/verify/:reference  → must be status=success
        amount ≥ intent.amount_minor  AND  currency matches intent
                   │
        subscriptions: status=active, plan_id, billing_status, period start/end
        intents: status=paid  (the mutex → callbacks/webhook replays are no-ops)
```

## Security posture (why there is no `return true`)

Lahza's public docs do **not** document a signed-webhook scheme (unlike Stripe's
`stripe-signature`), so a naive `verifyLahzaWebhook() { return true }` would let
anyone forge a `charge.success` and grant themselves a paid plan. Layers:

1. **Verify is the gate.** No activation without a live
   `GET /transaction/verify/:reference` returning `success` with an amount that
   covers and a currency that matches the intent we created. A forged webhook is
   therefore inert.
2. **Signature when present.** `x-lahza-signature` (HMAC-SHA512, hex, timing-safe)
   is verified when Lahza sends it; present-but-wrong ⇒ `400`. Absent ⇒ allowed
   (documented absence), because layer 1 still decides.
3. **IP allowlist.** Requests whose source IP is present and outside Lahza's
   published ranges ⇒ `403`.
4. **Tenant isolation.** The clinic is read from OUR intent row, never the request.
5. **Idempotency.** `payment_checkout_intents.status='paid'` short-circuits, so the
   callback and the webhook (and N retries) extend the period exactly once.
6. **No client-controlled money.** Plan, amount, currency and reference are all
   server-derived; the client only sends a plan id.

## Database

`db/migrations/20261013_lahza_gateway.sql` (apply in the Supabase SQL editor):

* `payment_checkout_intents` — one row per attempt; unique `(provider, reference)`;
  `status ∈ pending|paid|failed|expired`; RLS read for clinic admins only, writes
  service-role only; explicit GRANTs (the 42501 lesson from #38).
* `lahza_webhook_events` — durable dedup ledger keyed `event:reference` because
  Lahza sends no event id (RLS on, no `authenticated` policy).

`subscriptions` is **not** altered: activation writes only to pre-existing columns.

## Environment

| Variable | Purpose |
|---|---|
| `LAHZA_SECRET_KEY` | server-side API auth (never in the browser) |
| `NEXT_PUBLIC_LAHZA_PUBLIC_KEY` | reserved for future Popup/JS checkout |
| `LAHZA_MODE` | optional `test`/`live`; otherwise derived from the key prefix |
| `LAHZA_WEBHOOK_SECRET` | optional; only used when the signature header arrives |

## Manual steps before live testing

1. Apply `db/migrations/20261013_lahza_gateway.sql` in Supabase.
2. Register the webhook URL in the Lahza dashboard:
   `https://<your-domain>/api/payments/lahza/webhook`.
3. Set a callback URL or rely on the per-transaction `callback_url` we send
   (`/api/payments/lahza/callback`) — the docs allow the code-level override.
4. Test with the documented test cards; the subscription flips to `active` on the
   callback (instant) with the webhook as backstop.
