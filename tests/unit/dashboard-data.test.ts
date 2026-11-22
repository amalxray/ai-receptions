import { describe, expect, it, vi } from 'vitest';
import { fetchClinicDashboardResource } from '@/lib/dashboard/dashboardData';

describe('shared dashboard data requests', () => {
  it('deduplicates concurrent overview requests for the same clinic', async () => {
    let resolveResponse!: (response: Response) => void;
    const fetcher = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveResponse = resolve;
        })
    );
    const authHeaders = vi.fn(async () => ({ Authorization: 'Bearer test-token' }));

    const pageRequest = fetchClinicDashboardResource<{ patients_count: number }>(
      'clinic-a',
      'overview',
      authHeaders,
      fetcher
    );
    const navRequest = fetchClinicDashboardResource<{ patients_count: number }>(
      'clinic-a',
      'overview',
      authHeaders,
      fetcher
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(authHeaders).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(1);

    resolveResponse(
      new Response(JSON.stringify({ data: { patients_count: 7 } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    await expect(Promise.all([pageRequest, navRequest])).resolves.toEqual([
      { patients_count: 7 },
      { patients_count: 7 },
    ]);
  });

  it('keeps overview and subscription requests separate', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const body = String(input).includes('/overview')
        ? { data: { patients_count: 7 } }
        : { data: { entitlements: { planId: 'advanced' } } };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    const authHeaders = vi.fn(async () => ({}));

    await Promise.all([
      fetchClinicDashboardResource('clinic-b', 'overview', authHeaders, fetcher),
      fetchClinicDashboardResource('clinic-b', 'subscription', authHeaders, fetcher),
    ]);

    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
