/**
 * BOOKING CALENDAR — pure date helpers for the public booking step 3.
 *
 * WHY THIS EXISTS (issue #39, iOS follow-up): `<input type="date">` on iOS
 * Chrome/Safari shows no placeholder and never opens the native picker, so
 * patients were stuck on "اختر التاريخ". The flow now renders a real calendar
 * (react-day-picker) and every conversion it needs lives here — framework-free,
 * timezone-safe and unit-tested.
 *
 * Conventions:
 * - Wire format is `YYYY-MM-DD` (what the booking APIs already speak).
 * - Dates are built from LOCAL calendar fields — never `toISOString()` — so a
 *   clinic in UTC+3 or a patient in UTC-5 gets the day they actually tapped.
 * - Weekday indexes follow `provider_schedules.weekday` (0 = Sunday, 6 = Saturday),
 *   the same convention the scheduling engine uses (`getUTCDay`/`getDay`).
 */

export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const ISO_MONTH_RE = /^\d{4}-\d{2}$/;

/** `Date` → `YYYY-MM-DD` from local calendar fields (no UTC shift). */
export function toISODate(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * `YYYY-MM-DD` → local midnight `Date`.
 * Returns null for anything that is not a real calendar date (including values
 * like `2026-02-31` that `new Date()` would silently roll over).
 */
export function fromISODate(iso: string | null | undefined): Date | null {
  if (!iso || !ISO_DATE_RE.test(iso)) return null;
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return toISODate(date) === iso ? date : null;
}

/** Local midnight of `date` (defaults to now) — the calendar's minimum day. */
export function startOfDay(date: Date = new Date()): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** First day of `date`'s month (local) — seeds the visible month. */
export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/** `YYYY-MM-DD` → `YYYY-MM`. */
export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

/** `YYYY-MM` of a `Date` (local fields). */
export function monthKeyOf(date: Date): string {
  return monthKey(toISODate(date));
}

/** Every `YYYY-MM-DD` in `YYYY-MM`, expanded with UTC arithmetic (DST-proof). */
export function daysInMonth(month: string): string[] {
  if (!ISO_MONTH_RE.test(month)) return [];
  const [year, monthNumber] = month.split('-').map(Number);
  const total = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return Array.from({ length: total }, (_, index) => `${month}-${`${index + 1}`.padStart(2, '0')}`);
}

/** Latest bookable day (12 months out keeps month navigation finite). */
export function maxBookableISO(today: Date = new Date()): string {
  return toISODate(new Date(today.getFullYear() + 1, today.getMonth(), today.getDate()));
}

/** Arabic long date — same convention as the dashboard pages ("الجمعة، 25 سبتمبر"). */
export function formatArabicDate(iso: string | null | undefined): string {
  const date = fromISODate(iso);
  if (!date) return '';
  return date.toLocaleDateString('ar', { weekday: 'long', day: 'numeric', month: 'long' });
}

/** Arabic month caption ("سبتمبر 2026"). */
export function formatArabicMonth(month: string | null | undefined): string {
  const first = fromISODate(month && ISO_MONTH_RE.test(month) ? `${month}-01` : null);
  if (!first) return '';
  return first.toLocaleDateString('ar', { month: 'long', year: 'numeric' });
}

export type DayAvailability = {
  /** ISO day under test. */
  iso: string;
  /** Local today — anything earlier is unselectable. */
  todayISO: string;
  /** Definitive closures: clinic holidays + provider vacation days. */
  closedDays?: string[] | null;
  /** Weekdays the provider works (0 = Sunday). Empty/null → unknown, nothing masked. */
  workingWeekdays?: number[] | null;
  /** Hard stop for far-future bookings (`maxBookableISO`). */
  maxISO?: string | null;
};

/**
 * Single source of truth for "can the patient tap this day?".
 *
 * Fail-open by design: unknown schedule data NEVER hides days. The slots API
 * stays authoritative for what is actually bookable, so the worst case is a
 * dead-end the patient can walk back from — never a calendar that looks empty.
 */
export function isDaySelectable({
  iso,
  todayISO,
  closedDays,
  workingWeekdays,
  maxISO,
}: DayAvailability): boolean {
  if (!ISO_DATE_RE.test(iso)) return false;
  if (iso < todayISO) return false;
  if (maxISO && iso > maxISO) return false;
  if (closedDays && closedDays.includes(iso)) return false;

  if (workingWeekdays && workingWeekdays.length > 0) {
    const date = fromISODate(iso);
    if (date && !workingWeekdays.includes(date.getDay())) return false;
  }

  return true;
}
