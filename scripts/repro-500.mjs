import fs from 'fs';
const base = 'https://hala-clinic.dentairec.com';
const LOG = 'scripts/repro.log';
const log = (s) => { fs.appendFileSync(LOG, s + '\n'); console.log(s); };
fs.writeFileSync(LOG, '');

const say = async (t, cid) => {
  const r = await fetch(base + '/api/public/ai/messages', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ clinic_slug: 'hala-clinic', ...(cid ? { conversation_id: cid } : {}), text: t }),
  });
  const b = await r.json().catch(() => ({}));
  return { status: r.status, b };
};

const cases = [
  'أريد حجز موعد لفحص اسناني بكره الساعه 10 صباحا  باسم شادي نوري',
  'بدي احجز موعد بكره الساعه 10 صباحا',
  'بدي احجز موعد اليوم الساعه 3',
];

(async () => {
  for (const msg of cases) {
    try {
      const r = await say(msg);
      log('MSG   : ' + msg);
      log('  status  : ' + r.status);
      log('  error   : ' + JSON.stringify(r.b.error ?? null));
      log('  assistant: ' + String(r.b.assistant_message?.content ?? '').replace(/\s+/g, ' ').slice(0, 200));
      log('  step    : ' + String(r.b.interactive?.booking_step ?? 'n/a'));
      log('');
    } catch (e) {
      log('MSG   : ' + msg + '  -> THREW ' + e.message);
      log('');
    }
    await new Promise((x) => setTimeout(x, 3500));
  }
  log('DONE');
})();
