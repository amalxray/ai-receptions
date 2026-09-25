import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getPublicPageConfig } from '@/lib/services/clinicPublicConfig';

/**
 * B3 regression guard — the owner's public-page config must still report
 * availability when the ads read is degraded.
 *
 * Bug: the ads existence probe asked for `clinic_ads.deleted_at` (that column
 * does not exist — 20260833_clinic_ads_fix.sql) and used a closed date window,
 * so `hasAds` was always false and the owner screen showed no ads.
 */

const mockState = vi.hoisted(() => ({
  results: {} as Record<string, any>,
  errors: {} as Record<string, any>,
  isCalls: {} as Record<string, Array<[string, unknown]>>,
  orCalls: {} as Record<string, string[]>,
  logCalls: [] as Array<{ event: string; context: any; level?: string }>,
}));

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => {
      const chain: any = {};
      const resolved = () => ({ data: mockState.results[table] ?? null, error: mockState.errors[table] ?? null });
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.limit = () => chain;
      // The providers probe orders by created_at (pre-existing behaviour).
      chain.order = () => chain;
      chain.is = (col: string, val: unknown) => {
        (mockState.isCalls[table] ??= []).push([col, val]);
        return chain;
      };
      chain.or = (filter: string) => {
        (mockState.orCalls[table] ??= []).push(filter);
        return chain;
      };
      chain.maybeSingle = () => resolved();
      chain.then = (res: (x: unknown) => void) => res(resolved());
      return chain;
    }),
  },
}));

vi.mock('@/lib/server/logging', () => ({
  logEvent: (event: string, context: any, level?: string) => {
    mockState.logCalls.push({ event, context, level });
  },
}));

const CID = '11111111-1111-1111-1111-111111111111';

const CLINIC_ROW = {
  id: CID,
  slug: 'demo-clinic',
  public_id: 'pub-1',
  activity_type: 'clinic',
  settings: {},
};

describe('B3 — getPublicPageConfig ads probe + degradation', () => {
  beforeEach(() => {
    mockState.results = {
      clinics: CLINIC_ROW,
      clinic_services: [{ id: 's1', name: 'فحص' }],
      providers: [{ id: 'p1', name: 'د. أحمد', title: null, specialty: null }],
      clinic_ads: [{ id: 'ad-1' }],
    };
    mockState.errors = {};
    mockState.isCalls = {};
    mockState.orCalls = {};
    mockState.logCalls = [];
  });

  it('probes clinic_ads without the non-existent deleted_at column', async () => {
    await getPublicPageConfig(CID);

    const adsIsCalls = mockState.isCalls['clinic_ads'] ?? [];
    expect(adsIsCalls.some(([col]) => col === 'deleted_at')).toBe(false);
  });

  it('uses an open-ended, inclusive date window (same as /api/booking/ads)', async () => {
    await getPublicPageConfig(CID);

    const today = new Date().toISOString().slice(0, 10);
    expect(mockState.orCalls['clinic_ads']).toEqual([
      `start_date.is.null,start_date.lte.${today}`,
      `end_date.is.null,end_date.gte.${today}`,
    ]);
  });

  it('reports ads as available and still returns services/providers', async () => {
    const config = await getPublicPageConfig(CID);

    expect(config?.hasAds).toBe(true);
    // The rest of the owner screen keeps working: the UI derives emptiness from
    // the arrays themselves (PublicPageManager: config.services/providers.length).
    expect(config?.services).toEqual([{ id: 's1', name: 'فحص' }]);
    expect(config?.providers).toEqual([
      { id: 'p1', name: 'د. أحمد', title: null, specialty: null },
    ]);
    expect(mockState.logCalls).toHaveLength(0);
  });

  it('logs a degraded ads read instead of silently reporting "no ads"', async () => {
    mockState.errors = { clinic_ads: { message: 'permission denied for table clinic_ads' } };

    const config = await getPublicPageConfig(CID);

    const logged = mockState.logCalls.find((c) => c.event === 'public_config_ads_error');
    expect(logged?.level).toBe('error');
    expect(logged?.context.error).toContain('permission denied');
    // Non-fatal: the rest of the owner screen still works.
    expect(config?.slug).toBe('demo-clinic');
  });
});