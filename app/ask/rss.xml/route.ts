import { supabaseAdmin } from '@/lib/supabase/admin';

/** /ask/rss.xml — published article feed (RFC 4287 RSS 2.0 + Atom self-link). */
export async function GET() {
  const { data: articles } = await supabaseAdmin
    .from('platform_articles')
    .select('title, slug, excerpt, published_at')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(20);

  const baseUrl = 'https://ai-receptions.vercel.app';
  const esc = (s: unknown) =>
    String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const items = (articles ?? [])
    .map(
      (a) => `    <item>
      <title>${esc(a.title)}</title>
      <link>${baseUrl}/ask/article/${esc(a.slug)}</link>
      <description>${esc(a.excerpt ?? '')}</description>
      <pubDate>${new Date(String(a.published_at ?? new Date().toISOString())).toUTCString()}</pubDate>
    </item>`
    )
    .join('\n');

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>سنّي — مقالات صحة الأسنان</title>
    <link>${baseUrl}/ask</link>
    <description>مقالات عن صحة الفم والأسنان مباشرة من فريق سنّي</description>
    <language>ar</language>
    <atom:link href="${baseUrl}/ask/rss.xml" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>`;

  return new Response(rss, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
