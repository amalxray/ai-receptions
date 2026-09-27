/**
 * Patient age helpers shared by the dashboard (N14 smart patient profile,
 * patient forms, intake screens).
 *
 * Rules that the unit suite locks down:
 *  - empty / whitespace / malformed / impossible dates → null
 *  - future dates → null
 *  - calendar-accurate years + months + days (month-borrow aware)
 */

export type PatientAgeResult = {
  years: number;
  months: number;
  days: number;
};

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Anything above this is treated as a data-entry error, not a real patient. */
const MAX_HUMAN_AGE_YEARS = 130;

/** Local-midnight Date from an ISO date string, or null when not a real day. */
function parseAsLocalDay(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (ISO_DATE_RE.test(trimmed)) {
    const [year, month, day] = trimmed.split('-').map(Number);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
    const parsed = new Date(year, month - 1, day);
    // Reject rolled-over inputs such as "2020-99-99" (Date would silently fix them).
    if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) return null;
    return parsed;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

function daysInMonthBefore(reference: Date): number {
  return new Date(reference.getFullYear(), reference.getMonth(), 0).getDate();
}

/**
 * Exact age (`years` / `months` / `days`) computed on local calendar days.
 * Returns null when the date of birth is missing, invalid, or in the future.
 */
export function calculatePatientAge(
  dateOfBirth?: string | null,
  reference: Date = new Date()
): PatientAgeResult | null {
  if (typeof dateOfBirth !== 'string') return null;

  const birth = parseAsLocalDay(dateOfBirth);
  if (!birth) return null;

  const asOf = reference instanceof Date && !Number.isNaN(reference.getTime()) ? reference : new Date();
  const today = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate());
  if (birth.getTime() > today.getTime()) return null;

  let years = today.getFullYear() - birth.getFullYear();
  let months = today.getMonth() - birth.getMonth();
  let days = today.getDate() - birth.getDate();

  if (days < 0) {
    months -= 1;
    days += daysInMonthBefore(today);
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  if (years < 0) return null;

  return { years, months, days };
}

function pluralizeCount(n: number, forms: { one: string; two: string; few: string; many: string }): string {
  if (n === 1) return forms.one;
  if (n === 2) return forms.two;
  if (n >= 3 && n <= 10) return forms.few.replace('{n}', String(n));
  return forms.many.replace('{n}', String(n));
}

/** Arabic, grammatically sensible age label ("35 سنة"، "سنتان"، "6 أشهر"). */
export function formatAgeAr(age: PatientAgeResult | null | undefined): string {
  if (!age) return 'غير محدد';

  if (age.years >= 1) {
    return pluralizeCount(age.years, {
      one: 'سنة واحدة',
      two: 'سنتان',
      few: '{n} سنوات',
      many: '{n} سنة',
    });
  }

  if (age.months >= 1) {
    return pluralizeCount(age.months, {
      one: 'شهر واحد',
      two: 'شهران',
      few: '{n} أشهر',
      many: '{n} شهر',
    });
  }

  if (age.days >= 1) {
    return pluralizeCount(age.days, {
      one: 'يوم واحد',
      two: 'يومان',
      few: '{n} أيام',
      many: '{n} يوم',
    });
  }

  return 'أقل من يوم';
}

/** True when the value is a real calendar date, not in the future, ≤130 years. */
export function isValidDateOfBirth(value?: string | null, reference: Date = new Date()): boolean {
  if (typeof value !== 'string' || !ISO_DATE_RE.test(value.trim())) return false;
  const age = calculatePatientAge(value, reference);
  return age !== null && age.years <= MAX_HUMAN_AGE_YEARS;
}

