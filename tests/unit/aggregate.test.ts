import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  searchClinics: vi.fn(),
  searchFoursquareClinics: vi.fn(),
  searchGeoapifyClinics: vi.fn(),
}));

vi.mock('@/lib/services/prospecting/openstreetmap', () => ({ searchClinics: mocks.searchClinics }));
vi.mock('@/lib/services/prospecting/foursquare', () => ({ searchFoursquareClinics: mocks.searchFoursquareClinics }));
vi.mock('@/lib/services/prospecting/geoapify', () => ({ searchGeoapifyClinics: mocks.searchGeoapifyClinics }));

import {
  countryMatchesPhone,
  fetchAllClinics,
  isDentalRelevant,
} from '@/lib/services/prospecting/aggregate';

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
      { name: 'PhoneFilter', count: 0, filtered: 0 },
    ]);
  });

  it('rejects Hebrew, excluded, and contactless entries', () => {
    const base = { city: 'نابلس', country: 'PS', source: 'openstreetmap' as const, source_id: 'x', metadata: { tags: {} } };
    expect(isDentalRelevant({ ...base, clinic_name: 'מרפאת שיניים', phone: '0599000000' })).toBe(false);
    expect(isDentalRelevant({ ...base, clinic_name: 'مستشفى النور', phone: '0599000000' })).toBe(false);
    expect(isDentalRelevant({ ...base, clinic_name: 'عيادة أسنان', phone: null })).toBe(false);
    expect(isDentalRelevant({ ...base, clinic_name: 'عيادة أسنان', phone: '0599000000' })).toBe(true);
  });

  it('filters international and local mobile prefixes that conflict with the selected country', () => {
    const clinics = [
      {
        clinic_name: 'Amman Dental Center', city: 'عمّان', country: 'JO', phone: '+962 6 555 0100',
        source: 'foursquare' as const, source_id: 'foursquare:jo', metadata: { tags: { 'foursquare:categories': '15014' } },
      },
      {
        clinic_name: 'New York Dental', city: 'عمّان', country: 'JO', phone: '+1-212-555-0100',
        source: 'foursquare' as const, source_id: 'foursquare:us', metadata: { tags: { 'foursquare:categories': '15014' } },
      },
      {
        clinic_name: 'Amman Mobile Dentist', city: 'عمّان', country: 'JO', phone: '079 123 4567',
        source: 'foursquare' as const, source_id: 'foursquare:jo-local', metadata: { tags: { 'foursquare:categories': '15014' } },
      },
      {
        clinic_name: 'Local Landline Dentist', city: 'عمّان', country: 'JO', phone: '06 555 0100',
        source: 'foursquare' as const, source_id: 'foursquare:landline', metadata: { tags: { 'foursquare:categories': '15014' } },
      },
      {
        clinic_name: 'No Phone Dental', city: 'عمّان', country: 'JO', website: 'https://no-phone.example',
        source: 'foursquare' as const, source_id: 'foursquare:no-phone', metadata: { tags: { 'foursquare:categories': '15014' } },
      },
    ];
    mocks.searchClinics.mockResolvedValue([]);
    mocks.searchFoursquareClinics.mockResolvedValue(clinics);
    mocks.searchGeoapifyClinics.mockResolvedValue([]);

    return fetchAllClinics('عمّان', 'JO').then((result) => {
      expect(result.clinics.map((clinic) => clinic.source_id)).toEqual([
        'foursquare:jo',
        'foursquare:jo-local',
        'foursquare:landline',
        'foursquare:no-phone',
      ]);
      expect(result.sources.at(-1)).toEqual({ name: 'PhoneFilter', count: 0, filtered: 1 });
    });
  });
});

describe('countryMatchesPhone', () => {
  it.each([
    ['JO', '+962 79 123 4567', true],
    ['JO', '00962 79 123 4567', true],
    ['JO', '07 7218 2373', true],
    ['JO', '0791234567', true],
    ['JO', '02 5555 1234', true],
    ['JO', '03 5555 1234', true],
    ['JO', '05 5555 1234', true],
    ['JO', '+1-212-555-0100', false],
    ['JO', '+1-646-484-0197', false],
    ['JO', '+1-212-883-9030', false],
    ['JO', '1-646-484-0197', false],
    ['JO', '001 646 484 0197', false],
    ['PS', '+1 646-484-0197', false],
    ['JO', '+44 20 7946 0100', false],
    ['JO', '+49 30 123456', false],
    ['JO', '+33 1 23 45 67 89', false],
    ['JO', '+86 10 1234 5678', false],
    ['JO', '+7 495 123-45-67', false],
    ['JO', '+90 212 555 01 00', false],
    ['JO', '+212 612 345 678', false],
    ['JO', '+213 555 123 456', false],
    ['JO', '+216 20 123 456', false],
    ['JO', '+218 91 234 5678', false],
    ['JO', '212-555-1234', false],
    ['JO', '12345', true],
    ['JO', '+970 59 123 4567', false],
    ['JO', '+962 79 123 4567', true],
    ['JO', '059 123 4567', true],
    ['PS', '+970 59 123 4567', true],
    ['PS', '+972 59 123 4567', false],
    ['MA', '+212 612 345 678', true],
    ['PS', '00970 59 123 4567', true],
    ['PS', '059 123 4567', true],
    ['PS', '02 555 1234', true],
    ['PS', '04 555 1234', true],
    ['PS', '08 555 1234', true],
    ['PS', '09 555 1234', true],
    ['PS', '+962 79 123 4567', false],
    ['PS', '079 123 4567', true],
    ['SA', '+966 55 123 4567', true],
    ['SA', '00966 55 123 4567', true],
    ['SA', '+1-212-555-0100', false],
    ['AE', '+971 50 123 4567', true],
    ['AE', '00971 50 123 4567', true],
    ['US', '+1-212-555-0100', true],
    ['CA', '+1-416-555-0100', true],
    ['UK', '+44 20 7946 0100', true],
    ['JO', '+20 2 5555 0100', false],
    ['JO', '+999 1234567', true],
  ])('matches %s and %s -> %s', (country, phone, expected) => {
    expect(countryMatchesPhone(country, phone)).toBe(expected);
  });

  it('accepts absent numbers', () => {
    expect(countryMatchesPhone('JO', null)).toBe(true);
    expect(countryMatchesPhone('JO', '   ')).toBe(true);
  });
});
