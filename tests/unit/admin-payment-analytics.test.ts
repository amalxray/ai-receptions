import { describe, expect, it } from 'vitest';
import { summarizeAdminPayments } from '@/lib/services/adminPaymentAnalytics';

describe('summarizeAdminPayments', () => {
  it('subtracts refunds, ignores voided payments, and only returns platform-wide totals', () => {
    const analytics = summarizeAdminPayments(
      [
        {
          direction: 'payment',
          amount: '120.50',
          created_at: '2026-11-10T12:00:00.000Z',
          status: 'recorded',
          voided_at: null,
        },
        {
          direction: 'refund',
          amount: 20,
          created_at: '2026-11-12T12:00:00.000Z',
          status: 'recorded',
          voided_at: null,
        },
        {
          direction: 'payment',
          amount: 900,
          created_at: '2026-11-15T12:00:00.000Z',
          status: 'voided',
          voided_at: '2026-11-16T12:00:00.000Z',
        },
      ],
      new Date('2026-11-20T00:00:00.000Z'),
    );

    expect(analytics.payments_volume).toBe(100.5);
    expect(analytics.monthly_net_payments).toHaveLength(6);
    expect(analytics.monthly_net_payments.at(-1)).toEqual({ month: '2026-11', amount: 100.5 });
    expect(analytics).not.toHaveProperty('clinic_net_payments');
    expect(analytics).not.toHaveProperty('top_clinics_by_net_payments');
  });
});
