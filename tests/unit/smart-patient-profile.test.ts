import { describe, expect, it } from 'vitest';
import { calculatePatientAge, formatAgeAr } from '@/lib/patientAge';

/** Local-midnight reference dates keep these expectations timezone-proof. */
const asOf = () => new Date(2025, 4, 15); // May 15, 2025

describe('Smart Patient Profile — N14 Age & Logic', () => {
  it('calculates exact age in years from ISO date_of_birth', () => {
    const age = calculatePatientAge('1990-05-15', asOf());
    expect(age).not.toBeNull();
    expect(age?.years).toBe(35);
    expect(age).toEqual({ years: 35, months: 0, days: 0 });
  });

  it('adjusts age if the birthday has not arrived yet in the current year', () => {
    const ageBeforeBday = calculatePatientAge('1990-12-25', asOf());
    expect(ageBeforeBday?.years).toBe(34);

    const ageAfterBday = calculatePatientAge('1990-01-01', asOf());
    expect(ageAfterBday?.years).toBe(35);
  });

  it('returns null gracefully for invalid, empty or future dates', () => {
    expect(calculatePatientAge(null)).toBeNull();
    expect(calculatePatientAge(undefined)).toBeNull();
    expect(calculatePatientAge('')).toBeNull();
    expect(calculatePatientAge('not-a-date')).toBeNull();
    expect(calculatePatientAge('2099-01-01', asOf())).toBeNull();
  });

  it('handles the edge case of a newborn born today (0 years old)', () => {
    const age = calculatePatientAge('2025-05-15', asOf());
    expect(age).not.toBeNull();
    expect(age).toEqual({ years: 0, months: 0, days: 0 });
    expect(formatAgeAr(age)).toBe('أقل من يوم');
  });

  it('surfaces infants in months so the profile never reads "0 سنة"', () => {
    const infant = calculatePatientAge('2024-11-15', asOf());
    expect(infant).toEqual({ years: 0, months: 6, days: 0 });
    expect(formatAgeAr(infant)).toBe('6 أشهر');
  });
});
