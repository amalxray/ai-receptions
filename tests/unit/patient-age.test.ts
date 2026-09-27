import { describe, it, expect } from 'vitest';
import { calculatePatientAge, formatAgeAr, isValidDateOfBirth } from '@/lib/patientAge';

describe('calculatePatientAge', () => {
  it('returns null for null, undefined, or empty date of birth', () => {
    expect(calculatePatientAge(null)).toBeNull();
    expect(calculatePatientAge(undefined)).toBeNull();
    expect(calculatePatientAge('')).toBeNull();
    expect(calculatePatientAge('   ')).toBeNull();
  });

  it('returns null for invalid date formats', () => {
    expect(calculatePatientAge('invalid-date')).toBeNull();
    expect(calculatePatientAge('2020-99-99')).toBeNull();
  });

  it('returns null for future dates', () => {
    const future = new Date();
    future.setFullYear(future.getFullYear() + 2);
    expect(calculatePatientAge(future.toISOString().slice(0, 10))).toBeNull();
  });

  it('calculates exact age correctly relative to a fixed reference date', () => {
    const asOf = new Date(2026, 4, 15); // May 15, 2026

    // Birthday hasn't happened yet this year (born Dec 1990) -> 35
    const p1 = calculatePatientAge('1990-12-01', asOf);
    expect(p1).toEqual({ years: 35, months: 5, days: 14 });

    // Birthday happened already this year (born Jan 1990) -> 36
    const p2 = calculatePatientAge('1990-01-10', asOf);
    expect(p2?.years).toBe(36);

    // Exact 35th birthday (born May 15, 1991) -> 35 years 0 months 0 days
    const p3 = calculatePatientAge('1991-05-15', asOf);
    expect(p3).toEqual({ years: 35, months: 0, days: 0 });
  });

  it('calculates infant age under 1 year with months', () => {
    const asOf = new Date(2026, 4, 15);
    const infant = calculatePatientAge('2025-10-15', asOf);
    expect(infant?.years).toBe(0);
    expect(infant?.months).toBe(7);
  });
});

describe('formatAgeAr', () => {
  it('formats age gracefully in Arabic', () => {
    expect(formatAgeAr({ years: 35, months: 0, days: 0 })).toBe('35 سنة');
    expect(formatAgeAr({ years: 1, months: 2, days: 0 })).toBe('سنة واحدة');
    expect(formatAgeAr({ years: 2, months: 0, days: 0 })).toBe('سنتان');
    expect(formatAgeAr({ years: 5, months: 0, days: 0 })).toBe('5 سنوات');
    expect(formatAgeAr({ years: 0, months: 6, days: 0 })).toBe('6 أشهر');
    expect(formatAgeAr(null)).toBe('غير محدد');
  });
});

describe('isValidDateOfBirth', () => {
  it('validates proper YYYY-MM-DD birthdates within realistic human bounds', () => {
    expect(isValidDateOfBirth('1989-05-14')).toBe(true);
    expect(isValidDateOfBirth('2000-01-01')).toBe(true);
    expect(isValidDateOfBirth('1800-01-01')).toBe(false); // >130 years
    expect(isValidDateOfBirth('not-a-date')).toBe(false);
  });
});
