import fs from 'fs';
const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);
const KEY = env.GROQ_API_KEY;
const LOG = 'scripts/groq-models.log';
const log = (s) => { fs.appendFileSync(LOG, s + '\n'); };
fs.writeFileSync(LOG, '');

(async () => {
  const r = await fetch('https://api.groq.com/openai/v1/models', {
    headers: { 'Authorization': 'Bearer ' + KEY },
  });
  log('status: ' + r.status);
  const j = await r.json().catch(() => ({}));
  const ids = (j?.data ?? []).map((m) => m.id).sort();
  log('count: ' + ids.length);
  ids.forEach((id) => log('  ' + id));
  log('DONE');
})();
