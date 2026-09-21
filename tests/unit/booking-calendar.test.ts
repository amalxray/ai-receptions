import { describe, it, expect } from 'vitest';
import {
  daysInMonth,
  formatArabicDate,
  formatArabicMonth,
  fromISODate,
  isDaySelectable,
  maxBookableISO,
  monthKey,
  monthKeyOf,
  startOfDay,
  startOfMonth,
  toISODate,
} from '@/lib/booking/calendar';

// #39 follow-up — the booking step-3 calendar replaced `<input type="date">`
// (iOS Chrome/Safari never opened the native picker). These are the pure date
// decisions behind it: a timezone slip here means a patient books the wrong day.

describe('ISO conversion is timezone-proof', () => {
  it('round-trips a date without a UTC shift', () => {
    const iso = '2026-09-25';
    expect(toISODate(fromISODate(iso)!)).toBe(iso);
  });

  it('formats from local calendar fields (never toISOString)', () => {
    expect(toISODate(new Date(2026, 8, 25, 0, 30))).toBe('2026-09-25');
    expect(toISODate(new Date(2026, 8, 25, 23, 30))).toBe('2026-09-25');
  });

  it('rejects impossible and malformed dates', () => {
    expect(fromISODate('2026-02-31')).toBeNull();
    expect(fromISODate('25/09/2026')).toBeNull();
    expect(fromISODate('')).toBeNull();
    expect(fromISODate(null)).toBeNull();
  });

  it('expands a month with UTC arithmetic (no DST drift)', () => {
    const days = daysInMonth('2026-09');
    expect(days).toHaveLength(30);
    expect(days[0]).toBe('2026-09-01');
    expect(days[29]).toBe('2026-09-30');
    expect(daysInMonth('2026-02')).toHaveLength(28);
    expect(daysInMonth('nope')).toEqual([]);
  });

  it('derives month keys and day/month starts', () => {
    expect(monthKey('2026-09-25')).toBe('2026-09');
    expect(monthKeyOf(new Date(2026, 8, 25))).toBe('2026-09');
    expect(startOfMonth(new Date(2026, 8, 25)).getDate()).toBe(1);
    expect(startOfDay(new Date(2026, 8, 25, 13, 45)).getHours()).toBe(0);
  });

  it('caps bookings at ~12 months out', () => {
    expect(maxBookableISO(new Date(2026, 0, 31))).toBe('2027-01-31');
  });
});

describe('Arabic labels', () => {
  it('renders a long Arabic date', () => {
    expect(formatArabicDate('2026-09-25')).toContain('سبتمبر');
    expect(formatArabicDate('')).toBe('');
    expect(formatArabicDate('bad')).toBe('');
  });

  it('renders an Arabic month caption', () => {
    expect(formatArabicMonth('2026-09')).toContain('سبتمبر');
    expect(formatArabicMonth(null)).toBe('');
  });
});

describe('isDaySelectable', () => {
  // 2026-09-25 is a Friday, 26 a Saturday, 27 a Sunday.
  const todayISO = '2026-09-25';

  it('blocks the past but allows today and tomorrow', () => {
    expect(isDaySelectable({ iso: '2026-09-24', todayISO })).toBe(false);
    expect(isDaySelectable({ iso: '2026-09-25', todayISO })).toBe(true);
    expect(isDaySelectable({ iso: '2026-09-26', todayISO })).toBe(true);
  });

  it('blocks clinic holidays and provider vacations', () => {
    const closedDays = ['2026-09-30', '2026-10-01'];
    expect(isDaySelectable({ iso: '2026-09-30', todayISO, closedDays })).toBe(false);
    expect(isDaySelectable({ iso: '2026-09-29', todayISO, closedDays })).toBe(true);
  });

  it('blocks the weekdays the provider does not work', () => {
    const workingWeekdays = [0, 1, 2, 3, 4]; // Sunday–Thursday
    expect(isDaySelectable({ iso: '2026-09-25', todayISO, workingWeekdays })).toBe(false); // Friday
    expect(isDaySelectable({ iso: '2026-09-26', todayISO, workingWeekdays })).toBe(false); // Saturday
    expect(isDaySelectable({ iso: '2026-09-27', todayISO, workingWeekdays })).toBe(true);  // Sunday
  });

  it('fail-open: an unknown weekly pattern masks nothing', () => {
    expect(isDaySelectable({ iso: '2026-09-25', todayISO, workingWeekdays: [] })).toBe(true);
    expect(isDaySelectable({ iso: '2026-09-25', todayISO, workingWeekdays: null })).toBe(true);
    expect(isDaySelectable({ iso: '2026-09-25', todayISO })).toBe(true);
  });

  it('blocks days beyond the 12-month horizon', () => {
    const maxISO = '2027-09-25';
    expect(isDaySelectable({ iso: '2027-09-26', todayISO, maxISO })).toBe(false);
    expect(isDaySelectable({ iso: '2027-09-25', todayISO, maxISO })).toBe(true);
  });

  it('rejects malformed input', () => {
    expect(isDaySelectable({ iso: 'x', todayISO })).toBe(false);
  });
});
