import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import BookingFollowUpCard from '@/components/public/BookingFollowUpCard';

beforeAll(() => vi.stubGlobal('React', React));
afterAll(() => vi.unstubAllGlobals());

const booking = {
  appointmentId: 'appointment-123',
  appointmentDate: '2026-10-31 — 19:00',
  clinicId: 'clinic-123',
  clinicName: 'مركز أمل',
  clinicPhone: '+962 6 555 1234',
  clinicSlug: 'amal-x-ray-center',
  patientName: 'سارة أحمد',
  serviceName: 'تصوير بانوراما',
};

describe('BookingFollowUpCard', () => {
  it('shows review and calendar actions while checking Google account status', () => {
    const markup = renderToStaticMarkup(createElement(BookingFollowUpCard, booking));

    expect(markup).toContain('⭐ قيّم تجربتك');
    expect(markup).toContain('📅 أضف إلى Google Calendar');
    expect(markup).toContain('جارٍ التحقق من حالة تسجيل الدخول');
    expect(markup).toContain('appointment-123');
    expect(markup).toContain('target="_blank"');
  });

  it('omits the review action when a clinic slug is unavailable', () => {
    const markup = renderToStaticMarkup(createElement(BookingFollowUpCard, {
      ...booking,
      clinicSlug: null,
    }));

    expect(markup).not.toContain('قيّم تجربتك');
    expect(markup).toContain('أضف إلى Google Calendar');
  });
});
