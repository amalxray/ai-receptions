import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * B52 — reschedule failure contract.
 *
 * Production bug (hala-clinic): dragging an appointment card answered
 * "Internal server error". Root cause: `appointments` rows with
 * `provider_id = NULL` exist (walk-in / legacy bookings), the service threw
 * "Appointment has no provider assigned — reschedule not possible", and the route
 * only sniffed the substring "not assigned" — so the business rejection fell
 * through to `500`. This file pins the SERVICE layer (typed codes); the route
 * layer (status + Arabic copy) is appointment-reschedule-b52-api.test.ts.
 */

const CLINIC = '11111111-1111-1111-1111-111111111111';
const PROVIDER = '33333333-3333-3333-3333-333333333333';
const SERVICE = '66666666-6666-6666-6666-666666666666';
const APPOINTMENT = '55555555-5555-5555-5555-555555555555';

// supabaseAdmin: per-table, per-terminal-result stub.
const db = vi.hoisted(() => {
  const tables: Record<string, { load?: unknown; update?: unknown; lastUpdate?: unknown }> = {};
  const makeChain = (table: string) => {
    const settle = (kind: 'maybeSingle' | 'single') => {
      const bucket = tables[table] ?? {};
      const value = kind === 'maybeSingle' ? bucket.load ?? { data: null, error: null } : bucket.update ?? { data: null, error: null };
      return Promise.resolve(value);
    };
    const chain: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'is', 'order', 'limit', 'in', 'gte', 'lte']) {
      chain[method] = vi.fn(() => chain);
    }
    // B52-B — remember the payload so tests can prove WHICH provider is written.
    chain.update = vi.fn((payload: unknown) => {
      const bucket = tables[table] ?? (tables[table] = {});
      bucket.lastUpdate = payload;
      return chain;
    });
    chain.insert = vi.fn(() => chain);
    chain.maybeSingle = vi.fn(() => settle('maybeSingle'));
    chain.single = vi.fn(() => settle('single'));
    return chain;
  };
  return { tables, from: vi.fn((table: string) => makeChain(table)) };
});
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: db }));

const booking = vi.hoisted(() => ({
  loadProviderSchedule: vi.fn(),
  getActiveServiceById: vi.fn(),
  loadExistingAppointments: vi.fn(),
  isClinicHoliday: vi.fn(),
}));
vi.mock('@/lib/services/bookingService', () => booking);

const scheduling = vi.hoisted(() => ({ checkSlotAvailability: vi.fn() }));
vi.mock('@/lib/services/scheduling', () => scheduling);

const reminders = vi.hoisted(() => ({
  createAppointmentReminders: vi.fn(),
  cancelAppointmentReminders: vi.fn(),
}));
vi.mock('@/lib/services/reminderEngine', () => reminders);

const logging = vi.hoisted(() => ({ logEvent: vi.fn() }));
vi.mock('@/lib/server/logging', () => logging);

import { supabaseAdmin } from '@/lib/supabase/admin';
import {
  rescheduleAppointment,
  RescheduleError,
  RESCHEDULE_HTTP_STATUS,
  RESCHEDULE_USER_MESSAGE,
  type RescheduleErrorCode,
} from '@/lib/services/appointmentReschedule';

function appointmentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: APPOINTMENT,
    clinic_id: CLINIC,
    status: 'confirmed',
    provider_id: PROVIDER,
    service_id: null,
    patient_id: null,
    duration_minutes: 30,
    appointment_date: '2026-10-05',
    scheduled_at: '2026-10-05T09:00:00.000Z',
    ...overrides,
  };
}

function scheduleOk() {
  for (const key of Object.keys(db.tables)) delete db.tables[key];
  db.tables.appointments = {
    load: { data: appointmentRow(), error: null },
    update: { data: { id: APPOINTMENT, scheduled_at: '2026-10-06T09:00:00.000Z', appointment_date: '2026-10-06', status: 'confirmed', patient_id: null }, error: null },
  };
  booking.loadProviderSchedule.mockResolvedValue({ working_days: [1, 2, 3, 4, 5], start_time: '09:00', end_time: '17:00' });
  booking.getActiveServiceById.mockResolvedValue(null);
  booking.loadExistingAppointments.mockResolvedValue([]);
  booking.isClinicHoliday.mockResolvedValue(false);
  // checkSlotAvailability is called synchronously by the service — a resolved
  // mock would return a Promise and mask the real return shape.
  scheduling.checkSlotAvailability.mockReturnValue({ available: true });
  reminders.createAppointmentReminders.mockResolvedValue(undefined);
  reminders.cancelAppointmentReminders.mockResolvedValue(undefined);
}

beforeEach(() => {
  vi.clearAllMocks();
  scheduleOk();
});

describe('B52 service — typed failure codes', () => {
  it('rejects with code "no_provider" for an appointment without a provider (production repro)', async () => {
    db.tables.appointments = { load: { data: appointmentRow({ provider_id: null, status: 'scheduled' }), error: null } };

    await expect(
      rescheduleAppointment({ clinicId: CLINIC, appointmentId: APPOINTMENT, date: '2026-10-06', time: '09:00' }),
    ).rejects.toMatchObject({ name: 'RescheduleError', code: 'no_provider' });
  });

  it('keeps the legacy message text so existing string-based callers still work', async () => {
    db.tables.appointments = { load: { data: appointmentRow({ provider_id: null }), error: null } };
    const error = await rescheduleAppointment({ clinicId: CLINIC, appointmentId: APPOINTMENT, date: '2026-10-06', time: '09:00' }).catch((e) => e);
    expect(error).toBeInstanceOf(RescheduleError);
    expect(error.message).toBe('Appointment has no provider assigned — reschedule not possible');
  });

  it('codes a missing row as not_found', async () => {
    db.tables.appointments = { load: { data: null, error: null } };
    await expect(rescheduleAppointment({ clinicId: CLINIC, appointmentId: APPOINTMENT, date: '2026-10-06', time: '09:00' }))
      .rejects.toMatchObject({ code: 'not_found' });
  });

  it('codes a terminal status as ineligible_status', async () => {
    db.tables.appointments = { load: { data: appointmentRow({ status: 'completed' }), error: null } };
    await expect(rescheduleAppointment({ clinicId: CLINIC, appointmentId: APPOINTMENT, date: '2026-10-06', time: '09:00' }))
      .rejects.toMatchObject({ code: 'ineligible_status' });
  });

  it('codes a missing provider schedule as provider_not_found (was a 500)', async () => {
    booking.loadProviderSchedule.mockResolvedValue(null);
    await expect(rescheduleAppointment({ clinicId: CLINIC, appointmentId: APPOINTMENT, date: '2026-10-06', time: '09:00' }))
      .rejects.toMatchObject({ code: 'provider_not_found' });
  });

  it('codes an unassigned provider/service pair as provider_not_assigned', async () => {
    db.tables.appointments = { load: { data: appointmentRow({ service_id: SERVICE }), error: null } };
    db.tables.provider_services = { load: { data: null, error: null } };
    booking.getActiveServiceById.mockResolvedValue({ id: SERVICE, name: 'تنظيف', duration_minutes: 30 });

    await expect(rescheduleAppointment({ clinicId: CLINIC, appointmentId: APPOINTMENT, date: '2026-10-06', time: '09:00' }))
      .rejects.toMatchObject({ code: 'provider_not_assigned' });
  });

  it('codes a busy slot as slot_unavailable and excludes the appointment itself', async () => {
    scheduling.checkSlotAvailability.mockReturnValue({ available: false, reason: 'out_of_hours' });
    await expect(rescheduleAppointment({ clinicId: CLINIC, appointmentId: APPOINTMENT, date: '2026-10-06', time: '09:00' }))
      .rejects.toMatchObject({ code: 'slot_unavailable' });

    const used = scheduling.checkSlotAvailability.mock.calls[0][0];
    expect(used.existingAppointments).toEqual([]);
    expect(used.startsAt).toBe('2026-10-06T09:00:00.000Z');
  });

  it('codes a unique-violation as conflict and any other write failure as update_failed', async () => {
    db.tables.appointments.update = { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } };
    await expect(rescheduleAppointment({ clinicId: CLINIC, appointmentId: APPOINTMENT, date: '2026-10-06', time: '09:00' }))
      .rejects.toMatchObject({ code: 'conflict' });

    db.tables.appointments.update = { data: null, error: { code: 'XX000', message: 'connection terminated' } };
    await expect(rescheduleAppointment({ clinicId: CLINIC, appointmentId: APPOINTMENT, date: '2026-10-06', time: '09:00' }))
      .rejects.toMatchObject({ code: 'update_failed' });
    expect(logging.logEvent).toHaveBeenCalledWith(
      'reschedule_update_failed',
      expect.objectContaining({ clinic_id: CLINIC, code: 'XX000' }),
      'error',
    );
  });

  it('still succeeds and queues reminders when the slot is free', async () => {
    const updated = await rescheduleAppointment({ clinicId: CLINIC, appointmentId: APPOINTMENT, date: '2026-10-06', time: '09:00' });

    expect(updated).toMatchObject({ id: APPOINTMENT, appointment_date: '2026-10-06' });
    expect(reminders.cancelAppointmentReminders).toHaveBeenCalledTimes(1);
    expect(reminders.createAppointmentReminders).toHaveBeenCalledTimes(1);
    expect(supabaseAdmin.from).toHaveBeenCalledWith('notification_queue');
  });

  it('B52-B: assigns a provider when the appointment had none, and validates the move against that provider', async () => {
    db.tables.appointments = {
      load: { data: appointmentRow({ provider_id: null, status: 'scheduled' }), error: null },
      update: { data: { id: APPOINTMENT, scheduled_at: '2026-10-06T09:00:00.000Z', appointment_date: '2026-10-06', status: 'scheduled', patient_id: null, provider_id: PROVIDER }, error: null },
    };

    const updated = await rescheduleAppointment({
      clinicId: CLINIC, appointmentId: APPOINTMENT, date: '2026-10-06', time: '09:00', providerId: PROVIDER,
    });

    expect(updated.provider_id).toBe(PROVIDER);
    // The whole validation chain must follow the NEW provider, never the old (null) one.
    expect(booking.loadProviderSchedule).toHaveBeenCalledWith(CLINIC, PROVIDER);
    expect(booking.loadExistingAppointments).toHaveBeenCalledWith(CLINIC, PROVIDER, '2026-10-06');
    expect(db.tables.appointments.lastUpdate).toMatchObject({ provider_id: PROVIDER, scheduled_at: '2026-10-06T09:00:00.000Z' });
  });

  it('B52-B: moves the appointment to another doctor so the unique index sees the new provider', async () => {
    const OTHER_PROVIDER = '77777777-7777-7777-7777-777777777777';
    db.tables.appointments = {
      load: { data: appointmentRow({ provider_id: PROVIDER }), error: null },
      update: { data: { id: APPOINTMENT, scheduled_at: '2026-10-06T10:00:00.000Z', appointment_date: '2026-10-06', status: 'confirmed', patient_id: null, provider_id: OTHER_PROVIDER }, error: null },
    };

    await rescheduleAppointment({ clinicId: CLINIC, appointmentId: APPOINTMENT, date: '2026-10-06', time: '10:00', providerId: OTHER_PROVIDER });

    expect(booking.loadProviderSchedule).toHaveBeenCalledWith(CLINIC, OTHER_PROVIDER);
    expect(db.tables.appointments.lastUpdate).toMatchObject({ provider_id: OTHER_PROVIDER });
  });

  it('B52-B: without a picked provider the legacy no_provider rejection is unchanged', async () => {
    db.tables.appointments = { load: { data: appointmentRow({ provider_id: null }), error: null } };
    await expect(rescheduleAppointment({ clinicId: CLINIC, appointmentId: APPOINTMENT, date: '2026-10-06', time: '09:00' }))
      .rejects.toMatchObject({ code: 'no_provider' });
  });
});

describe('B52-B — agenda wiring guards', () => {
  const read = (relative: string) =>
    import('node:fs/promises').then((fs) =>
      fs.readFile(new URL(`../../${relative}`, import.meta.url), 'utf8'),
    );

  it('never invents a provider id from the appointment id (the walk-in dead end)', async () => {
    const page = await read('app/(dashboard)/dashboard/[clinicSlug]/appointments/page.tsx');
    expect(page).not.toContain('rescheduleTarget.provider_id ?? rescheduleTarget.id');
    expect(page).toContain('provider_id: rescheduleProviderId,');
  });

  it('offers an edit affordance and keeps cancel reachable in the same panel', async () => {
    const page = await read('app/(dashboard)/dashboard/[clinicSlug]/appointments/page.tsx');
    expect(page).toContain('تعديل الموعد');
    expect(page).toContain('openReschedule(appointment)');
    expect(page).toContain("requestStatusChange(rescheduleTarget, 'cancelled', 'إلغاء الموعد')");
    // The old ambiguous label ("إلغاء" = close this panel) must not come back —
    // the create form keeps its own «إلغاء», the editor closes with «إغلاق».
    expect(page).not.toContain('setRescheduleSlots([]); setRescheduleError(null); }} className="rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-300">إلغاء</button>');
    expect(page).toContain('إغلاق');
  });

  it('asks for a provider instead of querying availability with a fake id', async () => {
    const page = await read('app/(dashboard)/dashboard/[clinicSlug]/appointments/page.tsx');
    expect(page).toContain('اختر الطبيب أولًا ثم اعرض المواعيد المتاحة.');
    expect(page).toContain('/api/clinic/providers?clinic_id=');
  });

  it('renders loading as skeleton chips and the error as a motion card (golden rule)', async () => {
    const page = await read('app/(dashboard)/dashboard/[clinicSlug]/appointments/page.tsx');
    expect(page).toContain('<Skeleton key={chip}');
    expect(page).toContain('initial={{ opacity: 0, y: -6 }}');
    expect(page).toContain("import { motion } from 'framer-motion';");
  });
});

