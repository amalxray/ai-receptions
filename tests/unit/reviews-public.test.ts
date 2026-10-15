import { describe, expect, it, vi } from 'vitest';

// The service imports supabaseAdmin for its server accessors; these tests
// exercise ONLY the pure builders, so a bare mock is enough.
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: {} }));

import {
  PLATFORM_SCHEMA_THRESHOLD,
  REVIEW_SCHEMA_THRESHOLD,
  buildAskReviewsJsonLd,
  buildClinicReviewsJsonLd,
  summarizeRatings,
} from '@/lib/services/reviewsService';

const CLINIC = { name: 'عيادة تجريبية', url: 'https://example.test/demo' };

function statsFor(ratings: number[]) {
  return summarizeRatings(ratings);
}

function items(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `r-${i}`,
    rating: 5,
    author_name: `مريض ${i}`,
    comment: 'تعامل ممتاز',
    created_at: '2026-10-20T10:00:00.000Z',
  }));
}

describe('summarizeRatings', () => {
  it('computes total, rounded average and 1–5 distribution', () => {
    const stats = summarizeRatings([5, 4, 5, 3]);
    expect(stats.total).toBe(4);
    expect(stats.average).toBe(4.25);
    expect(stats.distribution).toEqual({ 1: 0, 2: 0, 3: 1, 4: 1, 5: 2 });
  });

  it('ignores out-of-range ratings and empty input', () => {
    expect(summarizeRatings([]).total).toBe(0);
    expect(summarizeRatings([0, 6, -1]).total).toBe(0);
  });
});

describe('buildClinicReviewsJsonLd — threshold (owner decision)', () => {
  it('4 reviews → null (NO schema below threshold)', () => {
    expect(
      buildClinicReviewsJsonLd({
        clinic: CLINIC,
        stats: statsFor([5, 5, 4, 5]), // total = 4 < 5
        items: items(4),
      }),
    ).toBeNull();
  });

  it('5 reviews → AggregateRating + review nodes', () => {
    const ld = buildClinicReviewsJsonLd({
      clinic: CLINIC,
      stats: statsFor([5, 5, 4, 5, 4]),
      items: items(5),
    });
    expect(ld).not.toBeNull();
    const aggregate = ld!.aggregateRating as Record<string, unknown>;
    expect(aggregate['@type']).toBe('AggregateRating');
    expect(aggregate.ratingValue).toBe('4.6');
    expect(aggregate.reviewCount).toBe('5');
    expect(aggregate.bestRating).toBe('5');
    expect(aggregate.worstRating).toBe('1');
  });

  it('review nodes carry author, datePublished and reviewRating', () => {
    const ld = buildClinicReviewsJsonLd({ clinic: CLINIC, stats: statsFor([5, 5, 5, 5, 5]), items: items(5) });
    const review = (ld!.review as Array<Record<string, unknown>>)[0];
    expect(review['@type']).toBe('Review');
    expect((review.author as Record<string, unknown>)['@type']).toBe('Person');
    expect(review.datePublished).toBe('2026-10-20T10:00:00.000Z');
    expect((review.reviewRating as Record<string, unknown>).ratingValue).toBe('5');
  });

  it('caps JSON-LD review nodes at 10 even with more items', () => {
    const ld = buildClinicReviewsJsonLd({ clinic: CLINIC, stats: statsFor([5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5]), items: items(12) });
    expect((ld!.review as unknown[]).length).toBe(10);
  });
});

describe('buildAskReviewsJsonLd — clinic ≥5 / platform ≥20', () => {
  const clinics = [
    { name: 'عيادة وصلت', url: 'https://example.test/a' },
    { name: 'عيادة أقل', url: 'https://example.test/b' },
  ];

  it('clinics below threshold are excluded from the ItemList', () => {
    const ld = buildAskReviewsJsonLd({
      siteUrl: 'https://example.test',
      clinics,
      summaries: [statsFor([5, 5, 5, 4]), statsFor([5, 5, 5, 5])], // 4 / 4
      platform: summarizeRatings([]),
    });
    expect(ld).toBeNull(); // nothing qualified → no script at all
  });

  it('clinic ≥5 emits ItemList entry; platform <20 emits no Organization', () => {
    const ld = buildAskReviewsJsonLd({
      siteUrl: 'https://example.test',
      clinics,
      summaries: [statsFor([5, 5, 4, 5, 4]), null], // 5 ✓ / none
      platform: summarizeRatings(Array(19).fill(5)), // 19 < 20
    });
    expect(ld).not.toBeNull();
    const graph = ld!['@graph'] as Array<Record<string, unknown>>;
    expect(graph.some((n) => n['@type'] === 'Organization')).toBe(false);
    const itemList = graph.find((n) => n['@type'] === 'ItemList');
    expect(itemList).toBeDefined();
    const list = itemList!.itemListElement as Array<Record<string, unknown>>;
    expect(list.length).toBe(1);
    const item = (list[0].item ?? {}) as Record<string, unknown>;
    expect(item.name).toBe('عيادة وصلت');
    expect((item.aggregateRating as Record<string, unknown>).reviewCount).toBe('5');
  });

  it('platform ≥20 adds the Organization aggregateRating node', () => {
    const ld = buildAskReviewsJsonLd({
      siteUrl: 'https://example.test',
      clinics,
      summaries: [null, null],
      platform: summarizeRatings(Array(20).fill(4)), // 20 ✓
    });
    expect(ld).not.toBeNull();
    const graph = ld!['@graph'] as Array<Record<string, unknown>>;
    const org = graph.find((n) => n['@type'] === 'Organization') as Record<string, unknown>;
    expect(org).toBeDefined();
    expect((org.aggregateRating as Record<string, unknown>).reviewCount).toBe('20');
    expect(graph.some((n) => n['@type'] === 'ItemList')).toBe(false);
  });

  it('thresholds are the owner-decided constants', () => {
    expect(REVIEW_SCHEMA_THRESHOLD).toBe(5);
    expect(PLATFORM_SCHEMA_THRESHOLD).toBe(20);
  });
});
