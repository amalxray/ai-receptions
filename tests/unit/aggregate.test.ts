import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  searchClinics: vi.fn(),
  searchFoursquareClinics: vi.fn(),
  searchGeoapifyClinics: vi.fn(),
}));

vi.mock('@/lib/services/prospecting/openstreetmap', () => ({ searchClinics: mocks.searchClinics }));
vi.mock('@/lib/services/prospecting/foursquare', () => ({ searchFoursquareClinics: mocks.searchFoursquareClinics }));
vi.mock('@/lib/services/prospecting/geoapify', () => ({ searchGeoapifyClinics: mocks.searchGeoapifyClinics }));

import { fetchAllClinics } from '@/lib/services/prospecting/aggregate';

describe('fetchAllClinics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deduplicates by normalized phone and keeps the richer clinic', async () => {
    mocks.searchClinics.mockResolvedValue([
      {
        clinic_name: 'عيادة النور', city: 'نابلس', country: 'PS', phone: '+970 599 000 000', source: 'openstreetmap', source_id: 'osm:1', metadata: { tags: {} },
      },
      {
        clinic_name: 'مركز مستقل', city: 'نابلس', country: 'PS', source: 'openstreetmap', source_id: 'osm:2', metadata: { tags: {} },
      },
    ]);
    mocks.searchFoursquareClinics.mockResolvedValue([
      {
        clinic_name: 'Al Noor Clinic', city: 'نابلس', country: 'PS', phone: '+970-599-000-000', website: 'https://alnoor.example', source: 'foursquare', source_id: 'foursquare:1', metadata: { tags: {} },
      },
    ]);
    mocks.searchGeoapifyClinics.mockRejectedValue(new Error('quota exceeded'));

    const result = await fetchAllClinics('نابلس', 'PS');

    expect(result.clinics).toHaveLength(2);
    expect(result.clinics.find((clinic) => clinic.clinic_name === 'Al Noor Clinic')).toBeTruthy();
    expect(result.sources).toEqual([
      { name: 'Nominatim', count: 2 },
      { name: 'Foursquare', count: 1 },
      { name: 'Geoapify', count: 0, error: 'quota exceeded' },
    ]);
  });
});
