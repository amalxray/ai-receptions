#!/usr/bin/env node
/**
 * Read-only AEO/GEO audit for five important published platform articles.
 * Uses the Supabase Management SQL API for database reads and fetches each
 * public article page to inspect its rendered JSON-LD and internal links.
 * Never prints credentials or changes database content.
 *
 * Run: node scripts/verify-aeo-geo-status.mjs
 * Optional: AEO_BASE_URL=https://www.dentairec.com
 */
import fs from 'node:fs';

const ENV_PATH = new URL('../.env.local', import.meta.url);
const envFile = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8') : '';
const readEnv = (key) => {
  if (process.env[key]) return process.env[key];
  const line = envFile.split(/\r?\n/).find((entry) => entry.trim().startsWith(`${key}=`));
  if (!line) return '';
  return line.slice(line.indexOf('=') + 1).trim().replace(/^(['"])(.*)\1$/, '$2');
};

const supabaseUrl = readEnv('NEXT_PUBLIC_SUPABASE_URL');
const accessToken = readEnv('SUPABASE_ACCESS_TOKEN');
const baseUrl = (process.env.AEO_BASE_URL || 'https://www.dentairec.com').replace(/\/+$/, '');
const projectRef = supabaseUrl.replace(/^https:\/\//, '').split('.')[0];
const sqlEndpoint = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;
const preferredSlugs = [
  'dental-implants-palestine-2026',
  'cbct-nablus-guide-2026',
  'panorama-xray-when-needed',
  'tooth-pain-when-serious',
  'root-canal-when-needed',
  'cbct-vs-panorama-difference',
  'dental-imaging-prices-nablus-2026',
  'choose-imaging-center-nablus',
  'tooth-decay-symptoms-prevention',
  'dental-cleaning-every-6-months',
];

let failures = 0;
let checks = 0;
function check(label, ok, detail = '') {
  checks += 1;
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${label}${detail ? ` — ${detail}` : ''}`);
}

async function runSql(query) {
  const response = await fetch(sqlEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ query }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.message || `Supabase SQL API returned HTTP ${response.status}`);
  return payload;
}

function htmlText(value) {
  return String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/\s+/g, ' ')
    .trim();
}

function getFaqItems(value) {
  let parsed = value;
  if (typeof parsed === 'string') {
    try { parsed = JSON.parse(parsed); } catch { return []; }
  }
  return Array.isArray(parsed)
    ? parsed.filter((item) => item && typeof item.question === 'string' && item.question.trim() && typeof item.answer === 'string' && item.answer.trim())
    : [];
}

function jsonLdObjects(html) {
  const objects = [];
  const scriptRe = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(scriptRe)) {
    try {
      const value = JSON.parse(match[1]);
      objects.push(...(Array.isArray(value) ? value : [value]));
    } catch { /* Invalid JSON-LD is intentionally excluded from valid results. */ }
  }
  return objects;
}

function hasBookLink(html) {
  return [...html.matchAll(/\bhref=["']([^"']+)["']/gi)].some((match) => {
    try { return new URL(match[1].replace(/&amp;/g, '&'), baseUrl).pathname.replace(/\/$/, '') === '/book'; }
    catch { return false; }
  });
}

function hasSiblingArticleLink(html, ownSlug) {
  return [...html.matchAll(/\bhref=["']([^"']+)["']/gi)].some((match) => {
    try {
      const url = new URL(match[1].replace(/&amp;/g, '&'), baseUrl);
      const sibling = url.pathname.match(/^\/ask\/article\/([^/]+)\/?$/)?.[1];
      return Boolean(sibling && sibling !== ownSlug);
    } catch { return false; }
  });
}

async function auditArticle(article) {
  const slug = String(article.slug);
  const content = String(article.content ?? '');
  const faqItems = getFaqItems(article.faq);
  const capsuleMatch = content.match(/<div\b[^>]*class=["'][^"']*\banswer-capsule\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
  const capsuleWords = capsuleMatch ? (htmlText(capsuleMatch[1]).match(/[\p{L}\p{N}]+/gu) ?? []).length : 0;
  const beforeCapsule = capsuleMatch ? htmlText(content.slice(0, capsuleMatch.index)) : '';
  check(`${slug}: answer-capsule at content start (40–60 words)`, Boolean(capsuleMatch) && beforeCapsule.length === 0 && capsuleWords >= 40 && capsuleWords <= 60, capsuleMatch ? `${capsuleWords} words` : 'missing capsule');
  check(`${slug}: FAQ JSON has 3–5 complete items`, faqItems.length >= 3 && faqItems.length <= 5, `${faqItems.length} complete entries`);

  let response;
  let html = '';
  try {
    response = await fetch(`${baseUrl}/ask/article/${encodeURIComponent(slug)}`, { redirect: 'follow' });
    html = await response.text();
  } catch (error) {
    check(`${slug}: public article HTML reachable`, false, error instanceof Error ? error.message : String(error));
  }
  if (response) {
    check(`${slug}: public article HTML reachable`, response.ok, `HTTP ${response.status}, final URL ${response.url}`);
    const structured = jsonLdObjects(html);
    const types = structured.flatMap((item) => Array.isArray(item?.['@type']) ? item['@type'] : [item?.['@type']]).filter(Boolean);
    check(`${slug}: Article JSON-LD in rendered HTML`, types.includes('Article'));
    check(`${slug}: FAQPage JSON-LD in rendered HTML`, types.includes('FAQPage'));
    check(`${slug}: links to a sibling article`, hasSiblingArticleLink(html, slug));
    check(`${slug}: links to /book`, hasBookLink(html));
  }
}

async function main() {
  if (!supabaseUrl || !accessToken || !projectRef) {
    console.log('BLOCKED | Configure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_ACCESS_TOKEN in environment or .env.local');
    process.exitCode = 2;
    return;
  }

  try {
    const faqColumn = await runSql("SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='platform_articles' AND column_name='faq') AS exists");
    const hasFaqColumn = faqColumn?.[0]?.exists === true;
    check('platform_articles.faq JSONB column exists', hasFaqColumn);

    const priorityOrder = preferredSlugs
      .map((slug, index) => `WHEN '${slug.replace(/'/g, "''")}' THEN ${index}`)
      .join(' ');
    const faqSelect = hasFaqColumn ? ', faq' : '';
    const articles = await runSql(`
      SELECT id, title, slug, content${faqSelect}, published_at
      FROM public.platform_articles
      WHERE status = 'published'
        AND published_at <= NOW()
        AND slug IS NOT NULL
      ORDER BY CASE slug ${priorityOrder} ELSE ${preferredSlugs.length} END,
               published_at DESC NULLS LAST
      LIMIT 5
    `);
    check('Five published articles selected', Array.isArray(articles) && articles.length === 5, `${Array.isArray(articles) ? articles.length : 0} found`);
    if (!Array.isArray(articles) || articles.length === 0) {
      console.log(`SUMMARY ${checks - failures}/${checks} PASS`);
      process.exitCode = 1;
      return;
    }

    for (const article of articles) await auditArticle(article);
  } catch (error) {
    check('Audit completed without API/database error', false, error instanceof Error ? error.message : String(error));
  }

  console.log(`SUMMARY ${checks - failures}/${checks} PASS`);
  console.log(failures === 0 ? 'AEO/GEO CHECKS PASSED' : `AEO/GEO CHECKS FAILED: ${failures}`);
  process.exitCode = failures === 0 ? 0 : 1;
}

await main();
