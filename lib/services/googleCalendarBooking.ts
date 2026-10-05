import { supabaseAdmin } from '@/lib/supabase/admin';

export type AppointmentStatus = 'pending' | 'confirmed' | 'cancelled';

export type GoogleCalendarBookingDetails = {
  patient_name: string;
  patient_phone: string;
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

function ensureGoogleCalendarConfiguration(): void {
  const missing = [
    'GOOGLE_SERVICE_ACCOUNT_EMAIL',
    'GOOGLE_PRIVATE_KEY',
    'GOOGLE_CALENDAR_ID',
  ].filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      'Google Calendar integration is not configured yet. Set GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, and GOOGLE_CALENDAR_ID before enabling direct bookings.',
    );
  }
}

async function findConflictingAppointments(date: string, start: Date, end: Date) {
  const { data, error } = await supabaseAdmin
    .from('appointments')
    .select('id, appointment_time, status')
    .gte('appointment_time', start.toISOString())
    .lt('appointment_time', end.toISOString())
    .in('status', ['pending', 'confirmed']);

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

  const { data: appointments, error } = await supabaseAdmin
    .from('appointments')
    .select('appointment_time, status')
    .gte('appointment_time', startOfDay.toISOString())
    .lte('appointment_time', endOfDay.toISOString())
    .in('status', ['pending', 'confirmed']);

  if (error) {
    throw new Error(error.message || 'Could not load appointment schedule.');
  }

  const openSlots: Array<{ start: string; end: string }> = [];
  const dayAppointments = appointments ?? [];
  const businessStart = new Date(`${date}T09:00:00.000Z`);
  const businessEnd = new Date(`${date}T17:00:00.000Z`);

  for (let slot = new Date(businessStart); slot < businessEnd; slot = new Date(slot.getTime() + 30 * 60 * 1000)) {
    const end = new Date(slot.getTime() + 30 * 60 * 1000);
    const isTaken = dayAppointments.some((record) => {
      const candidate = new Date(record.appointment_time as string | undefined ?? '');
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

  ensureGoogleCalendarConfiguration();

  const durationMinutes = details.duration_minutes ?? 30;
  const endTime = new Date(appointmentTime.getTime() + durationMinutes * 60 * 1000);
  const conflicts = await findConflictingAppointments(
    details.appointment_time.slice(0, 10),
    appointmentTime,
    endTime,
  );

  if (conflicts.length > 0) {
    throw new Error('Double booking prevention triggered: the requested time is already reserved.');
  }

  const row = {
    patient_name: details.patient_name.trim(),
    patient_phone: details.patient_phone.trim(),
    appointment_time: appointmentTime.toISOString(),
    status: details.status ?? 'pending',
    google_event_id: `google-calendar-${Date.now()}`,
    created_at: new Date().toISOString(),
  };

  const { data, error } = await supabaseAdmin
    .from('appointments')
    .insert([row])
    .select('*')
    .single();

  if (error) {
    throw new Error(error.message || 'Failed to save the appointment.');
  }

  return {
    id: data.id,
    patient_name: data.patient_name,
    patient_phone: data.patient_phone,
    appointment_time: data.appointment_time,
    google_event_id: data.google_event_id,
    status: data.status,
  };
}
