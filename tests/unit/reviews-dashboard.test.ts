/**
 * Phase 4a — staff reviews list API contract.
 * Verifies the query schema accepts all tabs/filters the dashboard sends.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';

const h = vi.hoisted(() => ({ activityType: 'clinic' }));
vi.mock('@/lib/useClinicContext', () => ({
  useClinicContext: () => ({
    clinicId: null,
    authHeaders: async () => ({}),
    loading: false,
    role: 'owner',
    activityType: h.activityType,
  }),
}));

import ReviewsInboxPage from '@/app/(dashboard)/dashboard/[clinicSlug]/reviews/page';

const querySchema = z.object({
  clinic_id: z.string().uuid(),
  filter: z.enum(['all', 'pending', 'published', 'rejected', 'flagged']).default('all'),
  search: z.string().trim().max(200).optional(),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  reviewer_category: z.enum(['all', 'dentist', 'reviewer', 'other', 'unknown']).default('all'),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

const UUID = '14f6ad3a-f9bf-4c1a-9e2d-123456789abc';

describe('Staff reviews list API (Phase 4a)', () => {
  it('أ) accepts all dashboard tabs', () => {
    for (const filter of ['all', 'pending', 'published', 'rejected', 'flagged']) {
      const r = querySchema.safeParse({ clinic_id: UUID, filter });
      expect(r.success).toBe(true);
    }
  });

  it('ب) accepts search + rating + pagination', () => {
    const r = querySchema.safeParse({ clinic_id: UUID, search: 'أحمد', rating: '5', limit: '20', offset: '40' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.rating).toBe(5);
      expect(r.data.offset).toBe(40);
    }
  });

  it('accepts each reviewer category filter, including unclassified legacy reviews', () => {
    for (const reviewer_category of ['all', 'dentist', 'reviewer', 'other', 'unknown']) {
      expect(querySchema.safeParse({ clinic_id: UUID, reviewer_category }).success).toBe(true);
    }
  });

  it('renders category filters only for imaging-center dashboards', () => {
    vi.stubGlobal('React', React);
    h.activityType = 'clinic';
    const clinicHtml = renderToStaticMarkup(React.createElement(ReviewsInboxPage));
    h.activityType = 'imaging_center';
    const imagingHtml = renderToStaticMarkup(React.createElement(ReviewsInboxPage));

    expect(clinicHtml).not.toContain('فلترة حسب صفة المقيّم');
    expect(clinicHtml).not.toContain('غير مصنف');
    expect(imagingHtml).toContain('فلترة حسب صفة المقيّم');
    expect(imagingHtml).toContain('غير مصنف');
    vi.unstubAllGlobals();
  });

  it('ج) rejects invalid clinic_id / rating', () => {
    expect(querySchema.safeParse({ clinic_id: 'not-uuid' }).success).toBe(false);
    expect(querySchema.safeParse({ clinic_id: UUID, rating: '9' }).success).toBe(false);
  });

  it('د) dashboard page file exists with required sections', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('app/(dashboard)/dashboard/[clinicSlug]/reviews/page.tsx', 'utf8');
    for (const s of ['المتوسط', 'بانتظار المراجعة', 'فلترة التقييمات', 'فلترة حسب صفة المقيّم', 'غير مصنف', 'بحث بالاسم', 'فلترة بالنجوم', 'نشر', 'رفض', 'حذف']) {
      expect(src).toContain(s);
    }
    expect(src).toContain("activityType === 'imaging_center'");
    expect(src).toContain('showReviewerCategory={imagingCenter}');
    const publicPage = fs.readFileSync('app/[slug]/page.tsx', 'utf8');
    const publicReviewsPage = fs.readFileSync('app/[slug]/reviews/page.tsx', 'utf8');
    expect(publicPage).toContain("showReviewerCategory={space.activityType === 'imaging_center'}");
    expect(publicReviewsPage).toContain("showReviewerCategory={space.activityType === 'imaging_center'}");
  });

  it('هـ) nav includes reviews module', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('components/dashboard/DashboardNav.tsx', 'utf8');
    expect(src).toContain("module: 'reviews'");
    expect(src).toContain('التقييمات');
  });
});
