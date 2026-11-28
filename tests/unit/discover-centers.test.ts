import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDiscoverEntries } from '@/lib/services/discoverDirectory';
import { getDiscoveryEntries } from '@/lib/services/doctorPublicProfile';

const mockState = vi.hoisted(() => ({
  rows: {} as Record<string, any[]>,
  doctorResult: {
    entries: [
      {
        kind: 'doctor',
        slug: 'dr-example',
        name: 'د. مثال',
        specialty: 'تقويم',
        title: null,
        photo_url: null,
        clinicName: 'عيادة مثال',
        clinicSlug: 'example-clinic',
        city: 'نابلس',
        area: null,
      },
    ],
    total: 1,
    page: 1,
    pageSize: 20,
    totalPages: 1,
  } as any,
}));

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => {
      const filters: {
        is: Array<[string, unknown]>;
        in: Array<[string, unknown[]]>;
        eq: Array<[string, unknown]>;
      } = { is: [], in: [], eq: [] };
      const chain: any = {};
      chain.select = () => chain;
      chain.is = (column: string, value: unknown) => {
        filters.is.push([column, value]);
        return chain;
      };
      chain.in = (column: string, values: unknown[]) => {
        filters.in.push([column, values]);
        return chain;
      };
      chain.eq = (column: string, value: unknown) => {
        filters.eq.push([column, value]);
        return chain;
      };
      chain.order = () => chain;
      chain.limit = () => chain;
      chain.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => {
        let rows = [...(mockState.rows[table] ?? [])];
        for (const [column, value] of filters.is) {
          rows = rows.filter((row) => (row[column] ?? null) === value);
        }
        for (const [column, values] of filters.in) {
          rows = rows.filter((row) => values.includes(row[column]));
        }
        for (const [column, value] of filters.eq) {
          rows = rows.filter((row) => row[column] === value);
        }
        return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
      };
      return chain;
    }),
  },
}));

vi.mock('@/lib/services/doctorPublicProfile', () => ({
  getDiscoveryEntries: vi.fn(async () => mockState.doctorResult),
}));

function centerRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'center-1',
    name: 'مركز الأشعة',
    slug: 'imaging-center',
    activity_type: 'imaging_center',
    city: 'نابلس',
    area: null,
    address_detail: 'شارع المثال',
    phone: '+9700000000',
    settings: {
      public_profile: {
        discovery_enabled: true,
        show_phone: true,
        description: 'مركز تصوير وأشعة الأسنان',
      },
    },
    deleted_at: null,
    ...overrides,
  };
}

function subscriptionRow(clinicId: string, status: string, updatedAt = '2026-11-01') {
  return { clinic_id: clinicId, status, updated_at: updatedAt, deleted_at: null };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockState.rows = {
    clinics: [centerRow()],
    subscriptions: [subscriptionRow('center-1', 'active')],
    clinic_public_media: [
      {
        clinic_id: 'center-1',
        media_type: 'image',
        public_url: 'https://images.example.com/center.jpg',
        enabled: true,
      },
    ],
  };
});

describe('discover directory centers', () => {
  it('returns doctors and eligible centers in separate collections', async () => {
    const result = await getDiscoverEntries();

    expect(result.doctors[0].kind).toBe('doctor');
    expect(result.centers).toHaveLength(1);
    expect(result.centers[0]).toMatchObject({
      kind: 'center',
      id: 'center-1',
      name: 'مركز الأشعة',
      slug: 'imaging-center',
      activityType: 'imaging_center',
      city: 'نابلس',
      address: 'شارع المثال',
      phone: '+9700000000',
      description: 'مركز تصوير وأشعة الأسنان',
      images: ['https://images.example.com/center.jpg'],
    });
  });

  it('requires discovery opt-in and an active or trialing subscription', async () => {
    mockState.rows.clinics = [
      centerRow(),
      centerRow({
        id: 'opted-out',
        slug: 'opted-out',
        settings: { public_profile: { discovery_enabled: false } },
      }),
      centerRow({ id: 'past-due', slug: 'past-due' }),
      centerRow({ id: 'trialing', slug: 'trialing', activity_type: 'dental_lab' }),
    ];
    mockState.rows.subscriptions = [
      subscriptionRow('center-1', 'active'),
      subscriptionRow('opted-out', 'active'),
      subscriptionRow('past-due', 'past_due'),
      subscriptionRow('trialing', 'trialing'),
    ];

    const result = await getDiscoverEntries();

    expect(result.centers.map((center) => center.id)).toEqual(['center-1', 'trialing']);
  });

  it('does not return soft-deleted centers', async () => {
    mockState.rows.clinics = [centerRow({ deleted_at: '2026-11-20T00:00:00Z' })];

    const result = await getDiscoverEntries();

    expect(result.centers).toEqual([]);
  });

  it('returns an empty center collection when no eligible centers exist', async () => {
    mockState.rows.clinics = [];
    mockState.rows.subscriptions = [];

    const result = await getDiscoverEntries();

    expect(result.centers).toEqual([]);
    expect(result.doctors).toHaveLength(1);
  });

  it('passes the shared filters to the doctor query and applies them to centers', async () => {
    const filters = { q: 'مركز', specialty: 'imaging_center', city: 'نابلس' };

    const result = await getDiscoverEntries(filters);

    expect(getDiscoveryEntries).toHaveBeenCalledWith(filters);
    expect(result.centers).toHaveLength(1);
  });

  it('does not expose phone numbers unless the public profile enables them', async () => {
    mockState.rows.clinics = [
      centerRow({ settings: { public_profile: { discovery_enabled: true, show_phone: false } } }),
    ];

    const result = await getDiscoverEntries();

    expect(result.centers[0].phone).toBeNull();
  });
});
