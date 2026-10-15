import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import ReviewsSection from '@/components/public/ReviewsSection';
import type { ReviewStats } from '@/lib/services/reviewsService';

const stats6: ReviewStats = { total: 6, average: 4.5, distribution: { 1: 0, 2: 0, 3: 1, 4: 1, 5: 4 } };
const stats3: ReviewStats = { total: 3, average: 4.0, distribution: { 1: 0, 2: 0, 3: 1, 4: 1, 5: 1 } };

describe('ReviewsSection view-all link (Phase 3b)', () => {
  it('أ) shows "عرض كل التقييمات" when total > 5 and href given', () => {
    const html = renderToStaticMarkup(
      <ReviewsSection clinicName="عيادة" stats={stats6} items={[]} viewAllHref="/amal/reviews" />
    );
    expect(html).toContain('عرض كل التقييمات (6)');
    expect(html).toContain('href="/amal/reviews"');
  });

  it('ب) hides the link when total <= 5', () => {
    const html = renderToStaticMarkup(
      <ReviewsSection clinicName="عيادة" stats={stats3} items={[]} viewAllHref="/amal/reviews" />
    );
    expect(html).not.toContain('عرض كل التقييمات');
  });

  it('ج) hides the link on the full page (hideViewAll)', () => {
    const html = renderToStaticMarkup(
      <ReviewsSection clinicName="عيادة" stats={stats6} items={[]} viewAllHref="/amal/reviews" hideViewAll />
    );
    expect(html).not.toContain('عرض كل التقييمات');
  });

  it('د) no link without href (backward compatible — existing callers)', () => {
    const html = renderToStaticMarkup(<ReviewsSection clinicName="عيادة" stats={stats6} items={[]} />);
    expect(html).not.toContain('عرض كل التقييمات');
  });
});
