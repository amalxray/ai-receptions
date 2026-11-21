import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: {} }));
vi.mock('@/lib/services/clinicServiceCatalog', () => ({ resolveCanonicalServiceIds: vi.fn() }));
vi.mock('@/lib/server/logging', () => ({ logEvent: vi.fn() }));

import { calculateImagingCollected } from '@/lib/services/imagingCollections';

describe('imaging-only net collections', () => {
  it('subtracts recorded refunds and excludes voided, mixed, non-imaging, and out-of-range payments', () => {
    const result = calculateImagingCollected(
      [
        { invoice_id: 'imaging', amount: 800, direction: 'payment', status: 'recorded', created_at: '2026-03-05T10:00:00Z' },
        { invoice_id: 'imaging', amount: 200, direction: 'refund', status: 'recorded', created_at: '2026-03-18T10:00:00Z' },
        { invoice_id: 'imaging', amount: 500, direction: 'payment', status: 'voided', created_at: '2026-03-20T10:00:00Z' },
        { invoice_id: 'mixed', amount: 900, direction: 'payment', status: 'recorded', created_at: '2026-03-10T10:00:00Z' },
        { invoice_id: 'other', amount: 700, direction: 'payment', status: 'recorded', created_at: '2026-03-10T10:00:00Z' },
        { invoice_id: 'imaging', amount: 400, direction: 'payment', status: 'recorded', created_at: '2026-02-28T10:00:00Z' },
      ],
      [
        { invoice_id: 'imaging', service_id: 'image-service' },
        { invoice_id: 'mixed', service_id: 'image-service' },
        { invoice_id: 'mixed', service_id: 'other-service' },
        { invoice_id: 'other', service_id: 'other-service' },
      ],
      new Set(['image-service']),
      { fromMonth: '2026-03-01', toMonth: '2026-03-01' },
      'UTC',
    );

    expect(result).toBe(600);
  });

  it('uses the clinic timezone when assigning the payment date to a month', () => {
    const result = calculateImagingCollected(
      [
        { invoice_id: 'imaging', amount: 800, direction: 'payment', status: 'recorded', created_at: '2026-03-01T01:00:00Z' },
      ],
      [{ invoice_id: 'imaging', service_id: 'image-service' }],
      new Set(['image-service']),
      { fromMonth: '2026-02-01', toMonth: '2026-02-01' },
      'America/Los_Angeles',
    );

    expect(result).toBe(800);
  });
});
