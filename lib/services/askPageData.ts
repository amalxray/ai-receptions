/** Server data loader for the public /ask page (settings + content). */
import { supabaseAdmin } from '@/lib/supabase/admin';
import { clinicSpaceUrl } from '@/lib/vercel/domains';

export async function getAskPageData() {
  const [settingsRes, tipsRes, articlesRes, storiesRes, faqRes, clinicsRes, galleryRes, clinicsCount, patientsCount, citiesCount] = await Promise.all([
    supabaseAdmin.from('platform_ask_settings').select('key, value'),
    supabaseAdmin.from('platform_tips').select('id, title, content, icon, category').eq('is_active', true).order('sort_order').limit(6),
    supabaseAdmin.from('platform_articles').select('id, title, slug, excerpt, category, published_at, featured_image:featured_image_id(image_url)').eq('status', 'published').order('published_at', { ascending: false }).limit(6),
    supabaseAdmin.from('platform_stories').select('id, patient_name, patient_age, patient_city, content, image_url, rating').eq('is_active', true).order('sort_order').limit(12),
    supabaseAdmin.from('platform_faq').select('id, question, answer').eq('is_active', true).order('sort_order').limit(20),
    supabaseAdmin.from('clinics').select('id, name, slug, city, activity_type, latitude, longitude').is('deleted_at', null).not('latitude', 'is', null).limit(6),
    supabaseAdmin.from('platform_gallery').select('id, title, image_url').eq('is_active', true).order('sort_order').limit(12),
    supabaseAdmin.from('clinics').select('*', { count: 'exact', head: true }).is('deleted_at', null),
    supabaseAdmin.from('patients').select('*', { count: 'exact', head: true }).is('deleted_at', null),
    supabaseAdmin.from('platform_cities').select('*', { count: 'exact', head: true }).eq('is_active', true),
  ]);
  const settings: Record<string, unknown> = {};
  for (const row of settingsRes.data ?? []) settings[row.key] = row.value;
  // Every partner card links to its canonical tenant subdomain (Phase E): built
  // here, on the server, so the client never has to know the domain shape.
  const clinics = (clinicsRes.data ?? []).map((row) => ({
    ...row,
    booking_url: clinicSpaceUrl(row.slug),
  }));
  return {
    settings,
    tips: tipsRes.data ?? [],
    articles: articlesRes.data ?? [],
    stories: storiesRes.data ?? [],
    faq: faqRes.data ?? [],
    clinics,
    gallery: galleryRes.data ?? [],
    stats: {
      clinics_count: clinicsCount.count ?? 0,
      patients_count: patientsCount.count ?? 0,
      cities_count: citiesCount.count ?? 0,
    },
  };
}
