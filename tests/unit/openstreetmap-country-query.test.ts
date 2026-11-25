import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { geocodeCity } from '@/lib/services/prospecting/openstreetmap';

const fetchMock = vi.fn();

describe('Nominatim country filtering', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue(new Response(JSON.stringify([{
      lat: '31.95',
      lon: '35.91',
      display_name: 'Amman, Jordan',
    }]), { status: 200 }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('constrains city geocoding to the supplied ISO country code', async () => {
    await geocodeCity('عمّان', 'JO');

    const requestUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(requestUrl.searchParams.get('countrycodes')).toBe('jo');
  });

  it('maps UK to the ISO code expected by Nominatim', async () => {
    await geocodeCity('London', 'UK');

    const requestUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(requestUrl.searchParams.get('countrycodes')).toBe('gb');
  });
});
