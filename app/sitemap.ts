import type { MetadataRoute } from 'next';
import { getAppBaseUrl } from '@/lib/communications/links';
import { clinicSpaceUrl } from '@/lib/vercel/domains';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getPublicProfileSeoEntries } from '@/lib/services/doctorPublicProfile';
import { getActivitySpaceEntries } from '@/lib/services/activityPublicSpace';

/**
 * PP-8C / Digital Healthcare Space — sitemap.xml.
 *
 * Contains ONLY indexable public surfaces:
 *   - landing page
 *   - doctor public profiles (visibility = indexable, PP-8B) — PATH-based `/d/{slug}`
 *   - activity public spaces on their canonical tenant subdomain
 *     (`https://{slug}.dentairec.com`) that are discovery-opted-in and
 *     subscribed (Phase C generalization — clinic / imaging / dental lab)
 *
 * Legacy `/c/{slug}` is deliberately NOT listed (it is noindex + canonical to
 * the tenant subdomain since Phase E), and neither is the legacy apex path
 * `/{slug}` (it now 301-redirects to the subdomain). Private/noindex surfaces
 * never appear (AC-8).
 */
export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getAppBaseUrl();

  const entries: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: 'weekly', priority: 1 },
    { url: `${base}/book`, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${base}/discover`, changeFrequency: 'weekly', priority: 0.9 },
  ];

  // /ask public surfaces (Digital Care Assistant)
  const askBase = `${base}/ask`;
  entries.push({ url: askBase, changeFrequency: 'daily', priority: 1 });
  for (const p of ['/articles', '/stories', '/tips', '/faq', '/about', '/contact', '/privacy', '/terms']) {
    entries.push({ url: `${askBase}${p}`, changeFrequency: 'weekly', priority: 0.7 });
  }

  // Published /ask articles
  try {
    const { data: askArticles } = await supabaseAdmin
      .from('platform_articles')
      .select('slug, updated_at, published_at')
      .eq('status', 'published')
      .order('published_at', { ascending: false });
    for (const a of askArticles ?? []) {
      entries.push({
        url: `${askBase}/article/${a.slug}`,
        lastModified: a.updated_at ?? a.published_at ?? undefined,
        changeFrequency: 'monthly',
        priority: 0.6,
      });
    }
  } catch {
    // ask articles are best-effort for the sitemap
  }

  for (const entry of await getPublicProfileSeoEntries()) {
    entries.push({
      url: `${base}/d/${encodeURIComponent(entry.slug)}`,
      lastModified: entry.lastModified ?? undefined,
      changeFrequency: 'monthly',
      priority: 0.8,
    });
  }

  for (const space of await getActivitySpaceEntries()) {
    entries.push({
      // Canonical tenant identity is the tenant's OWN subdomain (Phase E) — the
      // legacy apex path `/{slug}` 301-redirects here, so listing it would put a
      // redirecting URL in the sitemap.
      url: clinicSpaceUrl(space.slug),
      changeFrequency: 'monthly',
      priority: 0.8,
    });
  }

  return entries;
}
