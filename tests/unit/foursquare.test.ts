import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { searchFoursquareClinics } from '@/lib/services/prospecting/foursquare';

describe('searchFoursquareClinics', () => {
  beforeEach(() => {
    process.env.FOURSQUARE_API_KEY = 'test-foursquare-key';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.FOURSQUARE_API_KEY;
  });

  it('maps Foursquare places into prospect clinics', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        results: [{
          fsq_id: 'fsq-1',
          name: 'عيادة النور',
          location: { formatted: 'شارع الجامعة، نابلس' },
          tel: '+970 599 000 000',
          website: 'https://alnoor.example',
          email: 'info@alnoor.example',
        }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const clinics = await searchFoursquareClinics('نابلس', 'PS');

    expect(clinics).toHaveLength(1);
    expect(clinics[0]).toMatchObject({
      clinic_name: 'عيادة النور',
      phone: '+970 599 000 000',
      email: 'info@alnoor.example',
      website: 'https://alnoor.example',
      source: 'foursquare',
      source_id: 'foursquare:fsq-1',
    });
    const requestUrl = new URL(fetchMock.mock.calls[0][0]);
    expect(requestUrl.searchParams.get('categories')).toBe('15014');
    expect(requestUrl.searchParams.get('limit')).toBe('50');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('test-foursquare-key');
  });
});
