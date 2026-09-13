/** Server data loader for the public /ask page (settings + content). */
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function getAskPageData() {
  const [settingsRes, tipsRes, articlesRes, storiesRes, faqRes] = await Promise.all([
    supabaseAdmin.from('platform_ask_settings').select('key, value'),
    supabaseAdmin.from('platform_tips').select('id, title, content, icon, category').eq('is_active', true).order('sort_order').limit(6),
    supabaseAdmin.from('platform_articles').select('id, title, slug, excerpt, category, published_at, featured_image:featured_image_id(image_url)').eq('status', 'published').order('published_at', { ascending: false }).limit(6),
    supabaseAdmin.from('platform_stories').select('id, patient_name, patient_age, patient_city, content, image_url, rating').eq('is_active', true).order('sort_order').limit(12),
    supabaseAdmin.from('platform_faq').select('id, question, answer').eq('is_active', true).order('sort_order').limit(20),
  ]);
  const settings: Record<string, unknown> = {};
  for (const row of settingsRes.data ?? []) settings[row.key] = row.value;
  return {
    settings,
    tips: tipsRes.data ?? [],
    articles: articlesRes.data ?? [],
    stories: storiesRes.data ?? [],
    faq: faqRes.data ?? [],
  };
}
