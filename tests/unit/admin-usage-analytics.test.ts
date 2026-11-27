import { describe, expect, it } from 'vitest';
import { summarizeClinicUsage } from '@/lib/services/adminUsageAnalytics';

describe('summarizeClinicUsage', () => {
  it('returns per-clinic activity counts without financial fields', () => {
    const usage = summarizeClinicUsage(
      [
        { id: 'clinic-a', name: 'عيادة أ', slug: 'clinic-a' },
        { id: 'clinic-b', name: 'عيادة ب', slug: 'clinic-b' },
      ],
      [{ clinic_id: 'clinic-a' }, { clinic_id: 'clinic-a' }],
      [{ clinic_id: 'clinic-a' }],
      [{ clinic_id: 'clinic-b' }],
    );

    expect(usage).toEqual([
      {
        clinic_id: 'clinic-a',
        clinic_name: 'عيادة أ',
        clinic_slug: 'clinic-a',
        patient_count: 2,
        appointment_count: 1,
        ai_message_count: 0,
      },
      {
        clinic_id: 'clinic-b',
        clinic_name: 'عيادة ب',
        clinic_slug: 'clinic-b',
        patient_count: 0,
        appointment_count: 0,
        ai_message_count: 1,
      },
    ]);
    expect(JSON.stringify(usage)).not.toMatch(/amount|payment|revenue|إيراد|مدفوعات/i);
  });
});
