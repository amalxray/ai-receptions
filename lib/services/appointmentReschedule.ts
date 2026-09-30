import { supabaseAdmin } from '@/lib/supabase/admin';
import { logEvent } from '@/lib/server/logging';
import { loadProviderSchedule, getActiveServiceById, loadExistingAppointments, isClinicHoliday } from './bookingService';
import { checkSlotAvailability } from './scheduling';
import { createAppointmentReminders, cancelAppointmentReminders } from './reminderEngine';

/**
 * B52 — typed failure contract for rescheduling.
 *
 * The route used to derive the HTTP status by sniffing substrings of
 * `err.message`. Two *expected business outcomes* matched no pattern and fell
 * through to `500 Internal server error`:
 *   • an appointment with no provider (walk-in / legacy rows) → "…no provider assigned…"
 *   • an appointment whose provider row was deleted           → "Provider not found…"
 * `hala-clinic` really has such rows (e.g. status=scheduled with provider_id NULL),
 * so dragging that card produced a generic server error for the receptionist.
 *
 * Failures now carry an explicit code; the message text is unchanged so every
 * existing caller/assertion keeps working.
 */
export type RescheduleErrorCode =
  | 'not_found'
  | 'ineligible_status'
  | 'no_provider'
  | 'provider_not_assigned'
  | 'provider_not_found'
  | 'slot_unavailable'
  | 'conflict'
  | 'update_failed';

export class RescheduleError extends Error {
  readonly code: RescheduleErrorCode;

  constructor(code: RescheduleErrorCode, message: string) {
    super(message);
    this.name = 'RescheduleError';
    this.code = code;
  }
}

/**
 * HTTP status per failure. Business rejections are 4xx — never 5xx — so the UI
 * can show the real reason instead of "Internal server error".
 */
export const RESCHEDULE_HTTP_STATUS: Record<RescheduleErrorCode, number> = {
  not_found: 404,
  ineligible_status: 409,
  no_provider: 409,
  provider_not_assigned: 403,
  provider_not_found: 404,
  slot_unavailable: 409,
  conflict: 409,
  update_failed: 500,
};

/** Arabic, actionable copy for the dashboard banner (B52: no bare English 500). */
export const RESCHEDULE_USER_MESSAGE: Record<RescheduleErrorCode, string> = {
  not_found: 'لم يتم العثور على هذا الموعد في هذه العيادة — قد يكون حُذف أو نُقل.',
  ineligible_status: 'لا يمكن إعادة جدولة موعد مكتمل أو ملغي أو مسجّل كـ«لم يحضر».',
  no_provider: 'لا يمكن إعادة الجدولة: هذا الموعد غير مرتبط بمقدّم خدمة. افتح «تعديل الموعد» وحدّد الطبيب ثم أعِد المحاولة.',
  provider_not_assigned: 'مقدّم الخدمة غير مسجّل لهذه الخدمة — صحّح ارتباطه بها من صفحة «الخدمات».',
  provider_not_found: 'مقدّم الخدمة المرتبط بهذا الموعد لم يعد موجودًا في هذه العيادة — حدّد بديلًا أولًا.',
  slot_unavailable: 'التوقيت المختار غير متاح لمقدّم الخدمة في هذا اليوم — اختر وقتًا آخر.',
  conflict: 'تم حجز هذا الوقت للتو من جهاز آخر — اختر وقتًا آخر.',
  update_failed: 'تعذر حفظ الموعد — أعد المحاولة، وإن تكرّر الخطأ تواصل مع الدعم.',
};

/**
 * Validates that a provider is assigned to a service (when assignments configured).
 * Returns true if assigned, false if explicitly not assigned, null if table unavailable.
 */
async function providerAssignedToService(clinicId: string, providerId: string, serviceId: string): Promise<boolean | null> {
  const { data, error } = await supabaseAdmin
    .from('provider_services')
    .select('id')
    .eq('clinic_id', clinicId)
    .eq('provider_id', providerId)
    .eq('service_id', serviceId)
    .maybeSingle();

  if (error) return null; // table unavailable — fallback allowed
  return data !== null;
}

/**
 * Reschedules an existing appointment to a new date/time.
 * Validates availability, updates the appointment atomically,
 * cancels old reminders, creates new reminders, and queues a reschedule notification.
 *
 * Concurrency-safe via the partial unique index on (provider_id, scheduled_at)
 * for active statuses. If two reschedules collide, the second insert/update
 * will fail the update and throw.
 */
export async function rescheduleAppointment(params: {
  clinicId: string;
  appointmentId: string;
  date: string;
  time: string;
  /**
   * B52-B — optional provider change ("تعديل الموعد"). Two production needs:
   *   • rows created without a provider (walk-in / legacy) had NO way out — the
   *     agenda fell back to `appointment.id` as a provider id, so the slot query
   *     could never succeed and the edit panel looked broken;
   *   • re-assigning a patient to another doctor must go through the SAME
   *     assignment / schedule / availability / unique-index validation, never
   *     through a raw PATCH that could double-book a slot.
   */
  providerId?: string | null;
}): Promise<{ id: string; scheduled_at: string; appointment_date: string; status: string; patient_id: string | null; provider_id: string | null }> {
  const { clinicId, appointmentId, date, time } = params;

  // 1. Load the existing appointment
  const { data: appointment, error: loadError } = await supabaseAdmin
    .from('appointments')
    .select('*')
    .eq('id', appointmentId)
    .eq('clinic_id', clinicId)
    .is('deleted_at', null)
    .maybeSingle();

  if (loadError || !appointment) {
    throw new RescheduleError('not_found', 'Appointment not found for this clinic');
  }

  // 2. Check eligibility
  const INELIGIBLE = new Set(['cancelled', 'completed', 'no_show']);
  if (INELIGIBLE.has(appointment.status)) {
    throw new RescheduleError('ineligible_status', `Appointment cannot be rescheduled from status: ${appointment.status}`);
  }

  /** The provider this appointment belongs to AFTER the move: the one picked in
   * the edit panel when given, otherwise the one it already has. */
  const targetProviderId = params.providerId?.trim() || appointment.provider_id || null;

  // 3. Resolve service duration
  let durationMinutes = appointment.duration_minutes ?? 30;
  if (appointment.service_id) {
    const service = await getActiveServiceById(clinicId, appointment.service_id);
    if (service) durationMinutes = service.duration_minutes;
  }

  const startsAt = `${date}T${time}:00.000Z`;
  const holiday = await isClinicHoliday(clinicId, date);

  if (targetProviderId) {
    // 4. Verify provider is assigned to a service (when assignments used)
    if (appointment.service_id) {
      const assigned = await providerAssignedToService(clinicId, targetProviderId, appointment.service_id);
      if (assigned === false) {
        throw new RescheduleError('provider_not_assigned', 'Provider is not assigned to this service');
      }
    }

    // 5. Load schedule for chosen date
    const schedule = await loadProviderSchedule(clinicId, targetProviderId);
    if (!schedule) {
      throw new RescheduleError('provider_not_found', 'Provider not found for this clinic');
    }

    // 6. Check availability of new slot
    const existing = await loadExistingAppointments(clinicId, targetProviderId, date);
    const otherAppointments = existing.filter((a) => a.id !== appointment.id);

    const availability = checkSlotAvailability({
      startsAt,
      durationMinutes,
      schedule,
      existingAppointments: otherAppointments,
      holiday,
    });

    if (!availability.available) {
      throw new RescheduleError('slot_unavailable', `Requested slot is unavailable: ${availability.reason}`);
    }
  } else if (holiday) {
    // With no assigned provider there is no provider schedule to check; retain
    // the clinic-wide holiday guard and leave provider_id NULL on the appointment.
    throw new RescheduleError('slot_unavailable', 'Requested slot is unavailable: holiday');
  }

  // 7. Atomically update the appointment
  const { data: updated, error: updateError } = await supabaseAdmin
    .from('appointments')
    .update({
      appointment_date: date,
      scheduled_at: startsAt,
      duration_minutes: durationMinutes,
      // B52-B — part of the move: the (provider_id, scheduled_at) unique index
      // has to see the NEW provider, otherwise two patients could be booked into
      // the same doctor+slot from the edit panel.
      provider_id: targetProviderId,
    })
    .eq('id', appointmentId)
    .eq('clinic_id', clinicId)
    .select('id, scheduled_at, appointment_date, status, patient_id, provider_id')
    .single();

  if (updateError) {
    // A unique violation on provider_id+scheduled_at indicates a concurrent booking
    if (updateError.code === '23505' || /duplicate key/i.test(updateError.message)) {
      logEvent('reschedule_concurrent_collision', { clinic_id: clinicId, appointment_id: appointmentId }, 'error');
      throw new RescheduleError('conflict', 'Slot was just booked by another request. Please choose another time.');
    }
    logEvent('reschedule_update_failed', { clinic_id: clinicId, appointment_id: appointmentId, code: updateError.code, detail: updateError.message }, 'error');
    throw new RescheduleError('update_failed', 'Failed to reschedule appointment');
  }

  // 8. Cancel old pending reminders (best-effort — communication failure must NOT fail the reschedule)
  try {
    await cancelAppointmentReminders({ clinicId, appointmentId, client: supabaseAdmin });
    logEvent('appointment_rescheduled_old_reminders_cancelled', { clinic_id: clinicId, appointment_id: appointmentId });
  } catch (reminderCancelError) {
    logEvent('appointment_rescheduled_reminder_cancel_failed', {
      clinic_id: clinicId,
      appointment_id: appointmentId,
      error: reminderCancelError instanceof Error ? reminderCancelError.message : String(reminderCancelError),
    }, 'error');
  }

  // 9. Create new reminders for the new scheduled time
  try {
    await createAppointmentReminders({
      clinicId,
      appointmentId,
      scheduledAt: startsAt,
      channels: ['email'],
      patientId: appointment.patient_id,
      client: supabaseAdmin,
    });
    logEvent('appointment_rescheduled_reminders_created', { clinic_id: clinicId, appointment_id: appointmentId });
  } catch (reminderError) {
    // Reminder creation failure must not fail the reschedule
    logEvent('appointment_rescheduled_reminders_failed', {
      clinic_id: clinicId,
      appointment_id: appointmentId,
      error: reminderError instanceof Error ? reminderError.message : String(reminderError),
    }, 'error');
  }

  // 10. Queue a rescheduling notification (best-effort)
  try {
    await supabaseAdmin.from('notification_queue').insert({
      clinic_id: clinicId,
      appointment_id: appointmentId,
      patient_id: appointment.patient_id ?? null,
      channel: 'email',
      type: 'appointment_rescheduling',
      status: 'pending',
      scheduled_for: new Date().toISOString(),
      attempt_count: 0,
      payload: { rescheduled_date: date, rescheduled_time: time },
    });
    logEvent('appointment_rescheduled_notification_queued', { clinic_id: clinicId, appointment_id: appointmentId });
  } catch (notifyError) {
    logEvent('appointment_rescheduled_notification_failed', {
      clinic_id: clinicId,
      appointment_id: appointmentId,
      error: notifyError instanceof Error ? notifyError.message : String(notifyError),
    }, 'error');
  }

  logEvent('appointment_rescheduled', { clinic_id: clinicId, appointment_id: appointmentId, new_date: date, new_time: time });
  return updated;
}