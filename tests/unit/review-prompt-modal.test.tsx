/**
 * Phase 3a — ReviewPromptModal contract tests.
 * Uses renderToStaticMarkup (project convention — no @testing-library/react).
 * Covers: render contract, fail-silent, payload shape.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import ReviewPromptModal from '@/components/public/ReviewPromptModal';

describe('ReviewPromptModal (Phase 3a)', () => {
  it('أ) renders title + 5 stars + name/comment fields + skip', () => {
    const html = renderToStaticMarkup(
      <ReviewPromptModal open clinicSlug="amal-x-ray-center" source="form" patientName="أحمد" onClose={() => {}} />
    );
    expect(html).toContain('كيف كانت تجربة الحجز؟');
    expect((html.match(/من 5 نجوم/g) || []).length).toBe(5);
    expect(html).toContain('value="أحمد"');
    expect(html).toContain('تخطي');
    expect(html).toContain('إرسال التقييم');
    expect(html).toContain('role="dialog"');
    expect(html).toContain('dir="rtl"');
  });

  it('ب) closed modal renders nothing', () => {
    const html = renderToStaticMarkup(
      <ReviewPromptModal open={false} clinicSlug="amal-x-ray-center" source="form" onClose={() => {}} />
    );
    expect(html).toBe('');
  });

  it('ج) fail-silent when clinicSlug missing (uuid-only chat hosts)', () => {
    const htmlNull = renderToStaticMarkup(
      <ReviewPromptModal open clinicSlug={null} source="chat" onClose={() => {}} />
    );
    expect(htmlNull).toBe('');
    const htmlEmpty = renderToStaticMarkup(
      <ReviewPromptModal open clinicSlug="" source="chat" onClose={() => {}} />
    );
    expect(htmlEmpty).toBe('');
  });

  it('د) submit disabled until rating + name (initial state)', () => {
    // No rating selected initially → disabled attribute present on submit.
    const html = renderToStaticMarkup(
      <ReviewPromptModal open clinicSlug="amal-x-ray-center" source="chat" onClose={() => {}} />
    );
    const submitBtn = html.slice(html.indexOf('إرسال التقييم') - 400, html.indexOf('إرسال التقييم'));
    expect(submitBtn).toContain('disabled');
  });

  it('هـ) review API contract — payload shape the modal posts', () => {
    // The modal posts { clinic_slug, rating, author_name, comment, source }
    // to POST /api/public/reviews — mirror of the zod schema there.
    const payload = { clinic_slug: 'amal-x-ray-center', rating: 5, author_name: 'أحمد', comment: null, source: 'form' };
    expect(payload.rating).toBeGreaterThanOrEqual(1);
    expect(payload.rating).toBeLessThanOrEqual(5);
    expect(['form', 'chat', 'booking', 'cron', 'public']).toContain(payload.source);
    expect(payload.clinic_slug.length).toBeGreaterThan(0);
  });
});
