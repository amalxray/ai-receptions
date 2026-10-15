import { supabaseAdmin } from '@/lib/supabase/admin';
import { getAppBaseUrl } from '@/lib/communications/links';

/**
 * Phase 5 — /api/public/reviews/rss — latest 20 published reviews (RSS 2.0).
 * Public-only fields; PII already sanitized at write time (Phase 1).
 */
export async function GET() {
  const { data: reviews } = await supabaseAdmin
    .from('clinic_reviews')
    .select('id, rating, author_name, comment, created_at, clinics!inner(slug, name)')
    .eq('is_published', true)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(20);

  const baseUrl = getAppBaseUrl();
  const esc = (s: unknown) =>
    String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const items = (reviews ?? [])
    .map((r) => {
      const clinic = (r as any).clinics as { slug: string; name: string } | null;
      const clinicSlug = clinic?.slug ?? '';
      const clinicName = clinic?.name ?? '';
      const title = `تقييم ${r.rating} نجوم — ${clinicName} (بواسطة ${r.author_name})`;
      return `    <item>
      <title>${esc(title)}</title>
      <link>${baseUrl}/${esc(clinicSlug)}/reviews</link>
      <description>${esc(r.comment ?? `تقييم ${r.rating} من 5`)}</description>
      <pubDate>${new Date(String(r.created_at)).toUTCString()}</pubDate>
      <guid isPermaLink="false">review-${esc(r.id)}</guid>
    </item>`;
    })
    .join('\n');

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>تقييمات المرضى — Dentairec</title>
    <link>${baseUrl}/discover</link>
    <description>أحدث تقييمات المرضى المنشورة على منصة Dentairec</description>
    <language>ar</language>
    <atom:link href="${baseUrl}/api/public/reviews/rss" rel="self" type="application/rss+xml" />
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
