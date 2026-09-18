import { getAvailableSlots, getActiveServiceById, getActiveProviders, isClinicHoliday, loadProviderSchedule } from '@/lib/services/bookingService';
import { logEvent } from '@/lib/server/logging';
import { getClinicHours, clinicLocalToInstant, timeToMinutes, zonedParts } from '@/lib/services/clinicHours';
import { dateInTimeZone, timeInTimeZone, addDaysIso } from '@/lib/ai/understanding';
import type { ClinicOperatingData } from '@/lib/ai/clinicDataContext';

/**
 * FIX-B: durations BELOW this are almost certainly misconfigured catalog data
 * (a 5-minute imaging session produces slots 9:00, 9:05, 9:10…). Such a value is
 * surfaced as a WARNING instead of being applied silently.
 */
export const MIN_REALISTIC_DURATION_MINUTES = 10;

/**
 * REAL AVAILABILITY TOOL (receptionist)
 *
 * The AI is instructed to NEVER invent a date/time. Instead, the orchestrator
 * resolves the earliest real slot using the existing, concurrency-safe booking
 * engine (`getAvailableSlots`), and this concrete slot is injected into the
 * prompt + conversation state. Tool failures return a STRUCTURED failure reason
 * (not "AI unavailable") so the assistant can give a graceful, honest reply.
 *
 * STEP 3 additions (state-driven booking):
 *  - preferred_date / preferred_time_range / preferred_time_options constraints
 *  - clinic IANA timezone for "today" and past-slot filtering (never UTC-blind)
 *  - slotStart/slotEnd come from the availability result + real service duration
 *  - resolveServiceByName / resolveProviderByName (name -> real id; ambiguous -> null)
 */

export type EarliestSlotResult = {
  found: boolean;
  slot?: string;
  slotStart?: string;
  slotEnd?: string;
  date?: string;
  time?: string;
  providerId?: string;
  serviceId?: string;
  /**
   * Fix [3] "9:00 only": additional VERIFIED slots for the SAME day (same
   * constraints already applied), so the AI can present several real options
   * (morning + afternoon via multi-shift windows) instead of a single forced
   * time. Every entry is engine-verified — still never invented.
   */
  alternatives?: string[];
  /**
   * FIX-A: set when the patient's REQUESTED day was searched first and had no
   * free slot — the caller must explain the day and (only then) offer another.
   */
  requestedDateUnavailable?: boolean;
  /** FIX-A: why the requested day had nothing — closed, holiday, or fully booked. */
  dayStatus?: 'closed' | 'holiday' | 'fully_booked';
  /** FIX-A: first REAL slot after the requested day (same constraints), for an explained alternative. */
  nextAvailable?: { date: string; time: string; slot: string };
  /** FIX-B: the catalog duration is below `MIN_REALISTIC_DURATION_MINUTES` (misconfigured data). */
  unrealisticDurationMinutes?: number;
  reason?: 'service_unavailable' | 'no_slots' | 'error';
  message?: string;
};

export type AvailabilityQuery = {
  clinicId: string;
  providerId: string;
  serviceId: string;
  /** Restrict the search to this exact clinic-local date (YYYY-MM-DD). */
  preferredDate?: string;
  /** Time-of-day constraint (inclusive). */
  preferredTimeRange?: { from?: string; to?: string };
  /** Explicit time preferences like ["13:00","16:00"]. */
  preferredTimeOptions?: string[];
  /** Clinic IANA timezone (e.g. "Asia/Jerusalem") - used for today + past filtering. */
  timeZone?: string;
  /** Injectable clock (tests stay deterministic). */
  now?: Date;
  lookaheadDays?: number;
  limitPerDay?: number;
};

/** FIX-B: warn (never silently apply) on a misconfigured service duration. */
function warnOnUnrealisticDuration(params: {
  clinicId: string;
  providerId?: string | null;
  serviceId: string;
  durationMinutes: number;
}): number | undefined {
  if (params.durationMinutes >= MIN_REALISTIC_DURATION_MINUTES) return undefined;
  logEvent('availability_unrealistic_service_duration', {
    clinic_id: params.clinicId,
    provider_id: params.providerId ?? null,
    service_id: params.serviceId,
    duration_minutes: params.durationMinutes,
    threshold_minutes: MIN_REALISTIC_DURATION_MINUTES,
    guidance: 'clinic_services.duration_minutes looks misconfigured — the engine generates near-identical slots (09:00, 09:05…). Fix the catalog value.',
  }, 'warn');
  return params.durationMinutes;
}

type SlotConstraints = {
  todayLocal: string;
  nowTimeLocal: string;
  preferredTimeRange?: { from?: string | null; to?: string | null };
  preferredTimeOptions?: string[];
};

/** Shared constraint filter (past guard + time range + explicit options). */
function slotMatchesConstraints(slot: string, c: SlotConstraints): boolean {
  const m = slot.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  if (!m) return false;
  const slotDate = m[1];
  const slotTime = m[2];
  if (slotDate < c.todayLocal) return false;
  if (slotDate === c.todayLocal && slotTime <= c.nowTimeLocal) return false;
  if (c.preferredTimeRange) {
    const from = c.preferredTimeRange.from ?? '00:00';
    const to = c.preferredTimeRange.to ?? '23:59';
    if (slotTime < from || slotTime > to) return false;
  }
  if (c.preferredTimeOptions && c.preferredTimeOptions.length > 0) {
    if (!c.preferredTimeOptions.includes(slotTime)) return false;
  }
  return true;
}

/**
 * FIX-A: when the REQUESTED day yields nothing, explain WHY and find the first
 * real slot AFTER it. Another day is never proposed without a reason, and no
 * candidate is invented — every one comes from the booking engine.
 */
async function describeUnavailableRequestedDay(params: {
  clinicId: string;
  providerId: string;
  serviceId: string;
  requestedDate: string;
  constraints: SlotConstraints;
  lookaheadDays: number;
}): Promise<{ dayStatus: 'closed' | 'holiday' | 'fully_booked'; nextAvailable?: { date: string; time: string; slot: string } }> {
  let dayStatus: 'closed' | 'holiday' | 'fully_booked' = 'fully_booked';
  try {
    const holiday = await isClinicHoliday(params.clinicId, params.requestedDate);
    if (holiday) {
      dayStatus = 'holiday';
    } else {
      const schedule = await loadProviderSchedule(params.clinicId, params.providerId);
      const weekday = new Date(`${params.requestedDate}T00:00:00Z`).getUTCDay();
      const day = schedule?.days?.find((item) => item.weekday === weekday);
      const onVacation = schedule?.vacationDates?.includes(params.requestedDate) ?? false;
      if (!day?.enabled || onVacation) dayStatus = 'closed';
    }
  } catch {
    // Conservative default ('fully_booked') — this lookup must never break the search.
  }

  let nextAvailable: { date: string; time: string; slot: string } | undefined;
  try {
    for (let i = 1; i <= params.lookaheadDays; i += 1) {
      const nextDay = addDaysIso(params.requestedDate, i);
      const slots = await getAvailableSlots(params.clinicId, params.providerId, nextDay, 20, params.serviceId);
      // The slot must really belong to the scanned day (the engine never mixes days).
      const first = (slots ?? []).find(
        (slot) => slot.startsWith(`${nextDay}T`) && slotMatchesConstraints(slot, params.constraints)
      );
      if (first) {
        nextAvailable = { date: nextDay, time: (first.split('T')[1] ?? '').slice(0, 5), slot: first };
        break;
      }
    }
  } catch {
    // No alternative is fine — the caller falls back to an honest handoff.
  }

  return { dayStatus, nextAvailable };
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Adds minutes to an "HH:MM" string -> "HH:MM" (mod 24h). */
function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = (h * 60 + m + minutes) % (24 * 60);
  return `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`;
}

/** Normalises a name for matching (strip honorifics, desire words, collapse whitespace, lowercase). */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/د\.|الدكتور|الدكتورة|دكتور|دكتورة|طبيب|أخصائي|اخصائي|مقدم|مقدمة|خدمة|بدي|أريد|اريد|ابدي|احجز|أحجز|حجز|موعد|عندكم/gi, '')
    .replace(/[.,،]|ال/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Resolves a requested service NAME against the clinic's real operating data.
 * Returns null when there is no match OR the match is ambiguous (multiple
 * candidates) - the assistant must ask for clarification instead of guessing.
 */
export function resolveServiceByName(name: string, data: ClinicOperatingData): { id: string; name: string } | null {
  const normalized = normalizeName(name);
  if (!normalized) return null;
  const matches = data.services.filter((s) => {
    const sn = normalizeName(s.name);
    return sn === normalized || sn.includes(normalized) || normalized.includes(sn);
  });
  return matches.length === 1 ? { id: matches[0].id, name: matches[0].name } : null;
}

/**
 * Resolves a provider NAME against the clinic's real operating data.
 * Returns null when there is no match OR the match is ambiguous.
 */
export function resolveProviderByName(name: string, data: ClinicOperatingData): { id: string; name: string } | null {
  const normalized = normalizeName(name);
  if (!normalized) return null;
  const matches = data.providers.filter((p) => {
    const pn = normalizeName(p.name);
    return pn === normalized || pn.includes(normalized) || normalized.includes(pn);
  });
  return matches.length === 1 ? { id: matches[0].id, name: matches[0].name } : null;
}

/**
 * Finds the earliest available slot matching the given constraints by scanning
 * REAL availability across a lookahead window. Reuses the existing scheduling
 * engine so it respects provider schedules, holidays, vacations, working hours,
 * breaks, and existing appointments automatically.
 *
 * Past slots are excluded using the clinic's IANA timezone (never UTC-blind).
 */
export async function findEarliestAvailableSlot(params: AvailabilityQuery): Promise<EarliestSlotResult> {
  const {
    clinicId,
    providerId,
    serviceId,
    preferredDate,
    preferredTimeRange,
    preferredTimeOptions,
    timeZone = 'UTC',
    now = new Date(),
    lookaheadDays = 14,
    // P1 (Global by Default): 5 capped every clinic's day at 5 slots. A full
    // day for a 30-minute service inside a 9→17 schedule is 16 — the engine's
    // own per-day iteration is the only sane ceiling, not an arbitrary 5.
    limitPerDay = 20,
  } = params;

  const service = await getActiveServiceById(clinicId, serviceId).catch(() => null);
  if (!service) {
    return { found: false, reason: 'service_unavailable', message: 'service not available for this clinic' };
  }

  // FIX-B: a 5-minute catalog duration is surfaced as a warning (never silent).
  const unrealisticDurationMinutes = warnOnUnrealisticDuration({
    clinicId,
    providerId,
    serviceId,
    durationMinutes: service.duration_minutes,
  });

  // Days to scan: the requested date only, or a lookahead from clinic-local today.
  const todayLocal = dateInTimeZone(now, timeZone);
  const nowTimeLocal = timeInTimeZone(now, timeZone);
  const constraints: SlotConstraints = { todayLocal, nowTimeLocal, preferredTimeRange, preferredTimeOptions };
  // FIX-A: an explicit requested day is a HARD constraint — the patient's day is
  // searched first and only a day that has nothing is explained + replaced.
  const days: string[] = preferredDate
    ? [preferredDate]
    : Array.from({ length: lookaheadDays }, (_, i) => addDaysIso(todayLocal, i));

  for (const day of days) {
    try {
      const slots = await getAvailableSlots(clinicId, providerId, day, limitPerDay, serviceId);
      if (!slots || slots.length === 0) continue;

      for (const slot of slots) {
        if (!slotMatchesConstraints(slot, constraints)) continue;
        const m = slot.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
        if (!m) continue;
        const slotDate = m[1];
        const slotTime = m[2];

        const endTime = addMinutesToTime(slotTime, service.duration_minutes);
        // Fix [3]: collect the rest of THIS day's matching slots as verified
        // alternatives (morning + afternoon), then stop scanning later days.
        const alternatives: string[] = [];
        for (const other of slots) {
          if (other === slot) continue;
          if (!slotMatchesConstraints(other, constraints)) continue;
          alternatives.push(other);
          // P1: enough room for a FULL day (16+ slots) instead of 4 visible times.
          if (alternatives.length >= 15) break;
        }
        return {
          found: true,
          slot,
          slotStart: slot,
          slotEnd: `${slotDate}T${endTime}:00.000Z`,
          date: slotDate,
          time: slotTime,
          providerId,
          serviceId,
          alternatives,
          ...(unrealisticDurationMinutes !== undefined ? { unrealisticDurationMinutes } : {}),
        };
      }
    } catch (err) {
      // A single day failing (e.g. malformed schedule) must not abort the scan.
      logEvent('availability_tool_date_error', {
        clinic_id: clinicId,
        provider_id: providerId,
        service_id: serviceId,
        date: day,
        error: err instanceof Error ? err.message : String(err),
      }, 'warn');
      if (String(err?.message ?? err).includes('Provider is not assigned to this service')) {
        return { found: false, reason: 'error', message: 'provider not assigned to service' };
      }
    }
  }

  // FIX-A: the patient's day was searched first and had NOTHING. Explain why
  // (closed / holiday / fully booked) and offer the first REAL day after it —
  // never a silent day switch, never an invented slot.
  if (preferredDate) {
    const { dayStatus, nextAvailable } = await describeUnavailableRequestedDay({
      clinicId,
      providerId,
      serviceId,
      requestedDate: preferredDate,
      constraints,
      lookaheadDays,
    });
    logEvent('availability_requested_day_unavailable', {
      clinic_id: clinicId,
      provider_id: providerId,
      service_id: serviceId,
      requested_date: preferredDate,
      day_status: dayStatus,
      next_available_date: nextAvailable?.date ?? null,
      next_available_time: nextAvailable?.time ?? null,
    }, 'warn');
    return {
      found: false,
      reason: 'no_slots',
      message: 'no real slot on the requested day',
      requestedDateUnavailable: true,
      dayStatus,
      ...(nextAvailable ? { nextAvailable } : {}),
      ...(unrealisticDurationMinutes !== undefined ? { unrealisticDurationMinutes } : {}),
    };
  }

  return {
    found: false,
    reason: 'no_slots',
    message: 'no real slot found matching constraints',
    ...(unrealisticDurationMinutes !== undefined ? { unrealisticDurationMinutes } : {}),
  };
}

/**
 * FIX-1 (Global by Default): when the patient names a service but NO provider
 * ("بدي احجز بانوراما"), the booking flow must not stall waiting for one.
 * Resolves the FIRST provider of this clinic that (a) is assigned to the
 * service via provider_services when assignments exist, and (b) has real
 * provider_schedules — reusing getActiveProviders so eligibility rules stay in
 * ONE place. Returns null when nothing qualifies (caller degrades gracefully).
 */
export async function resolveFirstProviderForService(clinicId: string, serviceId: string): Promise<string | null> {
  try {
    const providers = await getActiveProviders(clinicId, serviceId);
    return providers[0]?.id ?? null;
  } catch (err) {
    logEvent('availability_resolve_provider_failed', {
      clinic_id: clinicId,
      service_id: serviceId,
      error: err instanceof Error ? err.message : String(err),
    }, 'warn');
    return null;
  }
}

/**
 * FIX-2 — CLINIC-LEVEL slot fallback (Global by Default).
 *
 * When NO provider is eligible at all (e.g. an imaging centre whose service is
 * bookable clinic-wide), availability is derived directly from the clinic's
 * aggregated hours (`getClinicHours` — multi-shift aware) and the REAL service
 * duration. These slots are engine-shaped (`YYYY-MM-DDTHH:MM:00.000Z`, encoded
 * clinic-local like the booking engine) and are only PROPOSALS: the guarded
 * booking route re-validates with checkSlotAvailability before persisting.
 * Never called when a real provider exists — the provider path always wins.
 */
export async function findClinicLevelSlots(params: {
  clinicId: string;
  serviceId: string;
  timeZone?: string;
  preferredDate?: string;
  /** FIX-A: requested time-of-day constraint (inclusive), honored on the requested day. */
  preferredTimeRange?: { from?: string | null; to?: string | null };
  /** FIX-A: explicit time preferences (e.g. ["13:00","16:00"]). */
  preferredTimeOptions?: string[];
  now?: Date;
  lookaheadDays?: number;
  limitPerDay?: number;
}): Promise<EarliestSlotResult> {
  const { clinicId, serviceId } = params;
  const now = params.now ?? new Date();
  const timeZone = params.timeZone ?? 'Asia/Jerusalem';
  try {
    const service = await getActiveServiceById(clinicId, serviceId).catch(() => null);
    if (!service) return { found: false, reason: 'service_unavailable', message: 'service not available for this clinic' };

    // FIX-B: same non-silent warning as the provider path.
    const unrealisticDurationMinutes = warnOnUnrealisticDuration({
      clinicId,
      serviceId,
      durationMinutes: service.duration_minutes,
    });

    const hours = await getClinicHours(clinicId);
    if (!hours.hasHours) return { found: false, reason: 'no_slots', message: 'clinic has no working hours' };

    const { date: todayLocal, time: nowTimeLocal } = zonedParts(now, timeZone);
    const constraints: SlotConstraints = {
      todayLocal,
      nowTimeLocal,
      preferredTimeRange: params.preferredTimeRange ?? undefined,
      preferredTimeOptions: params.preferredTimeOptions,
    };
    // FIX-A: the requested day is a hard constraint here too.
    const days: string[] = params.preferredDate
      ? [params.preferredDate]
      : Array.from({ length: params.lookaheadDays ?? 14 }, (_, i) => addDaysIso(todayLocal, i));
    const limitPerDay = params.limitPerDay ?? 5;

    const buildDaySlots = (day: string): string[] => {
      const { weekday } = zonedParts(clinicLocalToInstant(day, '12:00', timeZone), timeZone);
      const dayHours = hours.days.find((d) => d.weekday === weekday);
      if (!dayHours) return [];
      const daySlots: string[] = [];
      for (const period of dayHours.periods) {
        const endMin = timeToMinutes(period.end);
        // Full-hour starts only (9:00, 10:00, …) — a 5-minute catalog duration
        // used to flood the day with 09:00/09:05/09:10 proposals. The REAL
        // duration still governs the slot end + the guarded booking
        // re-validation before persisting.
        let cursor = Math.ceil(timeToMinutes(period.start) / 60) * 60;
        for (; cursor + service.duration_minutes <= endMin; cursor += 60) {
          const time = `${String(Math.floor(cursor / 60)).padStart(2, '0')}:${String(cursor % 60).padStart(2, '0')}`;
          // Engine-shaped encoding: clinic-local wall clock carried as the UTC clock.
          const slot = `${day}T${time}:00.000Z`;
          if (!slotMatchesConstraints(slot, constraints)) continue;
          daySlots.push(slot);
          if (daySlots.length >= limitPerDay) break;
        }
        if (daySlots.length >= limitPerDay) break;
      }
      return daySlots;
    };

    for (const day of days) {
      const daySlots = buildDaySlots(day);
      if (daySlots.length === 0) continue;

      const [slotDate, slotTime] = daySlots[0].split('T');
      return {
        found: true,
        slot: daySlots[0],
        slotStart: daySlots[0],
        slotEnd: daySlots[0],
        date: slotDate,
        time: slotTime.slice(0, 5),
        serviceId,
        alternatives: daySlots.slice(1),
        ...(unrealisticDurationMinutes !== undefined ? { unrealisticDurationMinutes } : {}),
      };
    }

    // FIX-A: explain the requested day (closed vs full) + first real day after it.
    if (params.preferredDate) {
      const requestedSlots = buildDaySlots(params.preferredDate);
      const dayStatus: 'closed' | 'fully_booked' = requestedSlots.length === 0 ? 'closed' : 'fully_booked';
      let nextAvailable: { date: string; time: string; slot: string } | undefined;
      for (let i = 1; i <= (params.lookaheadDays ?? 14); i += 1) {
        const day = addDaysIso(params.preferredDate, i);
        const slots = buildDaySlots(day);
        if (slots.length > 0) {
          nextAvailable = { date: day, time: (slots[0].split('T')[1] ?? '').slice(0, 5), slot: slots[0] };
          break;
        }
      }
      return {
        found: false,
        reason: 'no_slots',
        message: 'no clinic-level slot on the requested day',
        requestedDateUnavailable: true,
        dayStatus,
        ...(nextAvailable ? { nextAvailable } : {}),
        ...(unrealisticDurationMinutes !== undefined ? { unrealisticDurationMinutes } : {}),
      };
    }

    return {
      found: false,
      reason: 'no_slots',
      message: 'no clinic-level slot found matching constraints',
      ...(unrealisticDurationMinutes !== undefined ? { unrealisticDurationMinutes } : {}),
    };
  } catch (err) {
    logEvent('availability_clinic_level_error', {
      clinic_id: clinicId,
      service_id: serviceId,
      error: err instanceof Error ? err.message : String(err),
    }, 'warn');
    return { found: false, reason: 'error', message: 'clinic-level availability failed' };
  }
}
