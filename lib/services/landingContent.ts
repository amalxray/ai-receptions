/**
 * LANDING PAGE CMS — service layer (platform-owner editable content).
 *
 * `landing_page_content` stores per-section JSON overrides for the public
 * landing page. `getLandingPageContent()` deep-merges the DB rows over the
 * static `landingCopy` defaults — a section missing from the DB (or a bad
 * row) falls back to the shipped copy, so the landing page can never break
 * from CMS data. Mutations go through /api/admin/* guarded by
 * `requirePlatformAdmin`.
 */
import { landingCopy } from '@/lib/landing/landing-copy';
import { supabaseAdmin } from '@/lib/supabase/admin';

export type LandingSectionRow = {
  id: string;
  section_key: string;
  content: unknown;
  updated_at: string;
};

/** Section keys the editor exposes (mapped to landingCopy keys on merge). */
export const LANDING_SECTION_KEYS = [
  'hero',
  'features',
  'for_doctors',
  'how_it_works',
  'compare',
  'faq',
  'testimonials',
  'urgency_bar',
  'seo',
  'colors',
] as const;
export type LandingSectionKey = (typeof LANDING_SECTION_KEYS)[number];

const SECTION_TO_COPY_KEY: Record<string, string> = {
  hero: 'hero',
  features: 'features',
  for_doctors: 'forDoctors',
  how_it_works: 'howItWorks',
  compare: 'compare',
  faq: 'faq',
  testimonials: 'testimonials',
  urgency_bar: 'urgencyBar',
  seo: 'seo',
  colors: 'colors',
};

const ARABIC_LABELS: Record<string, string> = {
  hero: 'القسم الرئيسي (Hero)',
  features: 'المميزات',
  for_doctors: 'للأطباء',
  how_it_works: 'كيف يعمل',
  compare: 'مقارنة مع/بدون',
  faq: 'الأسئلة الشائعة',
  testimonials: 'آراء الأطباء',
  urgency_bar: 'شريط العرض العاجل',
  seo: 'إعدادات SEO',
  colors: 'ألوان CTA',
};

export function landingSectionLabel(key: string): string {
  return ARABIC_LABELS[key] ?? key;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Deep merge — DB override wins; static copy fills anything absent. */
function deepMerge(base: unknown, override: unknown): unknown {
  if (!isPlainObject(base) || !isPlainObject(override)) return override ?? base;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(override)) {
    out[k] = k in base ? deepMerge(base[k], v) : v;
  }
  return out;
}

export async function getAllLandingSections(): Promise<LandingSectionRow[]> {
  const { data, error } = await supabaseAdmin
    .from('landing_page_content')
    .select('id, section_key, content, updated_at')
    .order('section_key');
  if (error) throw new Error(error.message);
  return (data ?? []) as LandingSectionRow[];
}

export async function getLandingSection(key: string): Promise<LandingSectionRow | null> {
  const { data, error } = await supabaseAdmin
    .from('landing_page_content')
    .select('id, section_key, content, updated_at')
    .eq('section_key', key)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as LandingSectionRow | null;
}

export async function upsertLandingSection(
  key: string,
  content: unknown,
  updatedBy: string
): Promise<void> {
  const { error } = await supabaseAdmin.from('landing_page_content').upsert(
    {
      section_key: key,
      content: content as Record<string, unknown>,
      updated_by: updatedBy,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'section_key' }
  );
  if (error) throw new Error(error.message);
}

/**
 * Merged landing copy = static defaults + DB overrides (all sections).
 * Returns exactly the shape the landing components expect (landingCopy).
 */
export async function getLandingPageContent(): Promise<Record<string, unknown>> {
  let merged: Record<string, unknown> = {
    ...landingCopy,
    testimonials: { title: 'آراء الأطباء', items: [] },
    seo: { title: '', description: '', og_image: '' },
    colors: { cta: '', primary: '', secondary: '' },
  };
  try {
    const rows = await getAllLandingSections();
    for (const row of rows) {
      if (!row || typeof row.section_key !== 'string') continue;
      const copyKey = SECTION_TO_COPY_KEY[row.section_key] ?? row.section_key;
      merged = deepMerge(merged, { [copyKey]: row.content }) as Record<string, unknown>;
    }
  } catch {
    // DB unavailable → pure static copy (never break the landing page).
  }
  return merged;
}
