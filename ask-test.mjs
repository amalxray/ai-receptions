import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: 'new', args: ['--no-sandbox','--disable-setuid-sandbox','--window-size=1200,1600'] });
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 1600 });
const errs = [];
page.on('pageerror', e => errs.push(String(e).slice(0,180)));
await page.goto('http://localhost:3000/ask', { waitUntil: 'networkidle2', timeout: 180000 }).catch(()=>{});
await new Promise(r => setTimeout(r, 6000));
const text = await page.evaluate(() => (document.body.innerText || '').slice(0, 260).replace(/\n+/g, ' | '));
console.log('page head:', text.slice(0,180));
// type message and send
await page.type('input[placeholder="اكتب مشكلتك هنا..."]', 'طاحونتي بتوجعني', { delay: 10 }).catch(()=>console.log('input not found'));
await page.evaluate(() => { const btn = Array.from(document.querySelectorAll('button')).find(x => (x.textContent || '').trim() === 'إرسال'); if (btn) btn.click(); });
await new Promise(r => setTimeout(r, 5000));
const chat = await page.evaluate(() => (document.querySelector('.rounded-3xl')?.innerText || '').slice(0, 300).replace(/\n+/g, ' | '));
console.log('chat after reply:', chat.slice(0,250));
// location picker visibility
const hasPicker = await page.evaluate(() => Boolean(document.querySelector('.leaflet-container')));
console.log('leaflet map shown:', hasPicker);
console.log('errors:', errs.length ? errs.slice(0,3) : 'NONE');
await page.screenshot({ path: '/tmp/ask-page.png', fullPage: true });
await browser.close();
