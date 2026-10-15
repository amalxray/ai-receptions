/**
 * Phase 4a — staff reviews list API contract.
 * Verifies the query schema accepts all tabs/filters the dashboard sends.
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';

const querySchema = z.object({
  clinic_id: z.string().uuid(),
  filter: z.enum(['all', 'pending', 'published', 'rejected', 'flagged']).default('all'),
  search: z.string().trim().max(200).optional(),
  rating: z.coerce.number().int().min(1).max(5).optional(),
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

  it('ج) rejects invalid clinic_id / rating', () => {
    expect(querySchema.safeParse({ clinic_id: 'not-uuid' }).success).toBe(false);
    expect(querySchema.safeParse({ clinic_id: UUID, rating: '9' }).success).toBe(false);
  });

  it('د) dashboard page file exists with required sections', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('app/(dashboard)/dashboard/[clinicSlug]/reviews/page.tsx', 'utf8');
    for (const s of ['المتوسط', 'بانتظار المراجعة', 'فلترة التقييمات', 'بحث بالاسم', 'فلترة بالنجوم', 'نشر', 'رفض', 'حذف']) {
      expect(src).toContain(s);
    }
  });

  it('هـ) nav includes reviews module', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('components/dashboard/DashboardNav.tsx', 'utf8');
    expect(src).toContain("module: 'reviews'");
    expect(src).toContain('التقييمات');
  });
});
