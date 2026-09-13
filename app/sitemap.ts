import type { MetadataRoute } from 'next';
import { getAppBaseUrl } from '@/lib/communications/links';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getPublicProfileSeoEntries } from '@/lib/services/doctorPublicProfile';
import { getActivitySpaceEntries } from '@/lib/services/activityPublicSpace';

/**
 * PP-8C / Digital Healthcare Space — sitemap.xml.
 *
 * Contains ONLY indexable public surfaces:
 *   - landing page
 *   - doctor public profiles (visibility = indexable, PP-8B)
 *   - activity public spaces (/{slug}) that are discovery-opted-in and
 *     subscribed (Phase C generalization — clinic / imaging / dental lab)
 *
 * Legacy `/c/{slug}` is deliberately NOT listed (it is noindex + canonical to
 * /{slug} since Phase E). Private/noindex surfaces never appear (AC-8).
 */
export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getAppBaseUrl();

  const entries: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: 'weekly', priority: 1 },
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
      url: `${base}/${encodeURIComponent(space.slug)}`,
      changeFrequency: 'monthly',
      priority: 0.8,
    });
  }

  return entries;
}
