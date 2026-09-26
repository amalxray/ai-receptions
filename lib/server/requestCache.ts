import { cache } from 'react';

/**
 * Request-scoped memoization for server functions.
 *
 * `React.cache` is the right tool, and Next resolves the `react-server` build for
 * Server Components — the build that actually exports it. It is NOT exported by the
 * plain React build, so importing and calling it directly crashes any non-RSC
 * runtime that loads the module (a unit test that imports a page, for example):
 *
 *   TypeError: cache is not a function
 *
 * The passthrough below keeps those environments CORRECT, just without
 * deduplication — a page that resolves the same tenant twice is slower, never
 * wrong. Production (RSC) always takes the memoized path, so `generateMetadata`,
 * `generateViewport` and the page render share ONE resolver call per request.
 */
export function requestCache<Args extends unknown[], Result>(
  fn: (...args: Args) => Result
): (...args: Args) => Result {
  if (typeof cache === 'function') {
    const memoized = (cache as unknown as (fn: unknown) => unknown)(fn);
    return memoized as (...args: Args) => Result;
  }
  return fn;
}
