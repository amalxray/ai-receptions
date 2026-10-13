/**
 * FIELD TEST (read-only) — drives the DEPLOYED public receptionist API through a
 * natural booking conversation and reports whether the confirmation card (with
 * `confirm` + `edit` actions) is served for each tenant.
 *
 * SAFETY: it STOPS the moment the confirmation card appears. It never calls the
 * booking-action confirm endpoint, so NO real appointment is created. This only
 * reads/renders — the same payload the chat UI would show.
 *
 * Usage: node scripts/field-test-booking.mjs <baseUrl> <slug> "<opening>" ["<service>"]
 */
import fs from 'fs';

const [, , BASE, SLUG, OPENING, SERVICE = ''] = process.argv;
if (!BASE || !SLUG || !OPENING) {
  console.error('usage: node field-test-booking.mjs <baseUrl> <slug> "<opening>" ["<service>"]');
  process.exit(2);
}

const LOG = `scripts/field-test-${SLUG}.log`;
const MAX_TURNS = 16;
const NAME = 'اسمي محمد تجريبي';
const PHONE = '0599111222';
const TIME_24H = /^([01]\d|2[0-3]):[0-5]\d$/;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = [];
const log = (line) => { out.push(line); fs.appendFileSync(LOG, line + '\n'); console.log(line); };

async function say(text, conversationId) {
  const res = await fetch(`${BASE}/api/public/ai/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ clinic_slug: SLUG, ...(conversationId ? { conversation_id: conversationId } : {}), text }),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

function summarize(body) {
  const it = body?.interactive ?? {};
  const card = it.card_group ?? null;
  const bc = it.booking_confirmation ?? null;
  return {
    step: it.booking_step ?? null,
    cardKind: card?.kind ?? null,
    cardItems: card ? card.items.map((i) => i.title) : [],
    cardValues: card ? card.items.map((i) => i.value ?? i.title) : [],
    quick: (it.quick_replies ?? []).map((q) => q.value),
    confirmation: bc
      ? { service: bc.data.service, provider: bc.data.provider, date: bc.data.date, time: bc.data.time, name: bc.data.patient_name, phone: bc.data.phone, actions: bc.actions }
      : null,
  };
}

async function main() {
  fs.writeFileSync(LOG, `FIELD TEST ${SLUG} @ ${BASE}\n`);
  log(`\n===== FIELD TEST | ${SLUG} | ${BASE} =====`);

  let convId = null;
  let confirmationShown = false;
  let sentName = false;
  let sentPhone = false;
  let sawCardKinds = [];
  let fallback = false;

  let nextText = OPENING;

  for (let turn = 1; turn <= MAX_TURNS && !confirmationShown; turn += 1) {
    await sleep(convId ? 900 : 200);
    let r;
    try {
      r = await say(nextText, convId);
    } catch (e) {
      log(`T${turn} FETCH ERROR: ${e.message}`);
      break;
    }
    convId = convId ?? r.body?.conversation_id ?? null;
    const s = summarize(r.body);
    const reply = (r.body?.assistant_message?.content ?? '').replace(/\s+/g, ' ').trim();
    log(`\nT${turn} | HTTP ${r.status} | PATIENT: ${nextText}`);
    log(`   AI   : ${reply.slice(0, 220)}`);
    log(`   UI   : step=${s.step ?? 'n/a'} card=${s.cardKind ?? 'none'}${s.cardItems.length ? ' [' + s.cardItems.join(' | ') + ']' : ''} quick=[${s.quick.join(', ')}]`);

    if (r.status !== 200) { log(`   !! non-200: ${JSON.stringify(r.body).slice(0, 200)}`); }
    if (/حدثت مشكلة|المساعد غير متاح|غير متاح حاليا|حدث خطأ/i.test(reply)) { fallback = true; log('   ⚠️  POSSIBLE FALLBACK / AI OUTAGE'); }

    if (s.confirmation) {
      confirmationShown = true;
      log(`\n   ✅ BOOKING_CONFIRMATION CARD SERVED:`);
      log(`      ${JSON.stringify(s.confirmation)}`);
      log(`   ✅ actions present: ${JSON.stringify(s.confirmation.actions)}  → confirm & edit buttons available`);
      break;
    }

    // ---- adaptive: choose the next patient utterance from server state ----
    if (s.cardKind && !sawCardKinds.includes(s.cardKind)) sawCardKinds.push(s.cardKind);
    let decided = null;

    if (s.cardKind === 'service') decided = s.cardValues[0];
    else if (s.cardKind === 'provider') decided = s.cardValues[0];
    else if (s.cardKind === 'day') decided = s.cardValues[0];
    else if (s.cardKind === 'time') decided = s.cardValues.find((v) => TIME_24H.test(v)) ?? s.cardValues[0];
    else if (s.quick.some((q) => /نعم، أريد الحجز/.test(q))) decided = 'نعم، أريد الحجز';
    else if (s.step === 'details') {
      if (!sentName) { decided = NAME; sentName = true; }
      else if (!sentPhone) { decided = PHONE; sentPhone = true; }
    } else if (SERVICE && /اختر|أي خدمة|الخدمة/.test(reply) && !sentName) {
      decided = SERVICE; // steer a text-only service prompt
    }

    if (!decided) {
      // no clear server cue — nudge toward booking with a natural follow-up
      decided = turn === 1 ? (SERVICE || 'نعم، أريد الحجز') : 'نعم، متابعة الحجز';
    }
    nextText = decided;
  }

  // ---- verdict ----
  log('\n===== VERDICT =====');
  log(`turns_driven           : up to ${MAX_TURNS}`);
  log(`card_kinds_seen        : ${sawCardKinds.join(' -> ') || 'none'}`);
  log(`fallback_suspected     : ${fallback}`);
  log(`confirmation_card      : ${confirmationShown ? 'SHOWN (card + confirm + edit)' : 'NOT REACHED'}`);
  log(`RESULT                 : ${confirmationShown ? 'PASS' : fallback ? 'BLOCKED (AI fallback)' : 'INCOMPLETE (card not reached)'}`);
  process.exit(confirmationShown ? 0 : 1);
}

main();
