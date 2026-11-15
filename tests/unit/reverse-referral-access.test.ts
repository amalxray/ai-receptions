import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  reads: {} as Record<string, Array<{ data: unknown; error: unknown }>>,
  authorizeClinicRequest: vi.fn(),
  roleDenied: vi.fn(() => null),
}));

vi.mock('@/lib/services/clinicAuthorization', () => ({
  authorizeClinicRequest: mocks.authorizeClinicRequest,
  DATA_ROLES: ['owner', 'manager', 'doctor', 'receptionist', 'staff'],
  roleDenied: mocks.roleDenied,
}));

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        is: () => builder,
        or: () => builder,
        limit: () => builder,
        maybeSingle: async () => mocks.reads[table]?.shift() ?? { data: null, error: null },
      };
      return builder;
    },
  },
}));

import { authorizeReverseReferral } from '@/lib/services/reverseReferrals';

const CENTER = '11111111-1111-1111-1111-111111111111';
const CLINIC = '22222222-2222-2222-2222-222222222222';

describe('authorizeReverseReferral', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const table of Object.keys(mocks.reads)) delete mocks.reads[table];
    mocks.authorizeClinicRequest.mockResolvedValue({
      authorized: true,
      role: 'owner',
      user: { id: 'user-1' },
    });
  });

  it('allows a center member to transfer only to a linked clinic', async () => {
    mocks.reads.clinics = [
      { data: { id: CENTER, activity_type: 'imaging_center' }, error: null },
      { data: { id: CLINIC, activity_type: 'clinic' }, error: null },
    ];
    mocks.reads.organization_relationships = [{ data: { id: 'relationship-1' }, error: null }];

    const result = await authorizeReverseReferral(
      new Request('https://example.com'),
      CENTER,
      CLINIC,
    );

    expect(result.ok).toBe(true);
    expect(mocks.authorizeClinicRequest).toHaveBeenCalledWith(expect.any(Request), CENTER);
  });

  it('denies a clinic that has no accepted relationship', async () => {
    mocks.reads.clinics = [
      { data: { id: CENTER, activity_type: 'imaging_center' }, error: null },
      { data: { id: CLINIC, activity_type: 'clinic' }, error: null },
    ];
    mocks.reads.organization_relationships = [{ data: null, error: null }];

    const result = await authorizeReverseReferral(
      new Request('https://example.com'),
      CENTER,
      CLINIC,
    );

    expect(result).toEqual({ ok: false, status: 403 });
  });

  it('denies a source organization that is not an imaging center', async () => {
    mocks.reads.clinics = [
      { data: { id: CENTER, activity_type: 'clinic' }, error: null },
      { data: { id: CLINIC, activity_type: 'clinic' }, error: null },
    ];
    mocks.reads.organization_relationships = [{ data: { id: 'relationship-1' }, error: null }];

    const result = await authorizeReverseReferral(
      new Request('https://example.com'),
      CENTER,
      CLINIC,
    );

    expect(result).toEqual({ ok: false, status: 403 });
  });
});
