import type { ClinicContext } from '@/lib/useClinicContext';

export type DashboardOverviewData = {
  patients_count: number;
  today_appointments: {
    id: string;
    date: string | null;
    time: string | null;
    status: string | null;
    patient_name: string | null;
  }[];
  upcoming_appointments: {
    id: string;
    date: string | null;
    time: string | null;
    status: string | null;
    patient_name: string | null;
  }[];
  appointments_count: number;
  new_conversations_count: number;
  needs_attention_count: number;
  generated_for_day: string;
};

export type DashboardSubscriptionData = {
  subscription: {
    status: string | null;
    trial_end: string | null;
  } | null;
  plan?: { name?: string; id?: string };
  entitlements?: { planId?: string };
};

type DashboardResource = 'overview' | 'subscription';

const resourcePaths: Record<DashboardResource, string> = {
  overview: '/api/clinic/overview',
  subscription: '/api/clinic/subscription',
};

const inFlightRequests = new Map<string, Promise<unknown>>();

export function fetchClinicDashboardResource<T>(
  clinicId: string,
  resource: DashboardResource,
  authHeaders: ClinicContext['authHeaders'],
  fetcher: typeof fetch = fetch
): Promise<T> {
  const key = `${clinicId}:${resource}`;
  const existing = inFlightRequests.get(key);
  if (existing) return existing as Promise<T>;

  const request = (async () => {
    const headers = await authHeaders();
    const response = await fetcher(
      `${resourcePaths[resource]}?clinic_id=${encodeURIComponent(clinicId)}`,
      { headers, cache: 'no-store' }
    );
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(typeof body?.error === 'string' ? body.error : `Dashboard ${resource} request failed`);
    }
    if (body?.data === undefined) throw new Error(`Dashboard ${resource} response is missing data`);
    return body?.data as T;
  })();

  inFlightRequests.set(key, request);
  void request.then(
    () => {
      if (inFlightRequests.get(key) === request) inFlightRequests.delete(key);
    },
    () => {
      if (inFlightRequests.get(key) === request) inFlightRequests.delete(key);
    }
  );
  return request;
}
