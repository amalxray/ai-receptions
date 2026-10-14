import { describe, it, expect, vi, beforeEach } from 'vitest';

// Count DB round-trips so we can prove the cache actually short-circuits.
const counters = vi.hoisted(() => ({ select: 0 }));

vi.mock('@/lib/supabase/admin', () => {
  const chainable: Record<string, unknown> = {};
  const make = () => {
    const c: Record<string, unknown> = {
      select: () => { counters.select += 1; return c; },
      eq: () => c,
      is: () => c,
      maybeSingle: () => Promise.resolve({ data: { currency: 'ils', settings: {} }, error: null }),
      then: (res: (v: unknown) => void) => Promise.resolve({ data: [], error: null }).then(res),
    };
    return c;
  };
  chainable.from = () => make();
  return { supabaseAdmin: chainable };
});

import { loadClinicOperatingData, clearOperatingDataCache } from '@/lib/ai/clinicDataContext';

describe('loadClinicOperatingData — in-memory TTL cache', () => {
  beforeEach(() => {
    clearOperatingDataCache();
    counters.select = 0;
  });

  it('queries the DB on the first call and serves the cache on the second', async () => {
    const first = await loadClinicOperatingData('clinic-1');
    const callsAfterFirst = counters.select;
    expect(callsAfterFirst).toBeGreaterThan(0);

    const t0 = Date.now();
    const second = await loadClinicOperatingData('clinic-1');
    const elapsed = Date.now() - t0;

    // Second call must NOT re-query and must be near-instant.
    expect(counters.select).toBe(callsAfterFirst);
    expect(elapsed).toBeLessThan(100);
    // Same shape returned from cache.
    expect(second).toEqual(first);
  });

  it('isolates cache entries per clinic', async () => {
    await loadClinicOperatingData('clinic-a');
    const afterA = counters.select;
    await loadClinicOperatingData('clinic-b');
    // A different clinic is a cache miss → new queries.
    expect(counters.select).toBeGreaterThan(afterA);
  });
});
