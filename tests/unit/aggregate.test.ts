import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  searchClinics: vi.fn(),
  searchFoursquareClinics: vi.fn(),
  searchGeoapifyClinics: vi.fn(),
}));

vi.mock('@/lib/services/prospecting/openstreetmap', () => ({ searchClinics: mocks.searchClinics }));
vi.mock('@/lib/services/prospecting/foursquare', () => ({ searchFoursquareClinics: mocks.searchFoursquareClinics }));
vi.mock('@/lib/services/prospecting/geoapify', () => ({ searchGeoapifyClinics: mocks.searchGeoapifyClinics }));

import { fetchAllClinics, isDentalRelevant } from '@/lib/services/prospecting/aggregate';

describe('fetchAllClinics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deduplicates by normalized phone, keeps the richer clinic, and filters irrelevant names', async () => {
    mocks.searchClinics.mockResolvedValue([
      {
        clinic_name: 'عيادة النور', city: 'نابلس', country: 'PS', phone: '+970 599 000 000', source: 'openstreetmap', source_id: 'osm:1', metadata: { tags: {} },
      },
      {
        clinic_name: 'مركز مستقل', city: 'نابلس', country: 'PS', source: 'openstreetmap', source_id: 'osm:2', metadata: { tags: {} },
      },
      {
        clinic_name: 'مستشفى عام', city: 'نابلس', country: 'PS', phone: '0599000001', source: 'openstreetmap', source_id: 'osm:3', metadata: { tags: {} },
      },
    ]);
    mocks.searchFoursquareClinics.mockResolvedValue([
      {
        clinic_name: 'Al Noor Clinic', city: 'نابلس', country: 'PS', phone: '+970-599-000-000', website: 'https://alnoor.example', source: 'foursquare', source_id: 'foursquare:1', metadata: { tags: { 'foursquare:categories': '15014' } },
      },
    ]);
    mocks.searchGeoapifyClinics.mockRejectedValue(new Error('quota exceeded'));

    const result = await fetchAllClinics('نابلس', 'PS');

    expect(result.clinics).toHaveLength(1);
    expect(result.clinics.find((clinic) => clinic.clinic_name === 'Al Noor Clinic')).toBeTruthy();
    expect(result.sources).toEqual([
      { name: 'Nominatim', count: 3 },
      { name: 'Foursquare', count: 1 },
      { name: 'Geoapify', count: 0, error: 'quota exceeded' },
    ]);
  });

  it('rejects Hebrew, excluded, and contactless entries', () => {
    const base = { city: 'نابلس', country: 'PS', source: 'openstreetmap' as const, source_id: 'x', metadata: { tags: {} } };
    expect(isDentalRelevant({ ...base, clinic_name: 'מרפאת שיניים', phone: '0599000000' })).toBe(false);
    expect(isDentalRelevant({ ...base, clinic_name: 'مستشفى النور', phone: '0599000000' })).toBe(false);
    expect(isDentalRelevant({ ...base, clinic_name: 'عيادة أسنان', phone: null })).toBe(false);
    expect(isDentalRelevant({ ...base, clinic_name: 'عيادة أسنان', phone: '0599000000' })).toBe(true);
  });
});
