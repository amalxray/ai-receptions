/**
 * /ask public content layer — read helpers + single write (view counters).
 * All reads go through the service-role client; row-level columns stay
 * deny-by-default for direct anon access (RLS + no grants), everything here
 * is bounded/paginated server-side.
 */
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function listPublishedArticles(opts: { category?: string | null; limit?: number; offset?: number }) {
  const limit = Math.min(Math.max(opts.limit ?? 10, 1), 50);
  const offset = Math.max(opts.offset ?? 0, 0);
  let q = supabaseAdmin
    .from('platform_articles')
    .select('id, title, slug, excerpt, category, tags, is_featured, published_at, featured_image:featured_image_id(image_url)')
    .eq('status', 'published')
    .lte('published_at', new Date().toISOString())
    .order('published_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (opts.category) q = q.eq('category', opts.category);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getPublishedArticle(slug: string) {
  const { error: err, data: article } = await supabaseAdmin
    .from('platform_articles')
    .select('id, title, slug, excerpt, content, category, tags, is_featured, published_at, view_count, featured_image:featured_image_id(image_url, description, title)')
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle();
  if (err) throw new Error(err.message);
  return article as Record<string, unknown> | null;
}

export async function incrementArticleViews(id: string): Promise<void> {
  const { error } = await supabaseAdmin.rpc('increment_article_views', { p_article_id: id });
  if (!error) return;
  // Fallback (RPC missing on some env): atomic increment via PostgREST.
  await supabaseAdmin
    .from('platform_articles')
    .update({ view_count: 1 })
    .eq('id', id);
}

export async function listActiveStories() {
  const { data, error } = await supabaseAdmin
    .from('platform_stories')
    .select('id, patient_name, patient_age, patient_city, content, image_url, rating')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .limit(50);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listActiveTips() {
  const { data, error } = await supabaseAdmin
    .from('platform_tips')
    .select('id, title, content, icon, category')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .limit(50);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listActiveFaq() {
  const { data, error } = await supabaseAdmin
    .from('platform_faq')
    .select('id, question, answer')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .limit(100);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listActiveCities() {
  const { data, error } = await supabaseAdmin
    .from('platform_cities')
    .select('id, name_ar, name_en, latitude, longitude')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .limit(100);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getAskSettings(): Promise<Record<string, unknown>> {
  const { data, error } = await supabaseAdmin
    .from('platform_ask_settings')
    .select('key, value');
  if (error) throw new Error(error.message);
  const out: Record<string, unknown> = {};
  for (const row of data ?? []) out[row.key] = row.value;
  return out;
}

export async function runNearbyClinics(lat: number, lng: number, radiusKm = 50, limit = 3) {
  const { data, error } = await supabaseAdmin.rpc('nearby_clinics', {
    p_lat: Number(lat),
    p_lng: Number(lng),
    p_radius_km: Number(radiusKm),
    p_limit: Math.min(Math.max(Number(limit), 1), 10),
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as {
    id: string;
    name: string;
    slug: string;
    activity_type: string;
    address_line: string | null;
    city: string | null;
    phone: string | null;
    google_maps_url: string | null;
    distance_km: number;
  }[];
}