import { describe, expect, it } from 'vitest';
import { summarizeAdminPayments } from '@/lib/services/adminPaymentAnalytics';

describe('summarizeAdminPayments', () => {
  it('subtracts refunds, ignores voided payments, and aggregates clinic and monthly net amounts', () => {
    const analytics = summarizeAdminPayments(
      [
        {
          clinic_id: 'clinic-a',
          direction: 'payment',
          amount: '120.50',
          created_at: '2026-11-10T12:00:00.000Z',
          status: 'recorded',
          voided_at: null,
        },
        {
          clinic_id: 'clinic-a',
          direction: 'refund',
          amount: 20,
          created_at: '2026-11-12T12:00:00.000Z',
          status: 'recorded',
          voided_at: null,
        },
        {
          clinic_id: 'clinic-b',
          direction: 'payment',
          amount: 900,
          created_at: '2026-11-15T12:00:00.000Z',
          status: 'voided',
          voided_at: '2026-11-16T12:00:00.000Z',
        },
      ],
      [
        { id: 'clinic-a', name: 'عيادة أ', slug: 'clinic-a' },
        { id: 'clinic-b', name: 'عيادة ب', slug: 'clinic-b' },
      ],
      new Date('2026-11-20T00:00:00.000Z'),
    );

    expect(analytics.payments_volume).toBe(100.5);
    expect(analytics.monthly_net_payments).toHaveLength(6);
    expect(analytics.monthly_net_payments.at(-1)).toEqual({ month: '2026-11', amount: 100.5 });
    expect(analytics.clinic_net_payments).toEqual([
      { clinic_id: 'clinic-a', clinic_name: 'عيادة أ', clinic_slug: 'clinic-a', amount: 100.5 },
      { clinic_id: 'clinic-b', clinic_name: 'عيادة ب', clinic_slug: 'clinic-b', amount: 0 },
    ]);
    expect(analytics.top_clinics_by_net_payments).toEqual(analytics.clinic_net_payments);
  });
});
