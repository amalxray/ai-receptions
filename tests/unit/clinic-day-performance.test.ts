import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorized: true,
  role: 'owner',
  permissionOverrides: new Map<string, boolean>(),
  permissions: new Set<string>(['view_financial']),
  queryResults: {} as Record<string, { data: Array<Record<string, unknown>> | null; count: number | null; error: Error | null }>,
  queriedTables: [] as string[],
}));

vi.mock('@/lib/services/clinicAuthorization', () => ({
  authorizeClinicRequest: vi.fn(async () =>
    mocks.authorized
      ? { authorized: true, user: { id: 'user-1' }, role: mocks.role }
      : { authorized: false, status: 401 }
  ),
  FINANCE_READ_ROLES: ['owner', 'accountant', 'manager'],
}));

vi.mock('@/lib/auth/permissions', () => ({
  getUserPermissionState: vi.fn(async () => ({
    permissions: mocks.permissions,
    overrides: mocks.permissionOverrides,
  })),
  hasPermission: (permissions: Set<string>, key: string) => permissions.has(key),
  ROLE_DEFAULTS: { owner: ['view_financial'] },
}));

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      mocks.queriedTables.push(table);
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        neq: vi.fn(() => builder),
        is: vi.fn(() => builder),
        gte: vi.fn(() => builder),
        lt: vi.fn(() => builder),
        order: vi.fn(() => builder),
        range: vi.fn(() => builder),
        then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
          Promise.resolve(mocks.queryResults[table]).then(resolve, reject),
      };
      return builder;
    },
  },
}));

vi.mock('@/lib/server/logging', () => ({ logEvent: vi.fn() }));

import { GET } from '@/app/api/clinic/patients/today-stats/route';
import { getZonedDayBounds } from '@/lib/services/clinicDay';

const CLINIC_ID = '11111111-1111-1111-1111-111111111111';

beforeEach(() => {
  mocks.authorized = true;
  mocks.role = 'owner';
  mocks.permissionOverrides = new Map();
  mocks.permissions = new Set(['view_financial']);
  mocks.queriedTables = [];
  mocks.queryResults = {
    patients: { data: null, count: 2, error: null },
    clinic_invoices: { data: [{ total: 120 }, { total: 80 }], count: null, error: null },
    clinic_payments: { data: [{ amount: 50 }, { amount: 25 }], count: null, error: null },
  };
});

describe('clinic day boundaries', () => {
  it('uses local midnights and handles the Jerusalem daylight-saving transition', () => {
    const bounds = getZonedDayBounds('Asia/Jerusalem', new Date('2026-03-27T12:00:00.000Z'));
    const localDate = (date: Date) =>
      new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', dateStyle: 'short' }).format(date);
    const localTime = (date: Date) =>
      new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Jerusalem',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).format(date);

    expect(localTime(bounds.start)).toBe('00:00');
    expect(localDate(bounds.start)).not.toBe(localDate(bounds.end));
    expect(bounds.end.getTime() - bounds.start.getTime()).toBeGreaterThanOrEqual(23 * 60 * 60 * 1000);
    expect(bounds.end.getTime() - bounds.start.getTime()).toBeLessThanOrEqual(25 * 60 * 60 * 1000);
  });
});

describe('GET /api/clinic/patients/today-stats', () => {
  it('returns tenant-scoped patient and finance totals for an authorized finance user', async () => {
    const response = await GET(
      new Request(`https://app.test/api/clinic/patients/today-stats?clinic_id=${CLINIC_ID}`, {
        headers: { authorization: 'Bearer test-token' },
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: { new_patients: 2, invoices_total: 200, payments_total: 75, remaining_total: 125 },
    });
    expect(mocks.queriedTables).toEqual(['patients', 'clinic_invoices', 'clinic_payments']);
  });

  it('returns patient count while withholding finance values when permission is revoked', async () => {
    mocks.role = 'receptionist';
    mocks.permissionOverrides = new Map([['view_financial', false]]);

    const response = await GET(
      new Request(`https://app.test/api/clinic/patients/today-stats?clinic_id=${CLINIC_ID}`, {
        headers: { authorization: 'Bearer test-token' },
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: { new_patients: 2, invoices_total: null, payments_total: null, remaining_total: null },
    });
    expect(mocks.queriedTables).toEqual(['patients']);
  });

  it('keeps patient stats available when a financial query fails', async () => {
    mocks.queryResults.clinic_payments = {
      data: null,
      count: null,
      error: new Error('payments unavailable'),
    };

    const response = await GET(
      new Request(`https://app.test/api/clinic/patients/today-stats?clinic_id=${CLINIC_ID}`, {
        headers: { authorization: 'Bearer test-token' },
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: { new_patients: 2, invoices_total: null, payments_total: null, remaining_total: null },
    });
  });

  it('rejects unauthenticated requests before querying tenant data', async () => {
    mocks.authorized = false;

    const response = await GET(
      new Request(`https://app.test/api/clinic/patients/today-stats?clinic_id=${CLINIC_ID}`)
    );

    expect(response.status).toBe(401);
    expect(mocks.queriedTables).toEqual([]);
  });
});
