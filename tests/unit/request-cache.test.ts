import { describe, expect, it, vi, afterEach } from 'vitest';

/**
 * `requestCache` — request-scoped memoization wrapper.
 *
 * The reason this module exists: `React.cache` is only exported by the
 * `react-server` build Next resolves for Server Components. A direct
 * `cache(fn)` call at module scope crashes every other runtime that loads the
 * page module (a unit test importing the page failed with
 * `TypeError: cache is not a function`). The wrapper must therefore stay a
 * PASSTHROUGH when `cache` is absent — correct, just not deduplicated.
 */

afterEach(() => {
  vi.doUnmock('react');
  vi.resetModules();
});

describe('requestCache', () => {
  it('passes through when React does not export cache (non-RSC runtime)', async () => {
    const { cache } = await import('react');
    expect(typeof cache).not.toBe('function'); // the environment this guards
    const { requestCache } = await import('@/lib/server/requestCache');

    const fn = vi.fn((n: number) => n * 2);
    const wrapped = requestCache(fn);
    expect(wrapped(2)).toBe(4);
    expect(wrapped(2)).toBe(4);
    expect(fn).toHaveBeenCalledTimes(2); // no dedupe — behavior is unchanged
  });

  it('memoizes when React.cache exists (RSC runtime)', async () => {
    vi.resetModules();
    vi.doMock('react', () => ({
      cache: (fn: (key: unknown) => unknown) => {
        const store = new Map<unknown, unknown>();
        return (key: unknown) => {
          if (!store.has(key)) store.set(key, fn(key));
          return store.get(key);
        };
      },
    }));

    const { requestCache } = await import('@/lib/server/requestCache');
    const fn = vi.fn((n: number) => n * 2);
    const wrapped = requestCache(fn);
    expect(wrapped(3)).toBe(6);
    expect(wrapped(3)).toBe(6);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
