import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchAllClinics: vi.fn(),
  saveClinicsToProspects: vi.fn(),
}));

vi.mock('@/lib/services/platformAdmin', () => ({
  requirePlatformAdmin: vi.fn(async () => ({
    ok: true,
    admin: { id: 'admin', user_id: 'admin-user', email: 'admin@example.test', role: 'owner' },
  })),
}));

vi.mock('@/lib/services/prospecting/aggregate', () => ({
  fetchAllClinics: mocks.fetchAllClinics,
}));

vi.mock('@/lib/services/prospecting/openstreetmap', () => ({
  saveClinicsToProspects: mocks.saveClinicsToProspects,
}));

import { POST } from '@/app/api/admin/prospects/fetch-osm/route';

function request() {
  return new Request('https://app.test/api/admin/prospects/fetch-osm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ city: 'نابلس', country: 'PS' }),
  });
}

describe('admin prospect fetch result', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('explains when fetched clinics already exist', async () => {
    mocks.fetchAllClinics.mockResolvedValue({
      clinics: Array.from({ length: 107 }, () => ({ clinic_name: 'عيادة أسنان' })),
      sources: [{ name: 'PhoneFilter', count: 0, filtered: 0 }, { name: 'QualityFilter', count: 0, filtered: 0 }],
    });
    mocks.saveClinicsToProspects.mockResolvedValue({ inserted: 0, skipped: 107 });

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      found: 107,
      inserted: 0,
      skipped_duplicates: 107,
      skipped_invalid: 0,
      message: 'جميع العيادات (107) موجودة مسبقاً',
    });
    expect(body).not.toHaveProperty('skipped');
  });

  it('reports candidates removed by phone and quality filters separately from duplicates', async () => {
    mocks.fetchAllClinics.mockResolvedValue({
      clinics: [],
      sources: [
        { name: 'PhoneFilter', count: 0, filtered: 27 },
        { name: 'QualityFilter', count: 0, filtered: 80 },
      ],
    });
    mocks.saveClinicsToProspects.mockResolvedValue({ inserted: 0, skipped: 0 });

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      found: 0,
      inserted: 0,
      skipped_duplicates: 0,
      skipped_invalid: 107,
      message: 'تم استبعاد 107 (لا تطابق معايير الجودة)',
    });
  });
});
