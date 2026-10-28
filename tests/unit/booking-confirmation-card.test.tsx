import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import BookingConfirmationCard from '@/components/public/BookingConfirmationCard';

beforeAll(() => vi.stubGlobal('React', React));
afterAll(() => vi.unstubAllGlobals());

const booking = {
  appointmentId: 'appointment-1',
  serviceName: 'بانوراما',
  appointmentDate: '2026-10-28 — 10:00',
  patientName: 'سارة أحمد',
};

describe('BookingConfirmationCard status labels', () => {
  it('shows a pending label and the submitted patient name for a tentative booking', () => {
    const markup = renderToStaticMarkup(createElement(BookingConfirmationCard, {
      ...booking,
      appointmentStatus: 'tentative',
    }));

    expect(markup).toContain('تم استلام طلب الحجز');
    expect(markup).toContain('سارة أحمد');
    expect(markup).not.toContain('تم تأكيد الحجز');
  });

  it('keeps the current confirmed label when no status is passed (chat compatibility)', () => {
    const markup = renderToStaticMarkup(createElement(BookingConfirmationCard, booking));

    expect(markup).toContain('تم تأكيد الحجز');
  });
});
