import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => {
  const calls: Array<{ table: string; method: string; args: unknown[] }> = [];
  const rowsByTable: Record<string, unknown[]> = {
    providers: [{ id: 'provider-1', name: 'Provider' }],
    provider_schedules: Array.from({ length: 7 }, (_, weekday) => ({
      provider_id: 'provider-1',
      weekday,
      enabled: true,
      start_time: '09:00',
      end_time: '17:00',
      breaks: [],
      shifts: [],
      appointment_duration_minutes: 30,
      max_appointments_per_day: null,
    })),
    provider_vacations: [],
    clinic_services: [{ id: 'service-1', name: 'Panorama', duration_minutes: 30 }],
    provider_services: [{ id: 'assignment-1', provider_id: 'provider-1' }],
    clinic_holidays: [],
    appointments: [],
  };
  const from = vi.fn((table: string) => {
    const result = { data: rowsByTable[table] ?? [], error: null };
    const query: Record<string, any> = {};
    for (const method of ['select', 'eq', 'is', 'in', 'gte', 'lte']) {
      query[method] = vi.fn((...args: unknown[]) => {
        calls.push({ table, method, args });
        return query;
      });
    }
    query.single = vi.fn(async () => ({ ...result, data: rowsByTable[table]?.[0] ?? null }));
    query.maybeSingle = vi.fn(async () => ({ ...result, data: rowsByTable[table]?.[0] ?? null }));
    query.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject);
    return query;
  });
  return { calls, from };
});

vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: dbMocks.from } }));
vi.mock('@/lib/server/logging', () => ({ logEvent: vi.fn() }));
vi.mock('@/lib/services/reminderEngine', () => ({
  createAppointmentReminders: vi.fn(),
  cancelAppointmentReminders: vi.fn(),
}));
vi.mock('@/lib/communications/settings', () => ({
  channelsForNotificationType: vi.fn(() => []),
  filterEnabledChannels: vi.fn(() => []),
  getClinicCommunicationSettings: vi.fn(),
}));

import { getAvailableSlotsForRange } from '@/lib/services/bookingService';

describe('getAvailableSlotsForRange', () => {
  beforeEach(() => {
    dbMocks.calls.length = 0;
    vi.clearAllMocks();
  });

  it('loads shared inputs once and returns slots for every scanned day', async () => {
    const dates = ['2026-10-21', '2026-10-22', '2026-10-23'];
    const result = await getAvailableSlotsForRange('clinic-1', 'provider-1', dates, 20, 'service-1');

    expect(Array.from(result.keys())).toEqual(dates);
    expect(result.get('2026-10-21')).toContain('2026-10-21T09:00:00.000Z');
    expect(result.get('2026-10-22')).toContain('2026-10-22T09:00:00.000Z');
    expect(result.get('2026-10-23')).toContain('2026-10-23T09:00:00.000Z');
    expect(dbMocks.from.mock.calls.map(([table]) => table).sort()).toEqual([
      'appointments',
      'clinic_holidays',
      'clinic_services',
      'provider_schedules',
      'provider_services',
      'provider_vacations',
      'providers',
    ]);
    expect(dbMocks.calls).toContainEqual({ table: 'appointments', method: 'gte', args: ['appointment_date', '2026-10-20'] });
    expect(dbMocks.calls).toContainEqual({ table: 'appointments', method: 'lte', args: ['appointment_date', '2026-10-23'] });
  });
});
