import { describe, expect, it } from 'vitest';
import { suggestFreeSlots, type ProviderSchedule } from '@/lib/services/scheduling';

/** Reproduces the reported bug: clinic_services.duration_minutes = 5. */
const fiveMinuteSchedule: ProviderSchedule = {
  providerId: 'provider-1',
  clinicId: 'clinic-1',
  appointmentDurationMinutes: 5,
  days: [{ weekday: 6, enabled: true, start: '09:00', end: '20:00', breaks: [] }],
};

const SATURDAY = '2026-09-19';

describe('hourly-only slot display contract (full hours, 12h Arabic UI)', () => {
  it('presents ONLY full-hour starts (…:00) even with a 5-minute catalog duration', () => {
    const slots = suggestFreeSlots({ date: SATURDAY, schedule: fiveMinuteSchedule, hourlyOnly: true, limit: 200 });
    expect(slots.length).toBeGreaterThan(0);
    for (const slot of slots) {
      expect(slot).toMatch(/^2026-09-19T\d{2}:00:00\.000Z$/);
    }
    // 9:00 → 19:00 inside a 9:00–20:00 window (19:00 + 5min ≤ 20:00).
    expect(slots[0]).toBe(`${SATURDAY}T09:00:00.000Z`);
    expect(slots[1]).toBe(`${SATURDAY}T10:00:00.000Z`);
    expect(slots).toHaveLength(11);
  });

  it('keeps the REAL service duration for the session end + overlap validation', () => {
    // An existing 11:50–11:55 appointment must NOT block the 12:00 proposal.
    const slots = suggestFreeSlots({
      date: SATURDAY,
      schedule: fiveMinuteSchedule,
      hourlyOnly: true,
      limit: 200,
      existingAppointments: [{ startsAt: `${SATURDAY}T11:50:00.000Z`, durationMinutes: 5, status: 'confirmed' }],
    });
    expect(slots).toContain(`${SATURDAY}T12:00:00.000Z`);
    // …but a full-hour existing booking DOES block its hour.
    const blocked = suggestFreeSlots({
      date: SATURDAY,
      schedule: fiveMinuteSchedule,
      hourlyOnly: true,
      limit: 200,
      existingAppointments: [{ startsAt: `${SATURDAY}T10:00:00.000Z`, durationMinutes: 5, status: 'confirmed' }],
    });
    expect(blocked).not.toContain(`${SATURDAY}T10:00:00.000Z`);
    expect(blocked).toContain(`${SATURDAY}T11:00:00.000Z`);
  });

  it('leaves the legacy sub-hour generation untouched when hourlyOnly is omitted', () => {
    const slots = suggestFreeSlots({ date: SATURDAY, schedule: fiveMinuteSchedule, limit: 3 });
    expect(slots).toEqual([
      `${SATURDAY}T09:00:00.000Z`,
      `${SATURDAY}T09:05:00.000Z`,
      `${SATURDAY}T09:10:00.000Z`,
    ]);
  });

  it('snaps a mid-hour period start UP to the next full hour', () => {
    const lateStart: ProviderSchedule = {
      ...fiveMinuteSchedule,
      days: [{ weekday: 6, enabled: true, start: '09:20', end: '20:00', breaks: [] }],
    };
    const slots = suggestFreeSlots({ date: SATURDAY, schedule: lateStart, hourlyOnly: true, limit: 200 });
    expect(slots[0]).toBe(`${SATURDAY}T10:00:00.000Z`);
  });
});
