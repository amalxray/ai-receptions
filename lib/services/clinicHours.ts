import { supabaseAdmin } from '@/lib/supabase/admin';
import { logEvent } from '@/lib/server/logging';
import type { ClinicWorkingHoursData } from '@/lib/ai/promptManager';
import {
  ARABIC_WEEKDAYS as ARABIC_DAYS,
  normalizeTime,
  resolveClinicTimezone,
  timeToMinutes,
  zonedParts,
  type ClockPeriod,
} from './clinicClock';

/**
 * All clinic-time helpers are re-exported from here so this module stays the ONE
 * documented entry point for clinic hours AND clinic time. The math itself lives
 * in `./clinicClock` (dependency-free) so pure engines can use it without ever
 * pulling a database client into their module graph.
 */
export {
  DEFAULT_CLINIC_TIMEZONE,
  PALESTINE_TIMEZONES,
  clinicLocalToInstant,
  formatClinicDate,
  formatClinicWeekday,
  formatPalestineTime,
  isValidTimeZone,
  normalizeTime,
  resolveClinicTimezone,
  timeToMinutes,
  zonedParts,
} from './clinicClock';

/**
 * CLINIC HOURS — the SINGLE SOURCE OF TRUTH for a clinic's opening hours and
 * its IANA timezone. Global by default: every read is scoped by clinic_id (id
 * OR slug), there are ZERO hard-coded clinic slugs, so the same code serves
 * every current and future clinic.
 *
 * WHY THIS FILE EXISTS (3 real bugs it closes):
 *  1. `provider_schedules.is_active` DOES NOT EXIST — the real column is
 *     `enabled` (see db/migrations/20260723_appointment_engine.sql). Any query
 *     filtered by `is_active` errored out, so the AI silently lost the whole
 *     working-hours section of its prompt.
 *  2. Server time (`Date.getHours()`) is UTC on Vercel, NOT clinic-local. A
 *     clinic in Asia/Hebron (UTC+3) was told it was CLOSED at 10:00 local time.
 *     Every wall-clock value here is derived through `Intl.DateTimeFormat` with
 *     the clinic's IANA zone.
 *  3. Multi-shift days (`shifts jsonb`) were never read anywhere, so a provider
 *     working 09:00–13:00 + 15:00–20:00 was only ever offered morning slots.
 *
 * STORAGE CONVENTION: instants are stored in UTC (timestamptz / ISO-8601 Z) and
 * only ever DISPLAYED in clinic-local time. Use `clinicLocalToInstant` to turn a
 * clinic-local wall clock ("09:00" on 2026-07-20) into the matching UTC instant.
 */

/** One continuous opening window ("09:00" → "13:00") — same shape as ClockPeriod. */
export type ClinicHourPeriod = ClockPeriod;

/** One weekday of clinic hours, merged across ALL providers of the clinic. */
export type ClinicHoursDay = {
  /** 0 = Sunday … 6 = Saturday (same convention as provider_schedules.weekday). */
  weekday: number;
  /** Every open window of the day, sorted, overlaps merged (shift #1 + `shifts`). */
  periods: ClinicHourPeriod[];
  /** Earliest opening of the day ("HH:MM") — convenience mirror of periods[0]. */
  start: string;
  /** Latest closing of the day ("HH:MM") — convenience mirror of last period. */
  end: string;
  /** Blocked windows (prayer, lunch, …) — informational for display only. */
  breaks: ClinicHourPeriod[];
};

export type ClinicHours = {
  clinicId: string;
  slug: string | null;
  /** Resolved IANA zone (never null — falls back to DEFAULT_CLINIC_TIMEZONE). */
  timezone: string;
  /** True when at least one enabled schedule row exists for this clinic. */
  hasHours: boolean;
  /** Sorted 0→6, only days the clinic is actually open. */
  days: ClinicHoursDay[];
};

/** Next opening window, relative to "now" in clinic-local time. */
export type NextOpening = {
  weekday: number;
  /** Arabic label: "اليوم" / "غداً" / weekday name. */
  day: string;
  /** Clinic-local opening time "HH:MM". */
  time: string;
  /** 0 = later today, 1 = tomorrow, … */
  inDays: number;
};


/* Clinic-time helpers live in ./clinicClock and are re-exported above; the DB
   reads below own the schedules. */
/** Raw `provider_schedules` row (only the columns hours logic depends on). */
type ScheduleRow = {
  weekday: number | null;
  enabled: boolean | null;
  start_time: string | null;
  end_time: string | null;
  shifts?: unknown;
  breaks?: unknown;
  appointment_duration_minutes?: number | null;
};

/** Reads a jsonb period array (`shifts` / `breaks`) defensively. */
function parsePeriods(value: unknown): ClinicHourPeriod[] {
  if (!Array.isArray(value)) return [];
  const periods: ClinicHourPeriod[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    const start = normalizeTime(record.start ?? record.start_time);
    const end = normalizeTime(record.end ?? record.end_time);
    if (!start || !end) continue;
    if (timeToMinutes(end) <= timeToMinutes(start)) continue;
    periods.push({ start, end });
  }
  return periods;
}

/** Sorts periods by start and merges overlapping/touching windows. */
function mergePeriods(periods: ClinicHourPeriod[]): ClinicHourPeriod[] {
  const sorted = [...periods].sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
  const merged: ClinicHourPeriod[] = [];
  for (const period of sorted) {
    const last = merged[merged.length - 1];
    if (last && timeToMinutes(period.start) <= timeToMinutes(last.end)) {
      if (timeToMinutes(period.end) > timeToMinutes(last.end)) last.end = period.end;
      continue;
    }
    merged.push({ ...period });
  }
  return merged;
}

/**
 * One schedule row → its full list of open windows.
 * `start_time`/`end_time` stay authoritative for shift #1 (exactly as the
 * migration documents) and `shifts` (migration 20260827) appends the extra
 * periods. A row with no valid shift #1 still contributes its extra periods.
 */
function rowPeriods(row: ScheduleRow): ClinicHourPeriod[] {
  const periods: ClinicHourPeriod[] = [];
  const start = normalizeTime(row.start_time);
  const end = normalizeTime(row.end_time);
  if (start && end && timeToMinutes(end) > timeToMinutes(start)) periods.push({ start, end });
  periods.push(...parsePeriods(row.shifts));
  return mergePeriods(periods);
}

/** Aggregates rows into clinic-wide days (earliest open / latest close per weekday). */
export function aggregateClinicHours(clinic: {
  id: string;
  slug: string | null;
  timezone?: string | null;
  rows: ScheduleRow[];
}): ClinicHours {
  const byWeekday = new Map<number, { periods: ClinicHourPeriod[]; breaks: ClinicHourPeriod[] }>();
  for (const row of clinic.rows) {
    // `enabled === false` is the only exclusion — a null/missing flag means the
    // row exists and is treated as active, never dropped silently.
    if (row.enabled === false) continue;
    const weekday = Number(row.weekday);
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) continue;
    const bucket = byWeekday.get(weekday) ?? { periods: [], breaks: [] };
    bucket.periods.push(...rowPeriods(row));
    bucket.breaks.push(...parsePeriods(row.breaks));
    byWeekday.set(weekday, bucket);
  }

  const days: ClinicHoursDay[] = Array.from(byWeekday.entries())
    .map(([weekday, bucket]) => {
      const periods = mergePeriods(bucket.periods);
      return {
        weekday,
        periods,
        start: periods[0]?.start ?? '',
        end: periods[periods.length - 1]?.end ?? '',
        breaks: mergePeriods(bucket.breaks),
      };
    })
    .filter((day) => day.periods.length > 0)
    .sort((a, b) => a.weekday - b.weekday);

  return {
    clinicId: clinic.id,
    slug: clinic.slug,
    timezone: resolveClinicTimezone(clinic.timezone),
    hasHours: days.length > 0,
    days,
  };
}

/** Empty result used for every degraded path (never throws to callers). */
function emptyHours(clinicId: string, timezone: string): ClinicHours {
  return { clinicId, slug: null, timezone, hasHours: false, days: [] };
}

/** UUID (with or without dashes) vs. public slug. */
function looksLikeUuid(value: string): boolean {
  return /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i.test(value);
}

/**
 * Loads the full week of opening hours for ONE clinic.
 * Accepts a clinic UUID **or** its public slug (global — no hard-coded clinic).
 * Never throws: failures return an empty (`hasHours: false`) result so callers
 * can degrade gracefully instead of breaking the AI/booking flow.
 */
export async function getClinicHours(
  clinicIdOrSlug: string,
  options?: { timezone?: string | null }
): Promise<ClinicHours> {
  const identifier = (clinicIdOrSlug ?? '').trim();
  if (!identifier) return emptyHours(identifier, resolveClinicTimezone(options?.timezone));

  try {
    const clinicQuery = supabaseAdmin
      .from('clinics')
      .select('id, slug, settings')
      .is('deleted_at', null);
    const { data: clinic, error: clinicError } = await (looksLikeUuid(identifier)
      ? clinicQuery.eq('id', identifier)
      : clinicQuery.eq('slug', identifier)
    ).maybeSingle();

    if (clinicError || !clinic) {
      logEvent('clinic_hours_clinic_missing', { identifier, error: clinicError?.message ?? null }, 'error');
      return emptyHours(identifier, resolveClinicTimezone(options?.timezone));
    }

    const settings = (clinic.settings ?? {}) as Record<string, unknown>;
    const timezone = resolveClinicTimezone(options?.timezone ?? (settings.timezone as string | null) ?? null);
    const baseColumns = 'weekday, enabled, start_time, end_time, breaks, appointment_duration_minutes';

    // `shifts` arrived in migration 20260827 — tolerate databases that predate it.
    const withShifts = await supabaseAdmin
      .from('provider_schedules')
      .select(`${baseColumns}, shifts`)
      .eq('clinic_id', clinic.id)
      .eq('enabled', true)
      .order('weekday', { ascending: true });

    let rows: ScheduleRow[] = [];
    if (withShifts.error) {
      logEvent('clinic_hours_shifts_unavailable', { clinic_id: clinic.id, error: withShifts.error.message });
      const fallback = await supabaseAdmin
        .from('provider_schedules')
        .select(baseColumns)
        .eq('clinic_id', clinic.id)
        .eq('enabled', true)
        .order('weekday', { ascending: true });
      if (fallback.error) {
        logEvent('clinic_hours_schedules_error', { clinic_id: clinic.id, error: fallback.error.message }, 'error');
        return emptyHours(clinic.id, timezone);
      }
      rows = (fallback.data ?? []) as ScheduleRow[];
    } else {
      rows = (withShifts.data ?? []) as ScheduleRow[];
    }

    return aggregateClinicHours({ id: clinic.id, slug: clinic.slug ?? null, timezone, rows });
  } catch (error) {
    logEvent(
      'clinic_hours_load_failed',
      { identifier, error: error instanceof Error ? error.message : String(error) },
      'error'
    );
    return emptyHours(identifier, resolveClinicTimezone(options?.timezone));
  }
}
/**
 * Accepts either already-loaded hours or a clinic id/slug — so a single call
 * site can pass the hours it just loaded (no duplicate query) while the public
 * API (`isOpenNow('clinic-slug')`) stays a one-liner.
 */
async function resolveHours(
  clinicOrHours: string | ClinicHours,
  options?: { timezone?: string | null }
): Promise<ClinicHours> {
  if (typeof clinicOrHours !== 'string') return clinicOrHours;
  return getClinicHours(clinicOrHours, options);
}

/** The open window covering `time` (clinic-local "HH:MM"), or null. */
export function periodCovering(day: ClinicHoursDay | null | undefined, time: string): ClinicHourPeriod | null {
  if (!day) return null;
  const minutes = timeToMinutes(time);
  for (const period of day.periods) {
    if (minutes >= timeToMinutes(period.start) && minutes < timeToMinutes(period.end)) return period;
  }
  return null;
}

/** Today's clinic hours day in CLINIC-LOCAL time (never server/UTC). */
export function todayHours(hours: ClinicHours, now: Date = new Date()): ClinicHoursDay | null {
  if (!hours.hasHours) return null;
  const { weekday } = zonedParts(now, hours.timezone);
  return hours.days.find((day) => day.weekday === weekday) ?? null;
}

/**
 * Is the clinic open RIGHT NOW? `now` is converted to clinic-local time first,
 * which is exactly the fix for the UTC/server-clock bug: a Vercel server running
 * in UTC will report the correct status for an Asia/Hebron clinic at 10:00.
 */
export async function isOpenNow(
  clinicOrHours: string | ClinicHours,
  now: Date = new Date(),
  options?: { timezone?: string | null }
): Promise<{ isOpen: boolean; timezone: string; currentTime: string; todaySchedule: ClinicHourPeriod | null; day: ClinicHoursDay | null }> {
  const hours = await resolveHours(clinicOrHours, options);
  const { time } = zonedParts(now, hours.timezone);
  const day = todayHours(hours, now);
  const covering = periodCovering(day, time);
  return {
    isOpen: Boolean(covering),
    timezone: hours.timezone,
    currentTime: time,
    todaySchedule: covering,
    day,
  };
}

/**
 * When does the clinic next open? Scans today (if the opening time is still
 * ahead), then the next 7 days, in clinic-local time. Returns Arabic labels so
 * the public badge and the AI prompt can both use it verbatim.
 */
export async function nextOpening(
  clinicOrHours: string | ClinicHours,
  now: Date = new Date(),
  options?: { timezone?: string | null }
): Promise<NextOpening | null> {
  const hours = await resolveHours(clinicOrHours, options);
  if (!hours.hasHours) return null;
  const { weekday, time } = zonedParts(now, hours.timezone);
  for (let offset = 0; offset <= 7; offset += 1) {
    const weekdayAtOffset = (weekday + offset) % 7;
    const day = hours.days.find((item) => item.weekday === weekdayAtOffset);
    if (!day) continue;
    for (const period of day.periods) {
      // Later today only (a window already started is not a "next opening").
      if (offset === 0 && timeToMinutes(period.start) <= timeToMinutes(time)) continue;
      return {
        weekday: weekdayAtOffset,
        day: offset === 0 ? 'اليوم' : offset === 1 ? 'غداً' : ARABIC_DAYS[weekdayAtOffset],
        time: period.start,
        inDays: offset,
      };
    }
  }
  return null;
}

/**
 * Adapter to the prompt layer's `ClinicWorkingHoursData` (one shape, one source).
 * Returns null when the clinic has no schedules so the prompt section is simply
 * omitted — never a bogus "all days closed" table.
 */
export function toClinicWorkingHoursData(
  hours: ClinicHours,
  now: Date = new Date()
): ClinicWorkingHoursData | null {
  if (!hours.hasHours) return null;
  const { weekday, time } = zonedParts(now, hours.timezone);
  const day = hours.days.find((item) => item.weekday === weekday) ?? null;
  return {
    days: hours.days.map((item) => ({
      weekday: item.weekday,
      // Shift #1 ∪ extra shifts → the prompt states the REAL day span.
      start_time: item.start,
      end_time: item.end,
    })),
    todayName: ARABIC_DAYS[weekday] ?? '',
    todayWeekday: weekday,
    currentTime: time,
    isOpenNow: Boolean(periodCovering(day, time)),
  };
}

/** Multi-shift days rendered as text ("09:00-13:00, 15:00-20:00"). */
export function describePeriods(periods: ClinicHourPeriod[]): string {
  if (periods.length === 0) return '';
  return periods.map((period) => `${period.start}-${period.end}`).join(', ');
}
