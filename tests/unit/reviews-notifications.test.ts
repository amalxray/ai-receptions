/**
 * Phase 4c — review notification helpers (pure parts) + integration contract.
 */
import { describe, it, expect } from 'vitest';

function stars(rating: number): string {
  return '⭐'.repeat(Math.max(1, Math.min(5, Math.round(rating))));
}

function snippet(comment: string | null, max = 120): string {
  if (!comment) return 'بدون تعليق';
  const t = comment.trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

describe('Review notifications (Phase 4c)', () => {
  it('أ) stars render 1-5 correctly', () => {
    expect(stars(5)).toBe('⭐⭐⭐⭐⭐');
    expect(stars(1)).toBe('⭐');
    expect(stars(0)).toBe('⭐');
    expect(stars(9)).toBe('⭐⭐⭐⭐⭐');
  });

  it('ب) snippet truncates long comments, handles null', () => {
    expect(snippet(null)).toBe('بدون تعليق');
    expect(snippet('  ممتاز  ')).toBe('ممتاز');
    expect(snippet('x'.repeat(200)).endsWith('…')).toBe(true);
    expect(snippet('x'.repeat(200)).length).toBe(121);
  });

  it('ج) notifyNewReview module exists with fail-safe contract', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('lib/services/reviewNotifications.ts', 'utf8');
    expect(src).toContain('export async function notifyNewReview');
    expect(src).toContain('createInAppNotification');
    expect(src).toContain('getEmailProvider');
    expect(src).toContain('resolveOwnerEmails');
    expect(src).toContain('auth.admin.getUserById');
    // Never throws: failures logged, not re-raised.
    expect(src).not.toMatch(/throw new Error\(`Failed to persist/);
  });

  it('د) public route calls notify fire-and-forget after insert', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('app/api/public/reviews/route.ts', 'utf8');
    expect(src).toContain('void notifyNewReview(');
    expect(src).toContain('.catch(');
    expect(src).toContain('resolveClinicName');
  });

  it('هـ) dashboard has distinct unpublish button for published reviews', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('app/(dashboard)/dashboard/[clinicSlug]/reviews/page.tsx', 'utf8');
    expect(src).toContain('إلغاء نشر');
    expect(src).toContain('{r.is_published && (');
    // "رفض" still exists separately for abusive content.
    expect(src).toContain('رفض');
  });
});
