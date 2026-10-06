import { google } from 'googleapis';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { clinicLocalToInstant, zonedParts } from '@/lib/services/clinicClock';

export type AppointmentStatus = 'pending' | 'confirmed' | 'cancelled';

export type GoogleCalendarBookingDetails = {
  patient_name: string;
  patient_phone: string;
  appointment_time: string;
  clinic_id?: string;
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

function getGoogleCalendarClient() {
  const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n').trim();
  const calendarId = process.env.GOOGLE_CALENDAR_ID?.trim();
  const missing = [
    !serviceAccountEmail && 'GOOGLE_SERVICE_ACCOUNT_EMAIL',
    !privateKey && 'GOOGLE_PRIVATE_KEY',
    !calendarId && 'GOOGLE_CALENDAR_ID',
  ].filter((key): key is string => Boolean(key));

  if (missing.length > 0) {
    throw new Error(
      `Google Calendar integration is not configured: ${missing.join(', ')}.`,
    );
  }

  const auth = new google.auth.GoogleAuth({
    credentials: { client_email: serviceAccountEmail, private_key: privateKey },
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });
  return { calendar: google.calendar({ version: 'v3', auth }), calendarId: calendarId as string };
}

function nextDate(date: string): string {
  const next = new Date(`${date}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

/** Read actual Calendar events for exactly the requested clinic-local date. */
export async function getGoogleCalendarBusyIntervals(date: string, timezone = 'Asia/Jerusalem'): Promise<GoogleCalendarBusyInterval[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Date must be in YYYY-MM-DD format.');
  const { calendar, calendarId } = getGoogleCalendarClient();
  const timeMin = clinicLocalToInstant(date, '00:00', timezone);
  const timeMax = clinicLocalToInstant(nextDate(date), '00:00', timezone);
  const response = await calendar.events.list({
    calendarId,
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 2500,
  });

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

async function findConflictingAppointments(start: Date, end: Date, excludeAppointmentId?: string) {
  let query = supabaseAdmin
    .from('appointments')
    .select('id, scheduled_at, appointment_time, status')
    .gte('scheduled_at', start.toISOString())
    .lt('scheduled_at', end.toISOString())
    .in('status', ['pending', 'confirmed', 'tentative']);

  if (excludeAppointmentId) query = query.neq('id', excludeAppointmentId);
  const { data, error } = await query;

  if (error) {
    throw new Error(error.message || 'Failed to check appointment overlap.');
  }

  return data ?? [];
}

export async function checkAvailability(date: string, timezone = 'UTC'): Promise<AvailabilityResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('Date must be in YYYY-MM-DD format.');
  }

  const startOfDay = new Date(`${date}T00:00:00.000Z`);
  const endOfDay = new Date(`${date}T23:59:59.999Z`);

  const [calendarBusy, appointmentsResult] = await Promise.all([
    getGoogleCalendarBusyIntervals(date, timezone),
    supabaseAdmin
    .from('appointments')
    .select('appointment_time, scheduled_at, status')
    .gte('appointment_time', startOfDay.toISOString())
    .lte('appointment_time', endOfDay.toISOString())
    .in('status', ['pending', 'confirmed', 'tentative']),
  ]);
  const { data: appointments, error } = appointmentsResult;

  if (error) {
    throw new Error(error.message || 'Could not load appointment schedule.');
  }

  const openSlots: Array<{ start: string; end: string }> = [];
  const dayAppointments = appointments ?? [];
  const businessStart = new Date(`${date}T09:00:00.000Z`);
  const businessEnd = new Date(`${date}T17:00:00.000Z`);

  for (let slot = new Date(businessStart); slot < businessEnd; slot = new Date(slot.getTime() + 30 * 60 * 1000)) {
    const end = new Date(slot.getTime() + 30 * 60 * 1000);
    const slotKey = `${date}T${slot.toISOString().slice(11, 16)}`;
    const endKey = `${date}T${end.toISOString().slice(11, 16)}`;
    const isTaken = calendarBusy.some((busy) => slotKey < busy.end && endKey > busy.start) || dayAppointments.some((record) => {
      const candidate = new Date((record.appointment_time ?? record.scheduled_at) as string | undefined ?? '');
      return !Number.isNaN(candidate.getTime()) && candidate >= slot && candidate < end;
    });

    if (!isTaken) {
      openSlots.push({
        start: slot.toISOString(),
        end: end.toISOString(),
      });
    }
  }

  return {
    date,
    timezone,
    available: openSlots.length > 0,
    slots: openSlots,
    reason: openSlots.length === 0 ? 'No availability remains for the selected date.' : undefined,
  };
}

export async function bookAppointment(details: GoogleCalendarBookingDetails) {
  const appointmentTime = new Date(details.appointment_time);
  if (Number.isNaN(appointmentTime.getTime())) {
    throw new Error('appointment_time must be a valid ISO timestamp.');
  }

  const { calendar, calendarId } = getGoogleCalendarClient();

  const durationMinutes = details.duration_minutes ?? 30;
  const endTime = new Date(appointmentTime.getTime() + durationMinutes * 60 * 1000);
  const conflicts = await findConflictingAppointments(appointmentTime, endTime, details.appointment_id);

  if (conflicts.length > 0) {
    throw new Error('Double booking prevention triggered: the requested time is already reserved.');
  }

  const timezone = details.timezone ?? 'Asia/Jerusalem';
  const requestedLocal = zonedParts(appointmentTime, timezone);
  const requestedEndLocal = zonedParts(endTime, timezone);
  const calendarConflicts = await getGoogleCalendarBusyIntervals(requestedLocal.date, timezone);
  const requestedStartKey = `${requestedLocal.date}T${requestedLocal.time}`;
  const requestedEndKey = `${requestedEndLocal.date}T${requestedEndLocal.time}`;
  if (calendarConflicts.some((busy) => requestedStartKey < busy.end && requestedEndKey > busy.start)) {
    throw new Error('Double booking prevention triggered: Google Calendar is busy at the requested time.');
  }
  console.info('[google-calendar] creating-event', { clinicId: details.clinic_id ?? null, appointmentId: details.appointment_id ?? null, start: appointmentTime.toISOString() });
  const eventResponse = await calendar.events.insert({
    calendarId,
    sendUpdates: 'none',
    requestBody: {
      summary: `${details.clinic_name ? `${details.clinic_name} — ` : ''}${details.service ?? 'موعد'} — ${details.patient_name.trim()}`,
      description: `العيادة: ${details.clinic_name ?? '—'}\nالخدمة: ${details.service ?? '—'}\nالاسم: ${details.patient_name.trim()}${details.patient_phone.trim() ? `\nرقم التواصل: ${details.patient_phone.trim()}` : ''}`,
      start: { dateTime: appointmentTime.toISOString(), timeZone: timezone },
      end: { dateTime: endTime.toISOString(), timeZone: timezone },
    },
  });
  const googleEventId = eventResponse.data.id;
  if (!googleEventId) throw new Error('Google Calendar did not return an event id.');

  let data: Record<string, any>;
  if (details.appointment_id && details.clinic_id) {
    const { data: updated, error } = await supabaseAdmin
      .from('appointments')
      .update({ google_event_id: googleEventId, patient_name: details.patient_name.trim(), patient_phone: details.patient_phone.trim(), appointment_time: appointmentTime.toISOString(), status: details.status ?? 'confirmed' })
      .eq('id', details.appointment_id)
      .eq('clinic_id', details.clinic_id)
      .select('*')
      .single();
    if (error || !updated) {
      await calendar.events.delete({ calendarId, eventId: googleEventId }).catch(() => undefined);
      throw new Error(error?.message ?? 'Failed to link Google Calendar event to the appointment.');
    }
    data = updated as Record<string, any>;
  } else {
    if (!details.clinic_id) {
      await calendar.events.delete({ calendarId, eventId: googleEventId }).catch(() => undefined);
      throw new Error('clinic_id is required to save a calendar booking.');
    }
    const row = {
      clinic_id: details.clinic_id,
      patient_id: details.patient_id ?? null,
      service: details.service ?? 'Google Calendar booking',
      appointment_date: appointmentTime.toISOString().slice(0, 10),
      scheduled_at: appointmentTime.toISOString(),
      duration_minutes: durationMinutes,
      status: details.status ?? 'pending',
      patient_name: details.patient_name.trim(),
      patient_phone: details.patient_phone.trim(),
      appointment_time: appointmentTime.toISOString(),
      google_event_id: googleEventId,
      created_at: new Date().toISOString(),
    };
    const { data: inserted, error } = await supabaseAdmin.from('appointments').insert([row]).select('*').single();
    if (error || !inserted) {
      await calendar.events.delete({ calendarId, eventId: googleEventId }).catch(() => undefined);
      throw new Error(error?.message ?? 'Failed to save the appointment.');
    }
    data = inserted as Record<string, any>;
  }

  console.info('[google-calendar] event-created-and-linked', { clinicId: details.clinic_id ?? null, appointmentId: data.id, eventId: googleEventId });

  return {
    id: data.id,
    patient_name: data.patient_name,
    patient_phone: data.patient_phone,
    appointment_time: data.appointment_time,
    google_event_id: data.google_event_id,
    status: data.status,
  };
}
