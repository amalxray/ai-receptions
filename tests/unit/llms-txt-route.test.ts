import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => ({
  clinics: [] as Array<{ kind: string; slug: string; name: string; city: string | null; area: string | null }>,
  articles: [] as Array<{ title: string; slug: string; published_at: string }>,
  failClinicRead: false,
}));

vi.mock('@/lib/communications/links', () => ({
  getAppBaseUrl: () => 'https://www.dentairec.com',
}));
vi.mock('@/lib/services/activityPublicSpace', () => ({
  getActivitySpaceEntries: vi.fn(async () => {
    if (mockState.failClinicRead) throw new Error('test database failure');
    return mockState.clinics;
  }),
}));
vi.mock('@/lib/vercel/tenantLinks', () => ({
  resolveTenantPublicUrls: vi.fn(async (slugs: string[]) =>
    new Map(slugs.map((slug) => [slug, `https://${slug}.dentairec.com`]))
  ),
}));
vi.mock('@/lib/server/logging', () => ({ logEvent: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: vi.fn(() => {
      const query: Record<string, unknown> = {};
      for (const method of ['select', 'eq', 'lte', 'not', 'order', 'limit']) {
        query[method] = () => query;
      }
      query.then = (resolve: (value: unknown) => unknown) =>
        Promise.resolve(resolve({ data: mockState.articles, error: null }));
      return query;
    }),
  },
}));

import { GET } from '@/app/llms.txt/route';

describe('/llms.txt', () => {
  beforeEach(() => {
    mockState.failClinicRead = false;
    mockState.clinics = [
      { kind: 'clinic', slug: 'noor-clinic', name: 'عيادة النور', city: 'نابلس', area: null },
    ];
    mockState.articles = [
      { title: 'العناية بالأسنان', slug: 'dental-care', published_at: '2026-11-15T10:00:00Z' },
    ];
  });

  it('renders eligible clinics and published articles with the hourly cache policy', async () => {
    const response = await GET();
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('[عيادة النور](https://noor-clinic.dentairec.com)');
    expect(body).toContain('المدينة: نابلس — التخصص/النشاط: عيادة أسنان');
    expect(body).toContain('[العناية بالأسنان](https://www.dentairec.com/ask/article/dental-care)');
    expect(body).toMatch(/## آخر تحديث\n\d{4}-\d{2}-\d{2}T/);
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=3600, s-maxage=3600');
    expect(response.headers.get('Content-Type')).toContain('text/plain');
  });

  it('uses the checked-in public file as a logged fallback when database reads fail', async () => {
    mockState.failClinicRead = true;
    const response = await GET();
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('X-LLMs-Txt-Fallback')).toBe('public-file');
    expect(body).toContain('# AI-Receptions (سنّي · Dentairec)');
    expect(body).not.toContain('## قائمة العيادات النشطة');
  });
});
