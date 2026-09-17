/**
 * CLINIC CLOCK — PURE timezone math (ZERO imports on purpose).
 *
 * WHY A SEPARATE FILE: `lib/services/clinicHours.ts` owns the DB reads, so it
 * necessarily imports the Supabase admin client. The booking/scheduling engine
 * (`lib/services/scheduling.ts`) must stay dependency-free — it is unit-tested in
 * isolation and must never pull a database client into its module graph. So the
 * clock math lives here and `clinicHours` re-exports it: one implementation, no
 * duplication, no coupling.
 *
 * THE BUG THIS FIXES: Vercel servers run in UTC. `new Date().getHours()` on a
 * clinic located in Asia/Hebron (UTC+3) is 3 hours behind local wall-clock time,
 * so "is the clinic open now?" was wrong for a third of every day. Every
 * wall-clock value must come from `Intl.DateTimeFormat` with the clinic's IANA
 * zone — never from `getHours()` / `getDay()`.
 *
 * STORAGE CONVENTION: instants are stored and transmitted in UTC (ISO-8601 `Z`);
 * only DISPLAY uses clinic-local time. `clinicLocalToInstant` converts a local
 * wall clock ("09:00" on 2026-07-20) into the matching UTC instant.
 */

/** Fallback zone when a clinic has no `settings.timezone` (project default). */
export const DEFAULT_CLINIC_TIMEZONE = 'Asia/Jerusalem';

/** Recognised Palestine / Levant zones — used only for validation + repair. */
export const PALESTINE_TIMEZONES = ['Asia/Hebron', 'Asia/Jerusalem', 'Asia/Gaza', 'Asia/Amman'] as const;

/** Arabic weekday names, index-aligned with `provider_schedules.weekday` (0 = Sunday). */
export const ARABIC_WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'] as const;

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** One continuous window of a day ("09:00" → "13:00"). */
export type ClockPeriod = { start: string; end: string };

/** "09:00:00" | "9:00" → "09:00". Unparseable input returns null. */
export function normalizeTime(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/** "HH:MM" → minutes since midnight (used for comparisons). */
export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/** True when `timezone` is a zone the runtime actually understands. */
export function isValidTimeZone(timezone: string | null | undefined): boolean {
  if (!timezone) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/** Resolves the clinic zone, falling back to the project default (never throws). */
export function resolveClinicTimezone(timezone: string | null | undefined): string {
  return isValidTimeZone(timezone) ? (timezone as string) : DEFAULT_CLINIC_TIMEZONE;
}

/**
 * Clinic-local wall clock for an instant, derived with `Intl` (DST-safe).
 * This is THE replacement for `Date.getHours()` / `Date.getDay()`.
 */
export function zonedParts(
  date: Date,
  timezone: string
): { weekday: number; date: string; time: string; hour: number; minute: number } {
  const zone = resolveClinicTimezone(timezone);
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hour12: false,
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).formatToParts(date);
    const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
    const rawHour = Number(value('hour'));
    // Some ICU builds render midnight as "24" in 24h mode.
    const hour = rawHour === 24 ? 0 : rawHour;
    const minute = Number(value('minute'));
    return {
      weekday: WEEKDAY_INDEX[value('weekday')] ?? date.getUTCDay(),
      date: `${value('year')}-${value('month')}-${value('day')}`,
      time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
      hour,
      minute,
    };
  } catch {
    return {
      weekday: date.getUTCDay(),
      date: date.toISOString().slice(0, 10),
      time: date.toISOString().slice(11, 16),
      hour: date.getUTCHours(),
      minute: date.getUTCMinutes(),
    };
  }
}

/** Offset (minutes) between UTC and the zone at that instant: UTC+3 → 180. */
function timeZoneOffsetMinutes(instant: Date, timezone: string): number {
  const probe = new Date(Math.floor(instant.getTime() / 1000) * 1000);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(probe);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? '0');
  const hour = value('hour') === 24 ? 0 : value('hour');
  const asUtc = Date.UTC(value('year'), value('month') - 1, value('day'), hour, value('minute'), value('second'));
  return Math.round((asUtc - probe.getTime()) / 60_000);
}

/**
 * Turns a CLINIC-LOCAL wall clock into the matching UTC instant.
 * `clinicLocalToInstant('2026-07-20', '09:00', 'Asia/Hebron')` → 06:00Z.
 * Two passes keep it correct across DST transitions.
 */
export function clinicLocalToInstant(dateIso: string, time: string, timezone: string): Date {
  const zone = resolveClinicTimezone(timezone);
  const normalized = normalizeTime(time) ?? '00:00';
  const [year, month, day] = dateIso.split('-').map(Number);
  const [hours, minutes] = normalized.split(':').map(Number);
  const guess = Date.UTC(year, (month ?? 1) - 1, day ?? 1, hours, minutes, 0);
  const firstPass = guess - timeZoneOffsetMinutes(new Date(guess), zone) * 60_000;
  const secondPass = guess - timeZoneOffsetMinutes(new Date(firstPass), zone) * 60_000;
  return new Date(secondPass);
}

/** Uniform clinic-local time formatting: "HH:MM" (24h) in the clinic's zone. */
export function formatPalestineTime(date: Date, timezone?: string | null): string {
  return zonedParts(date, resolveClinicTimezone(timezone)).time;
}

/** Clinic-local calendar date (YYYY-MM-DD) for an instant. */
export function formatClinicDate(date: Date, timezone?: string | null): string {
  return zonedParts(date, resolveClinicTimezone(timezone)).date;
}

/** Arabic weekday name of an instant, in the clinic's zone. */
export function formatClinicWeekday(date: Date, timezone?: string | null): string {
  return ARABIC_WEEKDAYS[zonedParts(date, resolveClinicTimezone(timezone)).weekday] ?? '';
}

