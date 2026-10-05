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
import { describeLandingOrderDatabaseError, normalizeLandingPageOrder } from '@/lib/landing/landing-order';
import { supabaseAdmin } from '@/lib/supabase/admin';

export type LandingSectionRow = {
  id: string;
  section_key: string;
  content: unknown;
  updated_at: string;
  sort_order?: number;
};

/** Section keys the editor exposes (mapped to landingCopy keys on merge). */
export const LANDING_SECTION_KEYS = [
  'hero',
  'features',
  'for_doctors',
  'how_it_works',
  'compare',
  'faq',
  'pricing',
  'testimonials',
  'cta',
  'footer',
  'urgency_bar',
  'seo',
  'colors',
] as const;
export type LandingSectionKey = (typeof LANDING_SECTION_KEYS)[number];

const STATIC_COPY_LOCKED_SECTIONS = new Set([
  'features',
  'for_doctors',
  'how_it_works',
  'compare',
  'faq',
  'testimonials',
  'urgency_bar',
]);

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
  pricing: 'خطط الاشتراك والأسعار',
  testimonials: 'آراء الأطباء',
  cta: 'الدعوة النهائية لاتخاذ إجراء',
  footer: 'تذييل الصفحة',
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

function isUntouchedLegacyHeroSeed(content: unknown): boolean {
  if (!isPlainObject(content) || Object.keys(content).length !== 6) return false;
  return content.headline1 === 'كل مكالمة ما ردّيت عليها'
    && content.headline2 === 'مريض راح لعيادة تانية'
    && content.paragraph === 'عيادتك بتحتاج موظفة استقبال ما بتنام، ما بتاخد إجازة، وما بتفوّت ولا مريض — بترد بلهجته العامية، بتحجزله موعد فوراً، وبتجاوبه على مدار الساعة.'
    && content.ctaPrimary === 'جرّب المحادثة الآن ←'
    && content.ctaSecondary === 'شوف كيف يشتغل'
    && JSON.stringify(content.stats) === JSON.stringify([
      { value: '24/7', label: 'متاحة دايماً' },
      { value: '<3s', label: 'سرعة الرد' },
      { value: '100%', label: 'فهم اللهجة' },
    ]);
}

function resolveLegacyHeroRow(row: LandingSectionRow): LandingSectionRow {
  return row.section_key === 'hero' && isUntouchedLegacyHeroSeed(row.content)
    ? { ...row, content: landingCopy.hero }
    : row;
}

function deepMerge(base: unknown, override: unknown): unknown {
  if (!isPlainObject(base) || !isPlainObject(override)) return override ?? base;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(override)) {
    out[k] = k in base ? deepMerge(base[k], v) : v;
  }
  return out;
}

export async function getLandingPageOrder(): Promise<string[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from('landing_page_order')
      .select('section_key, sort_order')
      .order('sort_order', { ascending: true });

    if (error) throw error;

    const saved = (data ?? [])
      .map((row) => String(row.section_key))
      .filter((key) => LANDING_SECTION_KEYS.includes(key as LandingSectionKey));

    return Array.from(new Set([...saved, ...LANDING_SECTION_KEYS]));
  } catch {
    return [...LANDING_SECTION_KEYS];
  }
}

export async function saveLandingPageOrder(order: string[]): Promise<void> {
  const validOrder = normalizeLandingPageOrder(order, LANDING_SECTION_KEYS);

  try {
    const { error } = await supabaseAdmin
      .from('landing_page_order')
      .upsert(
        validOrder.map((key, index) => ({ section_key: key, sort_order: index })),
        { onConflict: 'section_key' }
      );

    if (error) throw new Error(describeLandingOrderDatabaseError(error));
  } catch (error) {
    throw new Error(describeLandingOrderDatabaseError(error));
  }
}

export async function getAllLandingSections(): Promise<LandingSectionRow[]> {
  const { data, error } = await supabaseAdmin
    .from('landing_page_content')
    .select('id, section_key, content, updated_at')
    .order('section_key');

  if (error) throw new Error(error.message);

  const rows = ((data ?? []) as LandingSectionRow[]).map(resolveLegacyHeroRow);
  const orderedKeys = await getLandingPageOrder();
  const orderMap = new Map(orderedKeys.map((key, index) => [key, index]));

  return rows.sort((a, b) => {
    const diff = (orderMap.get(a.section_key) ?? Number.MAX_SAFE_INTEGER) - (orderMap.get(b.section_key) ?? Number.MAX_SAFE_INTEGER);
    return diff !== 0 ? diff : a.section_key.localeCompare(b.section_key);
  });
}

export async function getLandingSection(key: string): Promise<LandingSectionRow | null> {
  const { data, error } = await supabaseAdmin
    .from('landing_page_content')
    .select('id, section_key, content, updated_at')
    .eq('section_key', key)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? resolveLegacyHeroRow(data as LandingSectionRow) : null;
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
      if (STATIC_COPY_LOCKED_SECTIONS.has(row.section_key)) continue;
      const copyKey = SECTION_TO_COPY_KEY[row.section_key] ?? row.section_key;
      merged = deepMerge(merged, { [copyKey]: row.content }) as Record<string, unknown>;
    }
  } catch {
    // DB unavailable → pure static copy (never break the landing page).
  }
  return merged;
}
