import { describe, expect, it } from 'vitest';
import {
  aggregateClinicHours,
  formatPalestineTime,
  isOpenNow,
  nextOpening,
  todayHours,
  type ClinicHours,
} from '@/lib/services/clinicHours';
import { suggestFreeSlots, type ProviderSchedule } from '@/lib/services/scheduling';

// PHASE 1 — the clinic-hours contract. Every assertion targets a REAL bug that
// was fixed in this phase:
//   F1/F3: provider_schedules uses `enabled` (there is no `is_active` column) and
//          `shifts` are honoured (the "9:00 only" symptom).
//   F2   : wall-clock time is computed in the CLINIC's IANA zone, not the
//          server's (Vercel = UTC, which is 3h behind Asia/Hebron).
//   F6   : suggestFreeSlots walks every real window with the real duration.

/** Monday 2026-07-20 — weekday 1 in provider_schedules. */
const MONDAY = '2026-07-20';

const hebronHours: ClinicHours = aggregateClinicHours({
  id: 'clinic-1',
  slug: 'clinic-one',
  timezone: 'Asia/Hebron',
  rows: [{ weekday: 1, enabled: true, start_time: '09:00', end_time: '13:00' }],
});

describe('clinic hours — provider_schedules semantics (F1/F3)', () => {
  it('ignores disabled rows and keeps enabled ones', () => {
    const hours = aggregateClinicHours({
      id: 'c',
      slug: null,
      timezone: 'Asia/Hebron',
      rows: [
        { weekday: 1, enabled: true, start_time: '09:00', end_time: '17:00' },
        { weekday: 2, enabled: false, start_time: '09:00', end_time: '17:00' },
      ],
    });
    expect(hours.days.map((day) => day.weekday)).toEqual([1]);
    expect(hours.hasHours).toBe(true);
  });

  it('honours extra `shifts` windows instead of only start_time/end_time', () => {
    const hours = aggregateClinicHours({
      id: 'c',
      slug: null,
      timezone: 'Asia/Hebron',
      rows: [
        {
          weekday: 1,
          enabled: true,
          start_time: '09:00:00',
          end_time: '13:00:00',
          shifts: [{ start: '15:00', end: '20:00' }],
        },
      ],
    });
    expect(hours.days[0].periods).toEqual([
      { start: '09:00', end: '13:00' },
      { start: '15:00', end: '20:00' },
    ]);
    // Whole-day span, so the AI can honestly say "09:00–20:00".
    expect(hours.days[0].start).toBe('09:00');
    expect(hours.days[0].end).toBe('20:00');
  });

  it('returns an empty week (hasHours false) when a clinic has no schedules', () => {
    const hours = aggregateClinicHours({ id: 'c', slug: null, timezone: 'Asia/Hebron', rows: [] });
    expect(hours.hasHours).toBe(false);
    expect(hours.days).toEqual([]);
    expect(todayHours(hours)).toBeNull();
  });
});

describe('clinic hours — Asia/Hebron timezone (F2)', () => {
  it('formats the clinic wall clock, not the server clock', () => {
    // 07:00 UTC is 10:00 in Hebron during IDT (UTC+3).
    expect(formatPalestineTime(new Date('2026-07-20T07:00:00Z'), 'Asia/Hebron')).toBe('10:00');
  });

  it('reports OPEN at 10:00 clinic-local time even when the server is at 07:00 UTC', async () => {
    // The old code compared `now.getHours()` (07) against 09:00–13:00 → CLOSED.
    const status = await isOpenNow(hebronHours, new Date('2026-07-20T07:00:00Z'));
    expect(status.isOpen).toBe(true);
    expect(status.currentTime).toBe('10:00');
    expect(status.todaySchedule).toEqual({ start: '09:00', end: '13:00' });
  });

  it('reports CLOSED after the clinic day ends, locally', async () => {
    const status = await isOpenNow(hebronHours, new Date('2026-07-20T12:00:00Z')); // 15:00 local
    expect(status.isOpen).toBe(false);
    expect(status.currentTime).toBe('15:00');
  });

  it('falls back to the project default zone for an unknown timezone', () => {
    expect(formatPalestineTime(new Date('2026-07-20T07:00:00Z'), 'Not/AZone')).toBe('10:00');
    expect(formatPalestineTime(new Date('2026-07-20T07:00:00Z'), null)).toBe('10:00');
  });

  it('resolves the next opening in clinic-local time', async () => {
    // Monday 04:00 UTC = 07:00 local → clinic opens today at 09:00 local.
    const opening = await nextOpening(hebronHours, new Date('2026-07-20T04:00:00Z'));
    expect(opening).toEqual({ weekday: 1, day: 'اليوم', time: '09:00', inDays: 0 });
  });
});

describe('suggestFreeSlots — real multi-shift windows (F6)', () => {
  const schedule: ProviderSchedule = {
    providerId: 'provider-1',
    clinicId: 'clinic-1',
    appointmentDurationMinutes: 30,
    days: [
      {
        weekday: 1,
        enabled: true,
        start: '09:00',
        end: '13:00',
        periods: [
          { start: '09:00', end: '13:00' },
          { start: '15:00', end: '20:00' },
        ],
      },
    ],
  };

  it('offers afternoon slots too, not just the first shift at 09:00', () => {
    const slots = suggestFreeSlots({ date: MONDAY, schedule, limit: 10 });
    expect(slots).toContain(`${MONDAY}T15:00:00.000Z`);
    expect(slots).toContain(`${MONDAY}T15:30:00.000Z`);
    // Morning window still fully offered (8 half-hour slots before 13:00).
    expect(slots[0]).toBe(`${MONDAY}T09:00:00.000Z`);
  });

  it('honours breaks inside the real windows', () => {
    const withBreak: ProviderSchedule = {
      ...schedule,
      days: [{ ...schedule.days[0], breaks: [{ start: '09:30', end: '10:30' }] }],
    };
    const slots = suggestFreeSlots({ date: MONDAY, schedule: withBreak });
    expect(slots).not.toContain(`${MONDAY}T09:30:00.000Z`);
    expect(slots).not.toContain(`${MONDAY}T10:00:00.000Z`);
    expect(slots).toContain(`${MONDAY}T10:30:00.000Z`);
  });

  it('converts slots to UTC instants when the clinic timezone is supplied', () => {
    const slots = suggestFreeSlots({ date: MONDAY, schedule, limit: 1, timeZone: 'Asia/Hebron' });
    // 09:00 clinic-local == 06:00Z in July (Hebron = UTC+3).
    expect(slots[0]).toBe(`${MONDAY}T06:00:00.000Z`);
  });

  it('keeps the legacy wall-clock-as-UTC form when no timezone is given', () => {
    const slots = suggestFreeSlots({ date: MONDAY, schedule, limit: 1 });
    expect(slots[0]).toBe(`${MONDAY}T09:00:00.000Z`);
  });
});