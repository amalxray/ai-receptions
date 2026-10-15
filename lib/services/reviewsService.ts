/**
 * PHASE 2 — public reviews: server data access + PURE Schema.org builders.
 *
 * Thresholds (owner decisions):
 *   clinic   >= 5  published reviews -> AggregateRating on the clinic page
 *   platform >= 20 published reviews -> AggregateRating on the /ask Organization
 *   below threshold -> NO schema (rich-result penalty risk); the UI still renders.
 *
 * Builders are PURE (no I/O) so unit tests need no Supabase. Data access is
 * server-only (supabaseAdmin), deduped per request (requestCache) and held in a
 * 5-minute module TTL cache so an ISR revalidation costs at most two queries.
 */
import { supabaseAdmin } from '@/lib/supabase/admin';
import { requestCache } from '@/lib/server/requestCache';

export const REVIEW_SCHEMA_THRESHOLD = 5;
export const PLATFORM_SCHEMA_THRESHOLD = 20;
export const PUBLIC_REVIEWS_LIMIT = 5;
export const JSONLD_REVIEW_LIMIT = 10;

export type PublicReviewItem = {
  id: string;
  rating: number;
  author_name: string;
  comment: string | null;
  is_verified: boolean;
  created_at: string;
};

export type ReviewStats = {
  total: number;
  average: number;
  distribution: Record<'1' | '2' | '3' | '4' | '5', number>;
};

/* ─────────────────────────── PURE builders (tested) ─────────────────────── */

export function summarizeRatings(ratings: number[]): ReviewStats {
  const distribution: ReviewStats['distribution'] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let sum = 0;
  let total = 0;
  for (const raw of ratings) {
    const rating = Math.round(raw);
    if (rating < 1 || rating > 5) continue;
    distribution[String(rating) as '1' | '2' | '3' | '4' | '5'] += 1;
    sum += rating;
    total += 1;
  }
  const average = total ? Math.round((sum / total) * 100) / 100 : 0;
  return { total, average, distribution };
}

export function aggregateRatingNode(stats: ReviewStats) {
  return {
    '@type': 'AggregateRating',
    ratingValue: String(stats.average),
    bestRating: '5',
    worstRating: '1',
    reviewCount: String(stats.total),
    ratingCount: String(stats.total),
  };
}

/**
 * Clinic-page fragment merged INTO the existing MedicalClinic JSON-LD:
 * `aggregateRating` + up to JSONLD_REVIEW_LIMIT `review` nodes.
 * Returns null below the threshold — the caller then emits nothing extra.
 */
export function buildClinicReviewsJsonLd(params: {
  clinic: { name: string; url: string };
  stats: ReviewStats;
  items: Array<{ id: string; rating: number; author_name: string; comment?: string | null; created_at: string }>;
}): Record<string, unknown> | null {
  if (params.stats.total < REVIEW_SCHEMA_THRESHOLD) return null;

  const review = params.items.slice(0, JSONLD_REVIEW_LIMIT).map((item) => ({
    '@type': 'Review',
    name: 'تقييم مريض',
    ...(item.comment ? { reviewBody: item.comment } : {}),
    author: { '@type': 'Person', name: item.author_name },
    datePublished: item.created_at,
    reviewRating: {
      '@type': 'Rating',
      ratingValue: String(item.rating),
      bestRating: '5',
      worstRating: '1',
    },
  }));

  return {
    aggregateRating: aggregateRatingNode(params.stats),
    ...(review.length > 0 ? { review } : {}),
  };
}


/**
 * /ask structured data: ItemList of clinics that reached the clinic threshold
 * (each with its own aggregateRating) + an Organization node with the platform
 * AggregateRating when the platform total reaches PLATFORM_SCHEMA_THRESHOLD.
 * Returns null when neither node qualifies (nothing to emit).
 */
export function buildAskReviewsJsonLd(params: {
  siteUrl: string;
  organizationName?: string;
  /** Parallel arrays: clinics[i] pairs with summaries[i]. */
  clinics: Array<{ name: string; url: string }>;
  summaries: Array<ReviewStats | null>;
  platform: ReviewStats;
}): Record<string, unknown> | null {
  const listItems: Array<Record<string, unknown>> = [];
  params.clinics.forEach((clinic, index) => {
    const stats = params.summaries[index];
    if (!stats || stats.total < REVIEW_SCHEMA_THRESHOLD) return;
    listItems.push({
      '@type': 'ListItem',
      position: listItems.length + 1,
      item: {
        '@type': 'MedicalClinic',
        name: clinic.name,
        url: clinic.url,
        aggregateRating: aggregateRatingNode(stats),
      },
    });
  });

  const platformNode =
    params.platform.total >= PLATFORM_SCHEMA_THRESHOLD
      ? {
          '@type': 'Organization',
          name: params.organizationName ?? 'dentairec',
          url: params.siteUrl,
          aggregateRating: aggregateRatingNode(params.platform),
        }
      : null;

  if (!platformNode && listItems.length === 0) return null;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      ...(platformNode ? [platformNode] : []),
      ...(listItems.length > 0
        ? [{ '@type': 'ItemList', name: 'تقييمات العيادات', itemListElement: listItems }]
        : []),
    ],
  };
}

/* ─────────────────────── server data access (TTL cache) ─────────────────── */

const CACHE_TTL_MS = 5 * 60_000;

function readCache<T>(map: Map<string, { at: number; value: T }>, key: string): T | null {
  const hit = map.get(key);
  return hit && Date.now() - hit.at < CACHE_TTL_MS ? hit.value : null;
}

function writeCache<T>(map: Map<string, { at: number; value: T }>, key: string, value: T): void {
  map.set(key, { at: Date.now(), value });
}

const statsCache = new Map<string, { at: number; value: ReviewStats }>();
const itemsCache = new Map<string, { at: number; value: PublicReviewItem[] }>();
type AllSummaries = { byClinic: Map<string, ReviewStats>; platform: ReviewStats };
const allSummariesCache = new Map<string, { at: number; value: AllSummaries }>();

const ZERO_STATS: ReviewStats = { total: 0, average: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } };

/** Published-review stats for one clinic (errors degrade to empty stats — a DB
 *  hiccup must never blank a tenant page that was working). */
export const getClinicReviewsStats = requestCache(async (clinicId: string): Promise<ReviewStats> => {
  const cached = readCache(statsCache, clinicId);
  if (cached) return cached;
  try {
    const { data, error } = await supabaseAdmin
      .from('clinic_reviews')
      .select('rating')
      .eq('clinic_id', clinicId)
      .eq('is_published', true)
      .is('deleted_at', null);
    const value = error ? { ...ZERO_STATS } : summarizeRatings((data ?? []).map((row) => Number(row.rating)));
    writeCache(statsCache, clinicId, value);
    return value;
  } catch {
    return { ...ZERO_STATS };
  }
});

/** Latest PUBLIC_REVIEWS_LIMIT published reviews, newest first. */
export const getClinicReviewsForPublic = requestCache(async (clinicId: string): Promise<PublicReviewItem[]> => {
  const cached = readCache(itemsCache, clinicId);
  if (cached) return cached;
  const { items } = await getClinicReviewsPage(clinicId, 0, PUBLIC_REVIEWS_LIMIT);
  writeCache(itemsCache, clinicId, items);
  return items;
});

/**
 * Phase 3b — paginated published reviews for /{slug}/reviews.
 * Same filters/ordering as getClinicReviewsForPublic, offset-based.
 */
export async function getClinicReviewsPage(
  clinicId: string,
  offset: number,
  limit: number
): Promise<{ items: PublicReviewItem[]; total: number }> {
  try {
    const { data, error, count } = await supabaseAdmin
      .from('clinic_reviews')
      .select('id, rating, author_name, comment, is_verified, created_at', { count: 'exact' })
      .eq('clinic_id', clinicId)
      .eq('is_published', true)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) return { items: [], total: 0 };
    return { items: ((data ?? []) as PublicReviewItem[]), total: count ?? 0 };
  } catch {
    return { items: [], total: 0 };
  }
}

/**
 * ONE query for every published review on the platform, grouped per clinic —
 * feeds /ask (force-no-store) without fanning out per tenant.
 */
export const getAllReviewSummaries = requestCache(async (): Promise<AllSummaries> => {
  const cached = readCache(allSummariesCache, 'all');
  if (cached) return cached;
  let rows: Array<{ clinic_id: string; rating: number }> = [];
  try {
    const { data, error } = await supabaseAdmin
      .from('clinic_reviews')
      .select('clinic_id, rating')
      .eq('is_published', true)
      .is('deleted_at', null);
    if (!error && data) rows = data;
  } catch {
    rows = [];
  }

  const grouped = new Map<string, number[]>();
  const all: number[] = [];
  for (const row of rows) {
    const list = grouped.get(row.clinic_id) ?? [];
    list.push(Number(row.rating));
    grouped.set(row.clinic_id, list);
    all.push(Number(row.rating));
  }

  const byClinic = new Map<string, ReviewStats>();
  grouped.forEach((ratings, clinicId) => byClinic.set(clinicId, summarizeRatings(ratings)));

  const value: AllSummaries = { byClinic, platform: summarizeRatings(all) };
  writeCache(allSummariesCache, 'all', value);
  return value;
});
