import { supabaseAdmin } from '@/lib/supabase/admin';
import { google } from 'googleapis';

export type AppointmentStatus = 'pending' | 'confirmed' | 'cancelled';

export type GoogleCalendarBookingDetails = {
  clinic_id: string;
  patient_name: string;
  patient_phone: string;
  service: string;
  appointment_time: string;
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

async function getClinicCalendarId(clinicId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from('clinics')
    .select('google_calendar_id')
    .eq('id', clinicId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) throw new Error(`Could not load clinic calendar configuration: ${error.message}`);
  return typeof data?.google_calendar_id === 'string' && data.google_calendar_id.trim()
    ? data.google_calendar_id.trim()
    : null;
}

async function resolveCalendarId(clinicId: string): Promise<string> {
  const clinicCalendarId = await getClinicCalendarId(clinicId);
  const calendarId = clinicCalendarId || process.env.GOOGLE_CALENDAR_ID?.trim();
  if (!calendarId) {
    throw new Error('Set a Google Calendar ID for this clinic or configure GOOGLE_CALENDAR_ID.');
  }
  return calendarId;
}

function getGoogleCalendarClient() {
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL?.trim();
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n').trim();
  const missing = [
    !clientEmail && 'GOOGLE_CLIENT_EMAIL',
    !privateKey && 'GOOGLE_PRIVATE_KEY',
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(`Google Calendar is not configured. Set ${missing.join(' and ')}.`);
  }

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: clientEmail,
      private_key: privateKey,
    },
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });

  return google.calendar({ version: 'v3', auth });
}

async function createGoogleCalendarEvent(
  calendarId: string,
  details: GoogleCalendarBookingDetails,
  start: Date,
  end: Date
) {
  const calendar = getGoogleCalendarClient();
  const response = await calendar.events.insert({
    calendarId,
    requestBody: {
      summary: `Dental appointment: ${details.service.trim()}`,
      description: [
        `Patient: ${details.patient_name.trim()}`,
        `Phone: ${details.patient_phone.trim()}`,
        `Service: ${details.service.trim()}`,
        `Clinic ID: ${details.clinic_id}`,
      ].join('\n'),
      start: {
        dateTime: start.toISOString(),
        timeZone: details.timezone || 'UTC',
      },
      end: {
        dateTime: end.toISOString(),
        timeZone: details.timezone || 'UTC',
      },
    },
  });

  if (!response.data.id) {
    throw new Error('Google Calendar created an event without returning its event ID.');
  }
  return response.data.id;
}

async function findConflictingAppointments(
  clinicId: string,
  start: Date,
  end: Date
) {
  const earliestPossibleStart = new Date(start.getTime() - 480 * 60_000);
  const { data, error } = await supabaseAdmin
    .from('appointments')
    .select('id, scheduled_at, duration_minutes, status')
    .eq('clinic_id', clinicId)
    .gte('scheduled_at', earliestPossibleStart.toISOString())
    .lt('scheduled_at', end.toISOString())
    .in('status', ['pending', 'confirmed', 'scheduled']);

  if (error) throw new Error(error.message || 'Failed to check appointment overlap.');
  return (data ?? []).filter((appointment) => {
    const existingStart = new Date(appointment.scheduled_at);
    const existingEnd = new Date(
      existingStart.getTime() + (appointment.duration_minutes ?? 30) * 60_000
    );
    return existingStart < end && existingEnd > start;
  });
}

export async function checkAvailability(
  clinicId: string,
  date: string,
  timezone = 'UTC'
): Promise<AvailabilityResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('Date must be in YYYY-MM-DD format.');
  }
  await resolveCalendarId(clinicId);

  const startOfDay = new Date(`${date}T00:00:00.000Z`);
  const endOfDay = new Date(`${date}T23:59:59.999Z`);
  const { data: appointments, error } = await supabaseAdmin
    .from('appointments')
    .select('scheduled_at, duration_minutes, status')
    .eq('clinic_id', clinicId)
    .gte('scheduled_at', new Date(startOfDay.getTime() - 480 * 60_000).toISOString())
    .lte('scheduled_at', endOfDay.toISOString())
    .in('status', ['pending', 'confirmed', 'scheduled']);

  if (error) throw new Error(error.message || 'Could not load appointment schedule.');

  const dayAppointments = appointments ?? [];
  const businessStart = new Date(`${date}T09:00:00.000Z`);
  const businessEnd = new Date(`${date}T17:00:00.000Z`);
  const slots: Array<{ start: string; end: string }> = [];

  for (let slot = new Date(businessStart); slot < businessEnd; slot = new Date(slot.getTime() + 30 * 60_000)) {
    const end = new Date(slot.getTime() + 30 * 60_000);
    const taken = dayAppointments.some((appointment) => {
      const candidate = new Date(appointment.scheduled_at);
      if (Number.isNaN(candidate.getTime())) return false;
      const appointmentEnd = new Date(
        candidate.getTime() + (appointment.duration_minutes ?? 30) * 60_000
      );
      return candidate < end && appointmentEnd > slot;
    });
    if (!taken) slots.push({ start: slot.toISOString(), end: end.toISOString() });
  }

  return {
    date,
    timezone,
    available: slots.length > 0,
    slots,
    reason: slots.length === 0 ? 'No availability remains for the selected date.' : undefined,
  };
}

export async function bookAppointment(details: GoogleCalendarBookingDetails) {
  const appointmentTime = new Date(details.appointment_time);
  if (Number.isNaN(appointmentTime.getTime())) {
    throw new Error('appointment_time must be a valid ISO timestamp.');
  }

  const calendarId = await resolveCalendarId(details.clinic_id);
  const durationMinutes = details.duration_minutes ?? 30;
  const endTime = new Date(appointmentTime.getTime() + durationMinutes * 60_000);
  const conflicts = await findConflictingAppointments(details.clinic_id, appointmentTime, endTime);
  if (conflicts.length > 0) {
    throw new Error('Double booking prevention triggered: the requested time is already reserved.');
  }

  const googleEventId = await createGoogleCalendarEvent(
    calendarId,
    details,
    appointmentTime,
    endTime
  );
  const date = appointmentTime.toISOString().slice(0, 10);
  const row = {
    clinic_id: details.clinic_id,
    patient_name: details.patient_name.trim(),
    patient_phone: details.patient_phone.trim(),
    service: details.service.trim(),
    appointment_date: date,
    appointment_time: appointmentTime.toISOString(),
    scheduled_at: appointmentTime.toISOString(),
    duration_minutes: durationMinutes,
    status: details.status ?? 'pending',
    google_calendar_id: calendarId,
    google_event_id: googleEventId,
  };

  const { data, error } = await supabaseAdmin
    .from('appointments')
    .insert(row)
    .select('id, clinic_id, patient_name, patient_phone, service, appointment_time, google_calendar_id, google_event_id, status')
    .single();

  if (error) {
    const calendar = getGoogleCalendarClient();
    try {
      await calendar.events.delete({ calendarId, eventId: googleEventId });
    } catch (cleanupError) {
      const cleanupMessage = cleanupError instanceof Error
        ? cleanupError.message
        : 'Unknown Google Calendar cleanup error';
      throw new Error(
        `Failed to save the appointment (${error.message}). Google Calendar event ${googleEventId} could not be removed: ${cleanupMessage}`
      );
    }
    throw new Error(error.message || 'Failed to save the appointment.');
  }

  return {
    id: data.id,
    clinic_id: data.clinic_id,
    patient_name: data.patient_name,
    patient_phone: data.patient_phone,
    service: data.service,
    appointment_time: data.appointment_time,
    google_calendar_id: data.google_calendar_id,
    google_event_id: data.google_event_id,
    status: data.status,
  };
}
