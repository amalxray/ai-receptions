import fs from 'fs';
const base = 'https://hala-clinic.dentairec.com';
const LOG = 'scripts/repro2.log';
const log = (s) => { fs.appendFileSync(LOG, s + '\n'); };
fs.writeFileSync(LOG, '');

const say = async (t) => {
  const r = await fetch(base + '/api/public/ai/messages', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ clinic_slug: 'hala-clinic', text: t }),
  });
  const b = await r.json().catch(() => ({}));
  return { status: r.status, b };
};

const MSG = 'أريد حجز موعد لفحص اسناني بكره الساعه 10 صباحا باسم شادي نوري';
const N = 6;
(async () => {
  let ok = 0, fail = 0, handoff = 0, card = 0;
  for (let i = 1; i <= N; i++) {
    try {
      const r = await say(MSG);
      const reply = String(r.b.assistant_message?.content ?? '');
      const isHandoff = /موظف الاستقبال البشري|تحويلك/.test(reply);
      const hasCard = !!r.b.interactive?.booking_confirmation;
      if (r.status === 200) ok++; else fail++;
      if (isHandoff) handoff++;
      if (hasCard) card++;
      log(`#${i} status=${r.status} handoff=${isHandoff} card=${hasCard} :: ${reply.replace(/\s+/g, ' ').slice(0, 90)}`);
    } catch (e) {
      fail++;
      log(`#${i} THREW ${e.message}`);
    }
    await new Promise((x) => setTimeout(x, 4000));
  }
  log(`\nSUMMARY: ${N} runs -> ok=${ok} non-200=${fail} | handoff_offer=${handoff} card=${card}`);
  log('DONE');
})();
