import { describe, expect, it } from 'vitest';
import { checkSlotAvailability, suggestFreeSlots, type ProviderSchedule } from '@/lib/services/scheduling';

/** Reproduces the reported bug: clinic_services.duration_minutes = 5. */
const fiveMinuteSchedule: ProviderSchedule = {
  providerId: 'provider-1',
  clinicId: 'clinic-1',
  appointmentDurationMinutes: 5,
  days: [{ weekday: 6, enabled: true, start: '09:00', end: '20:00', breaks: [] }],
};

const SATURDAY = '2026-09-19';

describe('booking slot cadence and daily cap', () => {
  it('offers imaging appointments every 15 minutes across the full clinic day', () => {
    const slots = suggestFreeSlots({
      date: SATURDAY,
      schedule: { ...fiveMinuteSchedule, appointmentDurationMinutes: 30 },
      serviceDurationMinutes: 5,
      intervalMinutes: 15,
      limit: 200,
    });

    expect(slots).toHaveLength(44);
    expect(slots.slice(0, 3)).toEqual([
      `${SATURDAY}T09:00:00.000Z`,
      `${SATURDAY}T09:15:00.000Z`,
      `${SATURDAY}T09:30:00.000Z`,
    ]);
    expect(slots.every((slot) => Number(slot.slice(14, 16)) % 15 === 0)).toBe(true);
    expect(slots).toContain(`${SATURDAY}T19:00:00.000Z`);
  });

  it('uses the clinic service duration for non-imaging slot starts', () => {
    const clinicSchedule = { ...fiveMinuteSchedule, appointmentDurationMinutes: 30 };
    const slots = suggestFreeSlots({
      date: SATURDAY,
      schedule: clinicSchedule,
      serviceDurationMinutes: 30,
      intervalMinutes: 30,
      limit: 200,
    });

    expect(slots).toHaveLength(22);
    expect(slots.slice(0, 3)).toEqual([
      `${SATURDAY}T09:00:00.000Z`,
      `${SATURDAY}T09:30:00.000Z`,
      `${SATURDAY}T10:00:00.000Z`,
    ]);
  });

  it('uses actual service duration when checking overlaps', () => {
    const slots = suggestFreeSlots({
      date: SATURDAY,
      schedule: fiveMinuteSchedule,
      serviceDurationMinutes: 5,
      intervalMinutes: 15,
      limit: 3,
      existingAppointments: [{ startsAt: `${SATURDAY}T09:12:00.000Z`, durationMinutes: 10, status: 'confirmed' }],
    });
    expect(slots).not.toContain(`${SATURDAY}T09:15:00.000Z`);
    expect(slots).toContain(`${SATURDAY}T09:30:00.000Z`);
  });

  it('uses service duration for overlap checks and allows imaging within hourly capacity', () => {
    const existing = [0, 0].map(() => ({
      startsAt: `${SATURDAY}T19:00:00.000Z`,
      durationMinutes: 5,
      status: 'confirmed',
      serviceName: 'تصوير بانوراما',
    }));
    const slots = suggestFreeSlots({
      date: SATURDAY,
      schedule: { ...fiveMinuteSchedule, appointmentDurationMinutes: 30 },
      serviceDurationMinutes: 5,
      existingAppointments: existing,
      intervalMinutes: 15,
      limit: 96,
      allowImagingOverlap: true,
      serviceName: 'تصوير بانوراما',
    });

    expect(slots).toContain(`${SATURDAY}T19:00:00.000Z`);
    expect(checkSlotAvailability({
      startsAt: `${SATURDAY}T19:00:00.000Z`,
      durationMinutes: 30,
      serviceDurationMinutes: 5,
      schedule: { ...fiveMinuteSchedule, appointmentDurationMinutes: 30 },
      existingAppointments: [...existing, {
        startsAt: `${SATURDAY}T19:00:00.000Z`,
        durationMinutes: 5,
        status: 'confirmed',
        serviceName: 'تصوير بانوراما',
      }],
      allowImagingOverlap: true,
      serviceName: 'تصوير بانوراما',
    })).toMatchObject({ available: false, reason: 'overlap' });
  });
});
