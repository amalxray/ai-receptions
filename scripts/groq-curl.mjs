import fs from 'fs';
const env = Object.fromEntries(
  fs.readFileSync('.env.local','utf8').split('\n')
    .filter(l=>l.includes('=')&&!l.trim().startsWith('#'))
    .map(l=>[l.slice(0,l.indexOf('=')).trim(),l.slice(l.indexOf('=')+1).trim()])
);
const KEY=env.GROQ_API_KEY;const LOG='scripts/groq-curl.log';
const log=s=>fs.appendFileSync(LOG,s+'\n');fs.writeFileSync(LOG,'');
const MODELS=['openai/gpt-oss-120b','qwen/qwen3.8-27b','allam-2-7b'];
const BOOKING='أريد حجز موعد لفحص أسنان اليوم الساعة 3';
async function test(model,content){const t0=Date.now();const r=await fetch('https://api.groq.com/openai/v1/chat/completions',{method:'POST',headers:{'Authorization':'Bearer '+KEY,'Content-Type':'application/json'},body:JSON.stringify({model,messages:[{role:'user',content}],max_tokens:120})});const ms=Date.now()-t0;const j=await r.json().catch(()=>({}));return{status:r.status,ms,text:j?.choices?.[0]?.message?.content??null,usage:j?.usage??null,err:j?.error?.message??null};}
(async()=>{for(const model of MODELS){const r=await test(model,BOOKING);log(`\n=== ${model} | status=${r.status} | ${(r.ms/1000).toFixed(2)}s ===`);if(r.text)log('reply: '+r.text.replace(/\s+/g,' ').trim());if(r.usage)log(`usage: total=${r.usage.total_tokens} (p=${r.usage.prompt_tokens} c=${r.usage.completion_tokens})`);if(r.err)log('error: '+r.err);await new Promise(res=>setTimeout(res,1200));}log('\nDONE');})();
