import { clinicLocalToInstant, zonedParts } from './clinicClock';

export type ScheduleDay = {
  weekday: number;
  enabled: boolean;
  start: string;
  end: string;
  /**
   * Multi-shift windows (`provider_schedules.shifts`, migration 20260827).
   * When present these REPLACE start/end for availability, so a provider who
   * works 09:00–13:00 + 15:00–20:00 is also offered the evening slots — the bug
   * where only "09:00" ever came back. Absent/empty keeps the legacy single
   * `start`→`end` window, so existing data behaves EXACTLY as before.
   */
  periods?: Array<{ start: string; end: string }>;
  breaks?: Array<{ start: string; end: string }>;
};

export type ProviderSchedule = {
  providerId: string;
  clinicId: string;
  days: ScheduleDay[];
  vacationDates?: string[];
  appointmentDurationMinutes: number;
  maxAppointmentsPerDay?: number | null;
};

export type ScheduledAppointment = {
  id?: string;
  providerId?: string | null;
  startsAt: string;
  durationMinutes: number;
  status?: string;
};

export type AvailabilityReason = 'available' | 'invalid_duration' | 'provider_unavailable' | 'clinic_closed' | 'holiday' | 'vacation' | 'outside_working_hours' | 'break_time' | 'overlap' | 'maximum_daily_appointments';

export type AvailabilityResult = { available: boolean; reason: AvailabilityReason; endsAt: string };

const ACTIVE_STATUSES = new Set(['scheduled', 'tentative', 'confirmed']);

function minutes(time: string) {
  const [hours, mins] = time.split(':').map(Number);
  return hours * 60 + mins;
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function parseLocalDateTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error('Invalid appointment date');
  return parsed;
}

/**
 * The real open windows of a day: explicit multi-shift `periods` when the clinic
 * configured them (provider_schedules.shifts), otherwise the legacy single
 * `start`→`end` window. One rule for every clinic/provider — no special cases.
 */
export function dayPeriods(day: ScheduleDay): Array<{ start: string; end: string }> {
  const configured = (day.periods ?? []).filter(
    (period) => period && period.start && period.end && minutes(period.end) > minutes(period.start)
  );
  if (configured.length > 0) return configured;
  return [{ start: day.start, end: day.end }];
}

export function getCalendarRange(date: string, view: 'day' | 'week' | 'month') {
  const start = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) throw new Error('Invalid calendar date');
  const end = new Date(start);
  if (view === 'day') end.setUTCDate(end.getUTCDate() + 1);
  if (view === 'week') {
    const day = start.getUTCDay();
    start.setUTCDate(start.getUTCDate() - day);
    end.setTime(start.getTime());
    end.setUTCDate(end.getUTCDate() + 7);
  }
  if (view === 'month') {
    start.setUTCDate(1);
    end.setUTCFullYear(start.getUTCFullYear(), start.getUTCMonth() + 1, 1);
  }
  return { start: start.toISOString(), end: end.toISOString() };
}

export function checkSlotAvailability(params: {
  startsAt: string;
  durationMinutes: number;
  schedule: ProviderSchedule;
  existingAppointments?: ScheduledAppointment[];
  clinicClosed?: boolean;
  holiday?: boolean;
  /**
   * F2 — clinic IANA zone. When supplied, the UTC instant is decoded in the
   * CLINIC's wall clock (Intl, DST-safe) before comparing against the schedule
   * windows: 06:00Z in Asia/Hebron IS 09:00 local and must be accepted for a
   * 09:00–13:00 day. Without it the engine keeps the historical UTC-decoded
   * comparison, so every existing caller/test is unaffected.
   */
  timeZone?: string;
}): AvailabilityResult {
  const start = parseLocalDateTime(params.startsAt);
  const duration = params.durationMinutes;
  const end = new Date(start.getTime() + duration * 60_000);
  const endsAt = end.toISOString();
  if (!Number.isInteger(duration) || duration <= 0) return { available: false, reason: 'invalid_duration', endsAt };
  if (params.clinicClosed) return { available: false, reason: 'clinic_closed', endsAt };
  if (params.holiday) return { available: false, reason: 'holiday', endsAt };

  // Frame of reference: clinic-local wall clock when a zone is given, UTC otherwise.
  const local = params.timeZone ? zonedParts(start, params.timeZone) : null;
  const localEnd = params.timeZone ? zonedParts(end, params.timeZone) : null;
  const key = local ? local.date : dateKey(start);
  const weekdayAtStart = local ? local.weekday : start.getUTCDay();
  const startMinutes = local ? local.hour * 60 + local.minute : start.getUTCHours() * 60 + start.getUTCMinutes();
  const endMinutes = localEnd ? localEnd.hour * 60 + localEnd.minute : end.getUTCHours() * 60 + end.getUTCMinutes();
  const sameLocalDay = local && localEnd ? localEnd.date === local.date : end.getUTCDate() === start.getUTCDate();

  if (params.schedule.vacationDates?.includes(key)) return { available: false, reason: 'vacation', endsAt };
  const day = params.schedule.days.find((item) => item.weekday === weekdayAtStart);
  if (!day || !day.enabled) return { available: false, reason: 'provider_unavailable', endsAt };

  // Multi-shift aware (F6): the slot must fit ENTIRELY inside ONE open window —
  // shift #1 (start/end) plus any extra `shifts` windows. Previously only
  // start→end was checked, so an afternoon-only provider returned nothing.
  const insideOpenWindow = dayPeriods(day).some(
    (period) => startMinutes >= minutes(period.start) && endMinutes <= minutes(period.end)
  );
  if (!insideOpenWindow || !sameLocalDay) return { available: false, reason: 'outside_working_hours', endsAt };
  if (day.breaks?.some((breakTime) => startMinutes < minutes(breakTime.end) && endMinutes > minutes(breakTime.start))) return { available: false, reason: 'break_time', endsAt };

  const existing = (params.existingAppointments ?? []).filter((appointment) => appointment.status === undefined || ACTIVE_STATUSES.has(appointment.status));
  const dateKeyOf = (instant: Date) => (params.timeZone ? zonedParts(instant, params.timeZone).date : dateKey(instant));
  const dailyCount = existing.filter((appointment) => dateKeyOf(parseLocalDateTime(appointment.startsAt)) === key).length;
  if (params.schedule.maxAppointmentsPerDay !== undefined && params.schedule.maxAppointmentsPerDay !== null && dailyCount >= params.schedule.maxAppointmentsPerDay) return { available: false, reason: 'maximum_daily_appointments', endsAt };
  if (existing.some((appointment) => (() => {
    const appointmentStart = parseLocalDateTime(appointment.startsAt);
    const appointmentEnd = new Date(appointmentStart.getTime() + appointment.durationMinutes * 60_000);
    return appointmentStart < end && appointmentEnd > start;
  })())) return { available: false, reason: 'overlap', endsAt };

  return { available: true, reason: 'available', endsAt };
}

export function suggestFreeSlots(params: {
  date: string;
  schedule: ProviderSchedule;
  existingAppointments?: ScheduledAppointment[];
  clinicClosed?: boolean;
  holiday?: boolean;
  intervalMinutes?: number;
  limit?: number;
  /**
   * Clinic IANA zone (e.g. "Asia/Hebron"). When supplied, every generated slot is
   * converted from clinic-local wall clock to its matching UTC instant, so 09:00
   * means 09:00 AT THE CLINIC instead of 09:00 UTC (which is 12:00 locally).
   * Omitted → the historical wall-clock-as-UTC form is kept, so live bookings
   * and existing tests are unaffected until the convention is migrated on purpose.
   */
  timeZone?: string;
}) {
  const day = params.schedule.days.find((item) => item.weekday === new Date(`${params.date}T00:00:00Z`).getUTCDay());
  if (!day?.enabled) return [];
  const interval = params.intervalMinutes ?? params.schedule.appointmentDurationMinutes;
  const duration = params.schedule.appointmentDurationMinutes;
  const limit = params.limit ?? 10;
  const toInstant = (time: string) =>
    params.timeZone
      ? clinicLocalToInstant(params.date, time, params.timeZone).toISOString()
      : `${params.date}T${time}:00.000Z`;
  const slots: string[] = [];
  // F6: walk EVERY open window of the day (multi-shift), using the clinic's REAL
  // appointment duration, and let checkSlotAvailability drop breaks/overlaps.
  for (const period of dayPeriods(day)) {
    for (let cursor = minutes(period.start); cursor + duration <= minutes(period.end); cursor += interval) {
      const time = `${String(Math.floor(cursor / 60)).padStart(2, '0')}:${String(cursor % 60).padStart(2, '0')}`;
      const startsAt = toInstant(time);
      const result = checkSlotAvailability({
        startsAt,
        durationMinutes: duration,
        schedule: params.schedule,
        existingAppointments: params.existingAppointments,
        clinicClosed: params.clinicClosed,
        holiday: params.holiday,
        timeZone: params.timeZone,
      });
      if (result.available) slots.push(startsAt);
      if (slots.length >= limit) break;
    }
    if (slots.length >= limit) break;
  }
  return slots;
}
