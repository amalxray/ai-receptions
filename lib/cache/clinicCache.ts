import { logEvent } from '@/lib/server/logging';

const CLINIC_CACHE_TTL_MS = 60_000;
const MAX_CLINIC_CACHE_ENTRIES = 500;

type CacheEntry<T> = {
  data: T;
  expiresAt: number;
};

const clinicCache = new Map<string, CacheEntry<unknown>>();
const pendingFetches = new Map<string, Promise<unknown>>();

function getCacheKey(clinicId: string, key: string): string {
  return JSON.stringify([clinicId, key]);
}

function evictExpiredEntries(now: number) {
  clinicCache.forEach((entry, cacheKey) => {
    if (entry.expiresAt <= now) clinicCache.delete(cacheKey);
  });
}

/**
 * Read clinic-scoped data from a short-lived process cache.
 * Concurrent misses for the same clinic/key share one fetch operation.
 */
export async function getOrFetch<T>(clinicId: string, key: string, fetcher: () => Promise<T>): Promise<T> {
  const cacheKey = getCacheKey(clinicId, key);
  const now = Date.now();
  const cached = clinicCache.get(cacheKey);

  if (cached && cached.expiresAt > now) {
    logEvent('clinic_cache_hit', { clinic_id: clinicId, cache_key: key });
    return cached.data as T;
  }

  if (cached) clinicCache.delete(cacheKey);

  const pending = pendingFetches.get(cacheKey);
  if (pending) {
    logEvent('clinic_cache_hit', { clinic_id: clinicId, cache_key: key, in_flight: true });
    return pending as Promise<T>;
  }

  logEvent('clinic_cache_miss', { clinic_id: clinicId, cache_key: key });
  const request = fetcher()
    .then((data) => {
      const storedAt = Date.now();
      if (clinicCache.size >= MAX_CLINIC_CACHE_ENTRIES) {
        evictExpiredEntries(storedAt);
        if (clinicCache.size >= MAX_CLINIC_CACHE_ENTRIES) {
          const oldestKey = clinicCache.keys().next().value;
          if (oldestKey !== undefined) clinicCache.delete(oldestKey);
        }
      }
      clinicCache.set(cacheKey, { data, expiresAt: storedAt + CLINIC_CACHE_TTL_MS });
      return data;
    })
    .finally(() => {
      pendingFetches.delete(cacheKey);
    });

  pendingFetches.set(cacheKey, request);
  return request;
}

/** Exported for deterministic unit tests and explicit cache invalidation. */
export function clearClinicCache() {
  clinicCache.clear();
  pendingFetches.clear();
}
