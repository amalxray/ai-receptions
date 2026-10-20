import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearClinicCache, getOrFetch } from '@/lib/cache/clinicCache';

describe('clinic cache', () => {
  beforeEach(() => {
    clearClinicCache();
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses one database fetch for ten repeated requests with the same clinic key', async () => {
    const simulatedDatabaseCall = vi.fn(async () => {
      await Promise.resolve();
      return { id: 'clinic-1', name: 'Test clinic' };
    });

    const results = [];
    for (let request = 0; request < 10; request += 1) {
      results.push(await getOrFetch('clinic-1', 'profile', simulatedDatabaseCall));
    }

    expect(simulatedDatabaseCall).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(10);
    expect(results.every((result) => result === results[0])).toBe(true);
  });

  it('deduplicates concurrent misses for the same clinic key', async () => {
    const simulatedDatabaseCall = vi.fn(async () => 'clinic data');

    await Promise.all(
      Array.from({ length: 10 }, () =>
        getOrFetch('clinic-1', 'profile', simulatedDatabaseCall)
      )
    );

    expect(simulatedDatabaseCall).toHaveBeenCalledTimes(1);
  });
});
