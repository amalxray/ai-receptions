import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const geocodeCity = vi.hoisted(() => vi.fn());
vi.mock('@/lib/services/prospecting/openstreetmap', () => ({ geocodeCity }));

import { searchGeoapifyClinics } from '@/lib/services/prospecting/geoapify';

describe('searchGeoapifyClinics', () => {
  beforeEach(() => {
    process.env.GEOAPIFY_API_KEY = 'test-geoapify-key';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GEOAPIFY_API_KEY;
    geocodeCity.mockReset();
  });

  it('maps Geoapify features into prospect clinics', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        features: [{
          properties: {
            place_id: 'geo-1',
            name: 'مركز بسمة',
            formatted: 'شارع القدس، رام الله',
            contact: {
              phone: '+970 599 111 111',
              website: 'https://basma.example',
              email: 'info@basma.example',
            },
          },
          geometry: { coordinates: [35.2, 31.9] },
        }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const clinics = await searchGeoapifyClinics('رام الله', 'PS');

    expect(clinics).toHaveLength(1);
    expect(clinics[0]).toMatchObject({
      clinic_name: 'مركز بسمة',
      phone: '+970 599 111 111',
      email: 'info@basma.example',
      website: 'https://basma.example',
      source: 'geoapify',
      source_id: 'geoapify:geo-1',
      metadata: { latitude: 31.9, longitude: 35.2 },
    });
    const requestUrl = new URL(fetchMock.mock.calls[0][0]);
    expect(requestUrl.searchParams.get('categories')).toContain('healthcare.dentist');
    expect(requestUrl.searchParams.get('apiKey')).toBe('test-geoapify-key');
  });
});
