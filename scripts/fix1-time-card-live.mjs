import fs from 'fs';

/**
 * FIX-1 live verification — time cards must be clickable and must send a 24h
 * "HH:MM" value the orchestrator understands (parseSlot), so tapping a chip
 * books instead of the AI answering «غير واضح».
 *
 * Runs the real patient scenario against the DEPLOYED public receptionist API
 * (`POST /api/public/ai/messages`) and simulates a UI tap exactly as
 * `components/chat/InteractiveReplies.tsx` does: `onSelect(card.value)`.
 *
 * hala-clinic's receptionist state machine starts in DISCOVERING_PROBLEM, so the
 * script drives the conversation like a real patient (symptom -> book) until a
 * kind:'time' card group is served, then taps it.
 *
 * Usage: node scripts/fix1-time-card-live.mjs [baseUrl]
 */

const BASE = process.argv[2] || process.env.E2E_BASE_URL || 'https://www.dentairec.com';
const SLUG = process.env.E2E_SLUG || 'hala-clinic';

const env = Object.fromEntries(
  fs.readFileSync('/home/shadi/Downloads/shadi-ai-solutions/.env.local', 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);
const SUP = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;

const results = [];
const check = (name, ok, extra) => {
  results.push({ name, ok, extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DAYS = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];
const TIME_24H = /^([01]\d|2[0-3]):[0-5]\d$/;
const CONFIRM_PHRASE = 'نعم، أكّد هذا الموعد';

const transcript = [];

async function say(text, conversationId) {
  const res = await fetch(`${BASE}/api/public/ai/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ clinic_slug: SLUG, ...(conversationId ? { conversation_id: conversationId } : {}), text }),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function rest(path) {
  const res = await fetch(`${SUP}/rest/v1/${path}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  return res.json().catch(() => null);
}

function turn(label, text, r) {
  const card = r.body?.interactive?.card_group ?? null;
  const quick = r.body?.interactive?.quick_replies ?? [];
  transcript.push({
    label, text, status: r.status,
    assistant: r.body?.assistant_message?.content ?? null,
    booking_step: r.body?.interactive?.booking_step ?? null,
    quick_replies: quick,
    card: card ? { kind: card.kind, items: card.items.map((i) => ({ title: i.title, value: i.value, subtitle: i.subtitle })) } : null,
    booking_context: r.body?.booking_context ?? null,
  });
  console.log(`\n--- ${label} | HTTP ${r.status}`);
  console.log(`PATIENT: ${text}`);
  console.log(`AI     : ${(r.body?.assistant_message?.content ?? '').replace(/\s+/g, ' ').slice(0, 320)}`);
  console.log(`UI     : step=${r.body?.interactive?.booking_step ?? 'n/a'} quick=[${quick.map((q) => q.label).join(' , ')}] card=${card ? card.kind : 'none'}`);
  if (card) console.log(`CHIPS  : ${JSON.stringify(card.items.map((i) => ({ t: i.title, v: i.value })))}`);
  return card;
}

function finish() {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n=== ${results.length - failed.length}/${results.length} PASS ===`);
  if (failed.length) console.log('FAILED: ' + failed.map((f) => f.name).join(' | '));
  process.exit(failed.length ? 1 : 0);
}
/**
 * What a real patient types, in order, to reach the time-selection step.
 * hala-clinic's state machine stays in DISCOVERING_PROBLEM until the patient
 * names a service, so each clinic gets its own natural opening line.
 */
const SCRIPTS = {
  'hala-clinic': [
    'اريد حجز موعد لتنظيف الاسنان يوم الاحد الساعة 1',
    'طيب أعطني الأوقات المتاحة',
    'بدي أحجز أقرب موعد',
    'موافق على الموعد المقترح',
  ],
  'amal-x-ray-center': [
    'مرحبا، أريد حجز موعد تصوير بانوراما',
    'طيب أعطني الأوقات المتاحة',
    'بدي أحجز أقرب موعد',
    'موافق على الموعد المقترح',
  ],
  default: [
    'بدي أحجز موعد',
    'عندي وجع من يومين',
    'طيب أعطني الأوقات المتاحة',
    'بدي أحجز أقرب موعد',
    'موافق على الموعد المقترح',
  ],
};

async function main() {
  console.log(`=== FIX-1 live verification — ${BASE} | clinic=${SLUG} ===`);

  // ---------- Phase A: drive to a kind:'time' card group ----------
  let convId = null;
  let timeCard = null;
  let timeTurnIndex = -1;
  const seenKinds = new Set();

  const script = SCRIPTS[SLUG] ?? SCRIPTS.default;
  let clockChipsSeen = 0;

  for (let i = 0; i < script.length && !timeCard; i += 1) {
    const text = script[i];
    await sleep(convId ? 1400 : 200);
    const r = await say(text, convId);
    if (!convId) {
      convId = r.body?.conversation_id ?? null;
      check('conversation created', r.status === 200 && !!convId, `http ${r.status}${convId ? ' conv=' + convId.slice(0, 8) : ''}`);
      if (!convId) { finish(); return; }
    }
    const card = turn(`A${i + 1} — «${text}»`, text, r);
    if (!card) continue;
    seenKinds.add(card.kind);

    // Server-offered options (service/provider/day) are tapped exactly like the
    // UI does, then the conversation continues.
    const tapValue = card.items[0]?.value ?? card.items[0]?.title;
    if (card.kind !== 'time' && tapValue) {
      check(`card(${card.kind}) chips carry a value`, card.items.every((it) => Boolean(it.value)), `first=${tapValue}`);
      await sleep(1400);
      const c2 = turn(`A${i + 1}·tap — «${tapValue}»`, tapValue, await say(tapValue, convId));
      if (c2) {
        seenKinds.add(c2.kind);
        if (c2.kind === 'time') { timeCard = c2; timeTurnIndex = i; }
      }
      continue;
    }
    if (card.kind === 'time') {
      // A time card either offers explicit clock chips (HH:MM values) or is the
      // single "proposed slot — confirm it" card (its value is the confirm
      // phrase). Both are tapped by the UI the same way.
      clockChipsSeen += card.items.filter((it) => it.value && TIME_24H.test(it.value)).length;
      timeCard = card;
      timeTurnIndex = i;
    }
  }

  check('time card rendered after a natural booking flow', !!timeCard,
    timeCard ? `${timeCard.items.length} chip(s) | kinds seen: ${[...seenKinds].join(',')}` : `no time card | kinds seen: ${[...seenKinds].join(',') || 'none'}`);
  check('explicit HH:MM clock chips offered', clockChipsSeen > 0,
    clockChipsSeen > 0 ? `${clockChipsSeen} clock chip(s)` : 'only the proposed-slot confirm card (alternatives never reach metadata)');

  // ---------- Phase B: FIX-1 — clickable value ----------
  let clickedTime = null;
  if (timeCard) {
    const noValue = timeCard.items.filter((it) => !it.value);
    check('every time chip has a value (FIX-1)', noValue.length === 0, noValue.length ? `${noValue.length} chip(s) without value` : 'all chips carry a value');

    const notClock = timeCard.items.filter((it) => it.value && !TIME_24H.test(it.value) && it.value !== CONFIRM_PHRASE);
    check('every chip value is 24h HH:MM (parseSlot-ready)', notClock.length === 0, notClock.length ? notClock.map((i) => i.value).join(' , ') : 'ok');

    const chip = timeCard.items.find((it) => it.value && TIME_24H.test(it.value)) ?? timeCard.items[0];
    clickedTime = chip.value && TIME_24H.test(chip.value) ? chip.value : null;

    await sleep(1400);
    const tapText = chip.value ?? chip.title;
    const r = await say(tapText, convId);
    turn(`B — tap time chip «${tapText}»`, tapText, r);
    const reply = (r.body?.assistant_message?.content ?? '').replace(/\s+/g, ' ');
    const ctx = r.body?.booking_context ?? {};
    check('AI understood the tapped time (no «غير واضح»)', !/غير واضح|لم أفهم|ما فهمت|not clear|unclear/i.test(reply), reply.slice(0, 130));
    if (clickedTime) check('booking_context.slot keeps the tapped 24h time', String(ctx.slot ?? '').includes(clickedTime), `slot=${ctx.slot ?? 'null'}`);
    check('progress moved past time selection', String(r.body?.interactive?.booking_step ?? '') !== 'time_selection', `step=${r.body?.interactive?.booking_step ?? 'n/a'}`);
  }

  // ---------- Phase C: name -> phone -> confirm ----------
  await sleep(1400);
  const nameTurn = turn('C1 — name', 'اسمي سامي تجريبي', await say('اسمي سامي تجريبي', convId));
  await sleep(1400);
  const phoneTurn = turn('C2 — phone', 'رقمي 0599111222', await say('رقمي 0599111222', convId));
  await sleep(1400);
  const confirm = await say('طيب احجز', convId);
  turn('C3 — «طيب احجز»', 'طيب احجز', confirm);

  const ctx = confirm.body?.booking_context ?? {};
  const missing = Array.isArray(ctx.missing) ? ctx.missing : [];
  check('booking confirmed by the AI flow', ctx.patient_confirmed_booking === true || missing.length === 0,
    `confirmed=${ctx.patient_confirmed_booking} missing=${JSON.stringify(missing)}`);
  if (nameTurn?.body?.booking_context) {
    check('name captured into the pending booking', Boolean(nameTurn.body.booking_context.patient_name), `patient_name=${nameTurn.body.booking_context.patient_name ?? 'null'}`);
  }
  if (phoneTurn?.body?.booking_context) {
    check('phone captured into the pending booking', Boolean(phoneTurn.body.booking_context.patient_phone), `phone=${phoneTurn.body.booking_context.patient_phone ?? 'null'}`);
  }

  // ---------- Phase D: DB readback ----------
  const appts = await rest(`appointments?conversation_id=eq.${convId}&select=id,appointment_date,scheduled_at,status,service_id,provider_id`);
  if (Array.isArray(appts)) {
    check('appointment persisted in DB', appts.length > 0, appts.length ? JSON.stringify(appts[0]).slice(0, 200) : 'no row');
    if (appts.length > 0 && clickedTime) {
      check('booked time matches the tapped chip', String(appts[0].scheduled_at ?? '').includes(clickedTime), `scheduled_at=${appts[0].scheduled_at}`);
    }
  } else check('appointment persisted in DB', false, 'REST query failed');

  // ---------- Phase E: presentation (FIX-2 / FIX-3) ----------
  const aiText = transcript.map((t) => t.assistant ?? '').join('\n');
  const dupDay = DAYS.find((d) => aiText.includes(`${d} (${d})`));
  check('no duplicated day name «السبت (السبت)» (FIX-2)', !dupDay, dupDay ? `found «${dupDay} (${dupDay})»` : 'clean');

  const twelveHour = aiText.match(/\d{1,2}:\d{2}\s*(?:ص|م)/g) ?? [];
  const bare24h = (aiText.match(/\b0\d:\d{2}\b/g) ?? []).filter((s) => !/0\d:\d{2}\s*(?:ص|م)/.test(s));
  const noLeadingZero = twelveHour.some((s) => /^\d:\d{2}/.test(s));
  check('AI shows times in 12h «9:00 ص» (FIX-3)', twelveHour.length > 0 && noLeadingZero, `12h=${JSON.stringify(twelveHour.slice(0, 6))} hasNoLeadingZero=${noLeadingZero}`);
  check('no bare 24h «09:00» left in the AI text', bare24h.length === 0, bare24h.slice(0, 6).join(' , ') || 'clean');

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = `/home/shadi/Downloads/shadi-ai-solutions/transcripts/fix1-time-card-${stamp}.json`;
  fs.writeFileSync(file, JSON.stringify({ base: BASE, slug: SLUG, conversation_id: convId, clicked_time: clickedTime, time_turn: timeTurnIndex, transcript, results }, null, 2));
  console.log(`\ntranscript -> ${file}`);
  finish();
}

main().catch((e) => { console.log('FATAL', e.message); process.exit(2); });