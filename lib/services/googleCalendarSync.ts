import { createInAppNotification } from '@/lib/notifications/inAppNotifier';
import { logEvent } from '@/lib/server/logging';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { bookAppointment, deleteGoogleCalendarEvent } from '@/lib/services/googleCalendarBooking';
import { clinicLocalToInstant } from '@/lib/services/clinicClock';
import { getClinicGoogleCalendarClient } from '@/lib/services/googleCalendarOAuth';
import { getClinicSlugById } from '@/lib/services/tenantAccess';

type SyncAppointmentRow = {
  id: string;
  clinic_id: string;
  provider_id: string | null;
  patient_id: string | null;
  service: string;
  appointment_date: string | null;
  scheduled_at: string | null;
  appointment_time: string | null;
  duration_minutes: number | null;
  patient_name: string | null;
  patient_phone: string | null;
  google_event_id: string | null;
  status: string;
};

function isInvalidGrant(error: unknown): boolean {
  if (!error || typeof error !== 'object') return /invalid_grant/i.test(String(error));
  const value = error as {
    code?: unknown;
    message?: unknown;
    response?: { data?: { error?: unknown } };
  };
  return value.code === 'invalid_grant'
    || value.response?.data?.error === 'invalid_grant'
    || (typeof value.message === 'string' && /invalid_grant/i.test(value.message));
}

async function updateSyncState(
  appointmentId: string,
  clinicId: string,
  values: {
    needs_google_sync: boolean;
    google_sync_blocked_at: string | null;
    appointment_time?: string | null;
  },
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('appointments')
    .update(values)
    .eq('id', appointmentId)
    .eq('clinic_id', clinicId);
  if (error) throw error;
}

async function notifyReconnectRequired(clinicId: string, appointmentId: string): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from('notifications')
    .select('id')
    .eq('clinic_id', clinicId)
    .eq('channel', 'inapp')
    .eq('status', 'unread')
    .contains('payload', { title: 'إعادة ربط Google Calendar مطلوبة' })
    .limit(1);

  if (error) {
    logEvent('google_calendar_reconnect_notification_check_failed', {
      clinic_id: clinicId,
      appointment_id: appointmentId,
    }, 'warn');
    return;
  }
  if (data?.length) return;

  const clinicSlug = await getClinicSlugById(clinicId);

  await createInAppNotification({
    clinicId,
    appointmentId,
    event: 'system',
    title: 'إعادة ربط Google Calendar مطلوبة',
    body: 'يرجى إعادة ربط Google Calendar من الإعدادات (انتهت الصلاحية).',
    link: `/dashboard/${encodeURIComponent(clinicSlug ?? clinicId)}/communication-settings`,
  });
}

/** Marks an appointment for immediate best-effort sync and scheduled retry. */
export async function queueGoogleCalendarSync(
  appointmentId: string,
  clinicId: string,
  appointmentTime?: string,
): Promise<void> {
  await updateSyncState(appointmentId, clinicId, {
    needs_google_sync: true,
    google_sync_blocked_at: null,
    ...(appointmentTime ? { appointment_time: appointmentTime } : {}),
  });
}

/** Syncs one queued appointment. Invalid refresh tokens are blocked until reconnect. */
export async function syncGoogleCalendarAppointment(appointmentId: string): Promise<'synced' | 'blocked' | 'skipped'> {
  const { data, error } = await supabaseAdmin
    .from('appointments')
    .select('id, clinic_id, provider_id, patient_id, service, appointment_date, scheduled_at, appointment_time, duration_minutes, patient_name, patient_phone, google_event_id, status')
    .eq('id', appointmentId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  if (!data) return 'skipped';

  const appointment = data as SyncAppointmentRow;
  if (appointment.status === 'cancelled') {
    if (appointment.google_event_id) {
      try {
        await deleteGoogleCalendarEvent(appointment.clinic_id, appointment.google_event_id);
      } catch (deleteError) {
        logEvent('google_calendar_cancelled_event_delete_failed', {
          clinic_id: appointment.clinic_id,
          appointment_id: appointment.id,
          google_event_id: appointment.google_event_id,
          reason: deleteError instanceof Error ? deleteError.message : String(deleteError),
        }, 'warn');
      }
    }
    await supabaseAdmin
      .from('appointments')
      .update({
        google_event_id: null,
        needs_google_sync: false,
        google_sync_blocked_at: null,
      })
      .eq('id', appointment.id)
      .eq('clinic_id', appointment.clinic_id);
    return 'skipped';
  }
  if (appointment.google_event_id) {
    const client = await getClinicGoogleCalendarClient(appointment.clinic_id);
    let shouldRecreate = false;
    if (client) {
      try {
        const eventResponse = await client.calendar.events.get({
          calendarId: client.calendarId,
          eventId: appointment.google_event_id,
        });
        await client.flushTokenPersistence?.();
        if (eventResponse.data?.status === 'cancelled') {
          shouldRecreate = true;
        }
      } catch (eventError) {
        try {
          await client.flushTokenPersistence?.();
        } catch {
          // Best-effort only.
        }
        const status =
          (eventError as { code?: unknown; response?: { status?: unknown } })?.code
          ?? (eventError as { response?: { status?: unknown } })?.response?.status;
        if (status === 404 || status === 410) {
          shouldRecreate = true;
        } else {
          await updateSyncState(appointment.id, appointment.clinic_id, {
            needs_google_sync: false,
            google_sync_blocked_at: null,
          });
          return 'synced';
        }
      }
    }
    if (!shouldRecreate) {
      await updateSyncState(appointment.id, appointment.clinic_id, {
        needs_google_sync: false,
        google_sync_blocked_at: null,
      });
      return 'synced';
    }

    // Linked Google event is cancelled/missing: clear it and create a fresh one.
    try {
      await deleteGoogleCalendarEvent(appointment.clinic_id, appointment.google_event_id);
    } catch {
      // Best-effort cleanup only.
    }
    await supabaseAdmin
      .from('appointments')
      .update({ google_event_id: null })
      .eq('id', appointment.id)
      .eq('clinic_id', appointment.clinic_id);
    appointment.google_event_id = null;
  }

  const scheduledWallTime = appointment.scheduled_at?.slice(11, 16);
  const appointmentTime = appointment.appointment_time
    ?? (appointment.appointment_date && scheduledWallTime
      ? clinicLocalToInstant(appointment.appointment_date, scheduledWallTime, 'Asia/Jerusalem').toISOString()
      : appointment.scheduled_at);
  if (!appointment.provider_id || !appointmentTime) {
    await updateSyncState(appointment.id, appointment.clinic_id, {
      needs_google_sync: true,
      google_sync_blocked_at: new Date().toISOString(),
    });
    return 'blocked';
  }

  let patientName = appointment.patient_name;
  let patientPhone = appointment.patient_phone;
  if ((!patientName || !patientPhone) && appointment.patient_id) {
    const { data: patient, error: patientError } = await supabaseAdmin
      .from('patients')
      .select('full_name, phone_number')
      .eq('clinic_id', appointment.clinic_id)
      .eq('id', appointment.patient_id)
      .maybeSingle();
    if (patientError) throw patientError;
    patientName ??= patient?.full_name ?? null;
    patientPhone ??= patient?.phone_number ?? null;
  }
  if (!patientName || !patientPhone) {
    await updateSyncState(appointment.id, appointment.clinic_id, {
      needs_google_sync: true,
      google_sync_blocked_at: new Date().toISOString(),
    });
    return 'blocked';
  }

  const { data: clinic, error: clinicError } = await supabaseAdmin
    .from('clinics')
    .select('name')
    .eq('id', appointment.clinic_id)
    .maybeSingle();
  if (clinicError) throw clinicError;

  try {
    const result = await bookAppointment({
      appointment_id: appointment.id,
      clinic_id: appointment.clinic_id,
      provider_id: appointment.provider_id,
      appointment_time: appointmentTime,
      patient_name: patientName,
      patient_phone: patientPhone,
      clinic_name: clinic?.name ?? undefined,
      service: appointment.service,
      duration_minutes: appointment.duration_minutes ?? undefined,
    });

    if (!result.calendar_connected || !result.google_event_id) {
      await updateSyncState(appointment.id, appointment.clinic_id, {
        needs_google_sync: true,
        google_sync_blocked_at: new Date().toISOString(),
      });
      return 'blocked';
    }
    return 'synced';
  } catch (syncError) {
    const invalidGrant = isInvalidGrant(syncError);
    await updateSyncState(appointment.id, appointment.clinic_id, {
      needs_google_sync: true,
      google_sync_blocked_at: invalidGrant ? new Date().toISOString() : null,
    });
    if (invalidGrant) await notifyReconnectRequired(appointment.clinic_id, appointment.id);
    logEvent('google_calendar_appointment_sync_failed', {
      clinic_id: appointment.clinic_id,
      appointment_id: appointment.id,
      reason: invalidGrant ? 'invalid_grant' : 'calendar_sync_failed',
    }, 'error');
    throw syncError;
  }
}
