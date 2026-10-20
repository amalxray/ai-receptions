import { google } from 'googleapis';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getClinicGoogleCalendarClient } from '@/lib/services/googleCalendarOAuth';
import { clinicLocalToInstant, zonedParts } from '@/lib/services/clinicClock';
import {
  createBooking,
  findOrCreatePatient,
  getAvailableSlots,
  isClinicHoliday,
  loadExistingAppointments,
  loadProviderSchedule,
} from '@/lib/services/bookingService';
import { checkSlotAvailability } from '@/lib/services/scheduling';
import { logEvent } from '@/lib/server/logging';

export type AppointmentStatus = 'pending' | 'pending_confirmation' | 'confirmed' | 'cancelled';

export type GoogleCalendarBookingDetails = {
  patient_name: string;
  patient_phone: string;
  appointment_time: string;
  clinic_id: string;
  provider_id: string;
  appointment_id?: string;
  patient_id?: string | null;
  clinic_name?: string;
  service?: string;
  timezone?: string;
  duration_minutes?: number;
  status?: AppointmentStatus;
};

export type AvailabilityResult = {
  date: string;
  timezone: string;
  available: boolean;
  slots: Array<{ start: string; end: string }>;
  reason?: string;
};

export type GoogleCalendarBusyInterval = { start: string; end: string };
const GOOGLE_CALENDAR_TIMEOUT_MS = 3_000;
const GOOGLE_CALENDAR_FAIL_FAST_MS = GOOGLE_CALENDAR_TIMEOUT_MS - 100;
const GOOGLE_CALENDAR_AVAILABILITY_TIMEOUT_MS = 2_000;

type GoogleCalendarClient = ReturnType<typeof google.calendar>;
type GoogleCalendarConfig = {
  calendar: GoogleCalendarClient;
  calendarId: string;
  flushTokenPersistence?: () => Promise<void>;
};

function nextDate(date: string): string {
  const next = new Date(`${date}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

function withCalendarTimeout<T>(operation: Promise<T>, stage: string, timeoutMs = GOOGLE_CALENDAR_FAIL_FAST_MS): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    operation,
    new Promise<never>((_, reject) => {
      timeout = setTimeout(() => reject(Object.assign(
        new Error(`Google Calendar ${stage} exceeded its ${timeoutMs}ms fail-fast limit`),
        { code: 'ETIMEDOUT' },
      )), timeoutMs);
    }),
  ]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
}

function isCalendarTimeout(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { code?: unknown; name?: unknown };
  return candidate.code === 'ETIMEDOUT'
    || candidate.code === 'ERR_CANCELED'
    || candidate.name === 'AbortError'
    || candidate.name === 'TimeoutError';
}

/** Read actual Calendar events for exactly the requested clinic-local date. */
export async function getGoogleCalendarBusyIntervals(
  clinicId: string,
  date: string,
  timezone = 'Asia/Jerusalem',
  options: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<GoogleCalendarBusyInterval[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Date must be in YYYY-MM-DD format.');
  const timeoutMs = options.timeoutMs ?? GOOGLE_CALENDAR_TIMEOUT_MS;
  const signal = options.signal ?? AbortSignal.timeout(timeoutMs);
  const client = await withCalendarTimeout(
    getClinicGoogleCalendarClient(clinicId),
    'connection lookup',
    timeoutMs,
  );
  if (!client) return [];
  const { calendar, calendarId } = client;
  const timeMin = clinicLocalToInstant(date, '00:00', timezone);
  const timeMax = clinicLocalToInstant(nextDate(date), '00:00', timezone);
  let response;
  try {
    response = await withCalendarTimeout(calendar.events.list({
      calendarId,
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 2500,
    }, {
      timeout: timeoutMs,
      signal,
    }), 'events.list', timeoutMs);
  } finally {
    await client.flushTokenPersistence?.();
  }

  const intervals: GoogleCalendarBusyInterval[] = [];
  for (const event of response.data.items ?? []) {
    if (event.status === 'cancelled') continue;
    if (event.start?.date && event.end?.date) {
      intervals.push({ start: `${event.start.date}T00:00`, end: `${event.end.date}T00:00` });
      continue;
    }
    const startInstant = event.start?.dateTime ? new Date(event.start.dateTime) : null;
    const endInstant = event.end?.dateTime ? new Date(event.end.dateTime) : null;
    if (!startInstant || !endInstant || Number.isNaN(startInstant.getTime()) || Number.isNaN(endInstant.getTime())) continue;
    const startLocal = zonedParts(startInstant, timezone);
    const endLocal = zonedParts(endInstant, timezone);
    intervals.push({ start: `${startLocal.date}T${startLocal.time}`, end: `${endLocal.date}T${endLocal.time}` });
  }
  console.info('[google-calendar] availability-checked', { date, timezone, eventCount: intervals.length });
  return intervals;
}

export async function checkAvailability(
  clinicId: string,
  providerId: string,
  date: string,
  timezone = 'Asia/Hebron',
): Promise<AvailabilityResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('Date must be in YYYY-MM-DD format.');
  }

  const [schedule, localSlots] = await Promise.all([
    loadProviderSchedule(clinicId, providerId),
    getAvailableSlots(clinicId, providerId, date, 200),
  ]);
  let calendarBusy: GoogleCalendarBusyInterval[] = [];
  try {
    calendarBusy = await getGoogleCalendarBusyIntervals(clinicId, date, timezone, {
      timeoutMs: GOOGLE_CALENDAR_AVAILABILITY_TIMEOUT_MS,
      signal: AbortSignal.timeout(GOOGLE_CALENDAR_AVAILABILITY_TIMEOUT_MS),
    });
  } catch (error) {
    if (!isCalendarTimeout(error)) throw error;
    logEvent('availability_check_timeout', {
      clinic_id: clinicId,
      provider_id: providerId,
      requested_date: date,
      timeout_ms: GOOGLE_CALENDAR_AVAILABILITY_TIMEOUT_MS,
      fallback: 'local_schedule',
    }, 'warn');
  }
  if (!schedule) throw new Error('Provider not found for this clinic');
  const openSlots: Array<{ start: string; end: string }> = [];
  for (const slot of localSlots) {
    const localStart = slot.slice(0, 16);
    const localEndDate = new Date(`${localStart}:00Z`);
    localEndDate.setUTCMinutes(localEndDate.getUTCMinutes() + schedule.appointmentDurationMinutes);
    const actualStart = clinicLocalToInstant(date, localStart.slice(11, 16), timezone);
    const actualEnd = new Date(actualStart.getTime() + schedule.appointmentDurationMinutes * 60_000);
    const localEndKey = localEndDate.toISOString().slice(0, 16);
    if (calendarBusy.some((busy) => localStart < busy.end && localEndKey > busy.start)) continue;
    openSlots.push({ start: actualStart.toISOString(), end: actualEnd.toISOString() });
  }

  return {
    date,
    timezone,
    available: openSlots.length > 0,
    slots: openSlots,
    reason: openSlots.length === 0 ? 'No availability remains for the selected date.' : undefined,
  };
}

async function getBookingCalendarConflictsOrEmpty(
  clinicId: string,
  date: string,
  timezone: string,
  providerId: string,
): Promise<GoogleCalendarBusyInterval[]> {
  try {
    return await getGoogleCalendarBusyIntervals(clinicId, date, timezone, {
      timeoutMs: GOOGLE_CALENDAR_AVAILABILITY_TIMEOUT_MS,
      signal: AbortSignal.timeout(GOOGLE_CALENDAR_AVAILABILITY_TIMEOUT_MS),
    });
  } catch (error) {
    if (!isCalendarTimeout(error)) throw error;
    logEvent('availability_check_timeout', {
      clinic_id: clinicId,
      provider_id: providerId,
      requested_date: date,
      timeout_ms: GOOGLE_CALENDAR_AVAILABILITY_TIMEOUT_MS,
      fallback: 'local_schedule',
    }, 'warn');
    return [];
  }
}

export async function bookAppointment(details: GoogleCalendarBookingDetails) {
  const appointmentTime = new Date(details.appointment_time);
  if (Number.isNaN(appointmentTime.getTime())) {
    throw new Error('appointment_time must be a valid ISO timestamp.');
  }

  const durationMinutes = details.duration_minutes ?? 30;
  const endTime = new Date(appointmentTime.getTime() + durationMinutes * 60 * 1000);
  const timezone = details.timezone ?? 'Asia/Jerusalem';
  const requestedLocal = zonedParts(appointmentTime, timezone);
  const requestedEndLocal = zonedParts(endTime, timezone);
  const requestedStartKey = `${requestedLocal.date}T${requestedLocal.time}`;
  const requestedEndKey = `${requestedEndLocal.date}T${requestedEndLocal.time}`;

  if (details.appointment_id) {
    const { data: existing, error } = await supabaseAdmin
      .from('appointments')
      .select('id, status')
      .eq('clinic_id', details.clinic_id)
      .eq('provider_id', details.provider_id)
      .eq('id', details.appointment_id)
      .is('deleted_at', null)
      .maybeSingle();
    if (error || !existing) throw new Error('Appointment not found for this clinic and provider.');

    const schedule = await loadProviderSchedule(details.clinic_id, details.provider_id);
    if (!schedule) throw new Error('Provider not found for this clinic');
    const [holiday, appointments] = await Promise.all([
      isClinicHoliday(details.clinic_id, requestedLocal.date),
      loadExistingAppointments(details.clinic_id, details.provider_id, requestedLocal.date),
    ]);
    const localStart = `${requestedLocal.date}T${requestedLocal.time}:00.000Z`;
    const availability = checkSlotAvailability({
      startsAt: localStart,
      durationMinutes,
      schedule,
      existingAppointments: appointments.filter((appointment) => appointment.id !== details.appointment_id),
      holiday,
    });
    if (!availability.available) {
      throw new Error(`Slot unavailable: ${availability.reason}`);
    }

    const client = await getClinicGoogleCalendarClient(details.clinic_id);
    if (!client) {
      return {
        id: existing.id,
        patient_name: details.patient_name,
        patient_phone: details.patient_phone,
        appointment_time: appointmentTime.toISOString(),
        google_event_id: null,
        status: existing.status,
        calendar_connected: false,
      };
    }
    const calendarConflicts = await getBookingCalendarConflictsOrEmpty(details.clinic_id, requestedLocal.date, timezone, details.provider_id);
    if (calendarConflicts.some((busy) => requestedStartKey < busy.end && requestedEndKey > busy.start)) {
      throw new Error('Double booking prevention triggered: Google Calendar is busy at the requested time.');
    }
    return createEventAndConfirm(details, existing.id, appointmentTime, endTime, client);
  }

  const client = await getClinicGoogleCalendarClient(details.clinic_id);
  if (client) {
    const calendarConflicts = await getBookingCalendarConflictsOrEmpty(details.clinic_id, requestedLocal.date, timezone, details.provider_id);
    if (calendarConflicts.some((busy) => requestedStartKey < busy.end && requestedEndKey > busy.start)) {
      throw new Error('Double booking prevention triggered: Google Calendar is busy at the requested time.');
    }
  }

  const patientId = details.patient_id ?? await findOrCreatePatient({
    clinicId: details.clinic_id,
    name: details.patient_name.trim(),
    phone: details.patient_phone.trim() || null,
  });
  const localBooking = await createBooking({
    clinicId: details.clinic_id,
    providerId: details.provider_id,
    service: details.service ?? 'Google Calendar booking',
    date: requestedLocal.date,
    time: requestedLocal.time,
    patientId,
    durationMinutes,
    initialStatus: 'pending_confirmation',
  });

  if (!client) {
    return {
      id: localBooking.id,
      patient_name: details.patient_name.trim(),
      patient_phone: details.patient_phone.trim(),
      appointment_time: appointmentTime.toISOString(),
      google_event_id: null,
      status: localBooking.status,
      calendar_connected: false,
    };
  }
  return createEventAndConfirm(details, localBooking.id, appointmentTime, endTime, client);
}

async function createEventAndConfirm(
  details: GoogleCalendarBookingDetails,
  appointmentId: string,
  startTime: Date,
  endTime: Date,
  client: GoogleCalendarConfig,
) {
  const { calendar, calendarId } = client;
  console.info('[google-calendar] creating-event', {
    clinicId: details.clinic_id,
    providerId: details.provider_id,
    appointmentId,
    start: startTime.toISOString(),
  });
  let eventResponse;
  try {
    try {
      eventResponse = await calendar.events.insert({
        calendarId,
        sendUpdates: 'none',
        requestBody: {
          summary: `${details.clinic_name ? `${details.clinic_name} — ` : ''}${details.service ?? 'موعد'} — ${details.patient_name.trim()}`,
          description: `العيادة: ${details.clinic_name ?? '—'}\nالخدمة: ${details.service ?? '—'}\nالاسم: ${details.patient_name.trim()}${details.patient_phone.trim() ? `\nرقم التواصل: ${details.patient_phone.trim()}` : ''}`,
          start: { dateTime: startTime.toISOString(), timeZone: details.timezone ?? 'Asia/Jerusalem' },
          end: { dateTime: endTime.toISOString(), timeZone: details.timezone ?? 'Asia/Jerusalem' },
        },
      }, { timeout: GOOGLE_CALENDAR_TIMEOUT_MS, signal: AbortSignal.timeout(GOOGLE_CALENDAR_TIMEOUT_MS) });
    } finally {
      await client.flushTokenPersistence?.();
    }
  } catch (error) {
    const eventId = eventResponse?.data.id;
    if (eventId) {
      try {
        await calendar.events.delete(
          { calendarId, eventId },
          { timeout: GOOGLE_CALENDAR_TIMEOUT_MS, signal: AbortSignal.timeout(GOOGLE_CALENDAR_TIMEOUT_MS) },
        );
      } catch (cleanupError) {
        throw new Error(
          `Failed to persist refreshed Google credentials and clean up the created event: ${cleanupError instanceof Error ? cleanupError.message : 'Unknown error'}`,
        );
      }
    }
    throw error;
  }
  const googleEventId = eventResponse.data.id;
  if (!googleEventId) throw new Error('Google Calendar did not return an event id.');

  const { data, error } = await supabaseAdmin
    .from('appointments')
    .update({
      google_event_id: googleEventId,
      patient_name: details.patient_name.trim(),
      patient_phone: details.patient_phone.trim(),
      appointment_time: startTime.toISOString(),
      status: 'confirmed',
    })
    .eq('clinic_id', details.clinic_id)
    .eq('provider_id', details.provider_id)
    .eq('id', appointmentId)
    .select('*')
    .single();
  if (error || !data) {
    try {
      await calendar.events.delete(
        { calendarId, eventId: googleEventId },
        { timeout: GOOGLE_CALENDAR_TIMEOUT_MS, signal: AbortSignal.timeout(GOOGLE_CALENDAR_TIMEOUT_MS) },
      );
    } catch (rollbackError) {
      console.error('[google-calendar] event-rollback-failed', {
        clinicId: details.clinic_id,
        providerId: details.provider_id,
        appointmentId,
        eventId: googleEventId,
        error: rollbackError instanceof Error ? rollbackError.message : 'Unknown rollback error',
      });
      throw new Error(
        `Failed to save the appointment after creating its Google Calendar event; event cleanup also failed: ${error?.message ?? 'database update returned no row'}`,
      );
    }
    throw new Error(error?.message ?? 'Failed to link Google Calendar event to the appointment.');
  }

  console.info('[google-calendar] event-created-and-linked', {
    clinicId: details.clinic_id,
    providerId: details.provider_id,
    appointmentId: data.id,
    eventId: googleEventId,
  });

  return {
    id: data.id,
    patient_name: data.patient_name,
    patient_phone: data.patient_phone,
    appointment_time: data.appointment_time,
    google_event_id: data.google_event_id,
    status: data.status,
    calendar_connected: true,
  };
}
