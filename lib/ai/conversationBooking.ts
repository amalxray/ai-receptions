import { supabaseAdmin } from '@/lib/supabase/admin';
import { logEvent } from '@/lib/server/logging';
import { findOrCreatePatient, createBooking, isValidBookingPhone } from '@/lib/services/bookingService';
import { cancelAppointmentReminders } from '@/lib/services/reminderEngine';
import { bookAppointment as createGoogleCalendarBooking } from '@/lib/services/googleCalendarBooking';
import { clinicLocalToInstant } from '@/lib/services/clinicClock';
import type { ClinicOperatingData, ClinicServiceForAI } from './clinicDataContext';
import { persistReceptionistSlot } from './clinicDataContext';

/**
 * Arabic/English confirmation words (fix [4]). The state machine's
 * `patient_confirmed_booking` never fired for plain spoken Arabic ("طيب",
 * "تمام", "احجز"), so the booking never executed while the model still CLAIMED
 * it was done — the exact "fake confirmation" bug. This local gate runs on the
 * RAW user message (no LLM) as a second consent path.
 */
const CONFIRMATION_WORDS = [
  'نعم', 'أكيد', 'اكيد', 'أكد', 'اكد', 'موافق', 'أوافق', 'تمام', 'طيب', 'احجز', 'احجزي',
  'ok', 'okay', 'yes', 'confirm', 'yep', 'sure',
] as const;

/** True when the raw message contains any confirmation word (diacritics-insensitive). */
export function containsConfirmationWord(text: string | null | undefined): boolean {
  if (!text) return false;
  const normalized = text.toLowerCase().replace(/[\u064B-\u0652\u0670]/g, '').trim();
  return CONFIRMATION_WORDS.some((word) => normalized.includes(word));
}

/**
 * Conversational booking execution — creates the appointment only when the
 * explicit booking-action endpoint calls it with:
 *   state === 'BOOKING' && patient_confirmed_booking
 * AND every required field (service, provider, patient name, phone, slot) is
 * already known.
 *
 * Safety:
 *  - Uses the existing `createBooking` (slot re-check + DB unique constraint),
 *    so concurrency is protected exactly like the public booking route.
 *  - Idempotent: if the conversation metadata already carries an
 *    appointment_id, it never creates a second appointment.
 *  - Clinic-scoped: ids are validated against THIS clinic by bookingService.
 *  - Never fabricates: if a required field is missing it returns
 *    `need_more_info` and the AI asks only for what is missing.
 *  - A non-tentative slot or any error degrades to `slot_unavailable` /
 *    `failed` → the AI offers alternatives or hands off.
 */

export type BookingAttemptResult =
  | { action: 'not_ready'; state: string }
  | { action: 'need_more_info'; missing: Array<'service' | 'provider' | 'patient_name' | 'phone' | 'slot'> }
  | { action: 'slot_unavailable'; reason: string }
  | { action: 'booked'; appointment: { id: string; scheduled_at: string; status: string } }
  | { action: 'already_booked'; appointment_id: string }
  | { action: 'failed'; reason: string };

/**
 * PHASE A — `provider` is a blocking field ONLY when the selected service
 * actually requires one (`clinic_services.requires_provider`). Callers without
 * service context keep the legacy strict behaviour by omitting the flag
 * (it defaults to `true`), so imaging centers can stop being forced into a
 * dentist/provider choice without touching clinics.
 */
export function missingBookingFields(
  state: {
    booking: { service_id: string | null; provider_id: string | null; slot: string | null; patient_name: string | null; phone: string | null };
  },
  requiresProvider: boolean = true,
  requiresPhone = false,
): Array<'service' | 'provider' | 'patient_name' | 'phone' | 'slot'> {
  const missing: Array<'service' | 'provider' | 'patient_name' | 'phone' | 'slot'> = [];
  if (!state.booking.service_id) missing.push('service');
  if (requiresProvider && !state.booking.provider_id) missing.push('provider');
  if (!state.booking.patient_name || !state.booking.patient_name.trim()) missing.push('patient_name');
  if (requiresPhone && (!state.booking.phone || !state.booking.phone.trim())) missing.push('phone');
  if (!state.booking.slot) missing.push('slot');
  return missing;
}

/** Normalises an Arabic/English service name so tolerant matching is possible. */
function normalizeServiceName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\s\-_،,()]+/g, '')
    .replace(/^ال/, '');
}

/**
 * Deterministic name → service resolution inside THIS clinic's catalog (the same
 * spirit as `resolveServiceByName`, additionally tolerant of the "ال" article).
 * Returns undefined when nothing matches, so a booking degrades to
 * `need_more_info` instead of ever inventing a service.
 */
export function matchServiceByName(hint: string, services: ClinicServiceForAI[]): ClinicServiceForAI | undefined {
  const needle = normalizeServiceName(hint);
  if (!needle) return undefined;
  return (
    services.find((s) => normalizeServiceName(s.name) === needle) ??
    services.find(
      (s) => normalizeServiceName(s.name).includes(needle) || needle.includes(normalizeServiceName(s.name))
    )
  );
}

export async function attemptConversationBooking(params: {
  clinicId: string;
  conversationId: string;
  state: string;
  patientConfirmedBooking: boolean;
  booking: { service_id: string | null; provider_id: string | null; slot: string | null; patient_name: string | null; phone: string | null; email?: string | null };
  operatingData: ClinicOperatingData;
  /**
   * Last-chance service hint (the name the patient asked for). Used ONLY when
   * `booking.service_id` is empty, so a chat booking is never blocked because
   * the model failed to store `recommended_service_id` — the exact divergence
   * between the AI path and the (working) public "request service" path.
   */
  serviceNameHint?: string | null;
  requirePhone?: boolean;
  googleCalendar?: boolean;
  clinicName?: string | null;
  timeZone?: string | null;
}): Promise<BookingAttemptResult> {
  const { clinicId, conversationId, state, patientConfirmedBooking, booking, operatingData, serviceNameHint, requirePhone = false, googleCalendar = false, clinicName, timeZone } = params;

  if (state !== 'BOOKING' || !patientConfirmedBooking) {
    return { action: 'not_ready', state };
  }

  // Idempotency guard: a booking already created for this conversation.
  try {
    const { data: meta } = await supabaseAdmin
      .from('conversations')
      .select('metadata')
      .eq('id', conversationId)
      .eq('clinic_id', clinicId)
      .maybeSingle();
    const existingAppointmentId =
      (meta?.metadata as Record<string, unknown>)?.booking &&
      ((meta.metadata as Record<string, unknown>).booking as Record<string, unknown>).appointment_id;
    if (typeof existingAppointmentId === 'string' && existingAppointmentId) {
      return { action: 'already_booked', appointment_id: existingAppointmentId };
    }
  } catch {
    // Non-fatal: proceed, bookingService also guards duplicates via constraints.
  }

  // Resolve the SERVICE exactly like the public booking page does (it always
  // books a real, clinic-scoped service): use the AI's pinned id when present,
  // otherwise match the name the patient asked for against this clinic's real
  // catalog — deterministic, no LLM, never invented.
  const service =
    (booking.service_id ? operatingData.services.find((s) => s.id === booking.service_id) : undefined) ??
    (serviceNameHint ? matchServiceByName(serviceNameHint, operatingData.services) : undefined);

  const missing = missingBookingFields({
    booking: { ...booking, service_id: service?.id ?? booking.service_id },
  }, true, requirePhone);
  if (missing.length > 0) {
    return { action: 'need_more_info', missing };
  }

  // Phone is OPTIONAL (user decision, fix [5]) — never a blocking field. A
  // missing, empty, or malformed phone is normalised to null (treated as "no
  // phone"): never blocks the booking, never stores garbage.
  const rawPhone = typeof booking.phone === 'string' ? booking.phone.trim() : null;
  const phone = rawPhone && isValidBookingPhone(rawPhone) ? rawPhone : null;
  if (requirePhone && !phone) return { action: 'need_more_info', missing: ['phone'] };

  // Verify the service + provider actually exist in THIS clinic before creating
  // (the same tenant invariant the public route is bound by).
  const providerExists = operatingData.providers.some((p) => p.id === booking.provider_id);
  if (!service || !providerExists) {
    logEvent('conversation_booking_invalid_recommendation', {
      clinic_id: clinicId,
      conversation_id: conversationId,
      service_id: service?.id ?? booking.service_id,
      provider_id: booking.provider_id,
      service_resolved_by_name: Boolean(!booking.service_id && service),
    }, 'error');
    return { action: 'failed', reason: 'recommendation_out_of_clinic' };
  }
  try {
    const patientId = await findOrCreatePatient({
      clinicId,
      name: (booking.patient_name as string).trim(),
      phone, // normalised above: invalid/empty → null (never stored garbage)
      email: booking.email ?? null,
    });

    const slot = booking.slot as string; // validated non-null above
    const [date, time] = parseSlot(slot);

    const created = await createBooking({
      clinicId,
      providerId: booking.provider_id as string,
      service: service.name,
      date,
      time,
      patientId,
      serviceId: service.id,
      conversationId,
      durationMinutes: service.duration_minutes ?? undefined,
      initialStatus: 'pending_confirmation',
      // UNIFIED SAVE PATH: no `timeZone` here on purpose — the availability
      // engine already emits wall-clock-as-UTC slots ("2026-09-19T09:00:00Z"
      // means 09:00 AT THE CLINIC), which is the convention the public
      // "request service" path writes and the one the dashboard
      // (`toISOString().slice(11,16)`) and booking emails (`getUTCHours()`)
      // read back. Passing `timeZone` made the SAME createBooking() store a
      // different instant (09:00 local → 06:00Z) and shifted every
      // chat-originated appointment by the UTC offset.
    });

    let googleCalendarConnected = false;
    if (googleCalendar) {
      try {
        const actualInstant = clinicLocalToInstant(date, time, timeZone ?? 'Asia/Jerusalem');
        const calendarBooking = await createGoogleCalendarBooking({
          clinic_id: clinicId,
          provider_id: booking.provider_id as string,
          clinic_name: clinicName ?? undefined,
          appointment_id: created.id,
          patient_id: patientId,
          patient_name: (booking.patient_name as string).trim(),
          patient_phone: phone ?? '',
          service: service.name,
          appointment_time: actualInstant.toISOString(),
          timezone: timeZone ?? 'Asia/Jerusalem',
          duration_minutes: service.duration_minutes ?? undefined,
          status: 'confirmed',
        });
        googleCalendarConnected = calendarBooking.calendar_connected;
        if (googleCalendarConnected) {
          await persistReceptionistSlot(clinicId, conversationId, {
            appointment_id: created.id,
            appointment_status: 'confirmed',
            scheduled_at: created.scheduled_at,
          });
        }
      } catch (calendarError) {
        const reason = calendarError instanceof Error ? calendarError.message : String(calendarError);
        await supabaseAdmin
          .from('appointments')
          .update({ status: 'cancelled' })
          .eq('clinic_id', clinicId)
          .eq('id', created.id);
        await persistReceptionistSlot(clinicId, conversationId, {
          appointment_id: null,
          appointment_status: 'google_calendar_failed',
        });
        await cancelAppointmentReminders({ clinicId, appointmentId: created.id, client: supabaseAdmin }).catch(() => undefined);
        logEvent('conversation_google_calendar_booking_failed', {
          clinic_id: clinicId,
          conversation_id: conversationId,
          appointment_id: created.id,
          error: reason,
        }, 'error');
        return { action: 'failed', reason: 'google_calendar_booking_failed' };
      }
    }

    logEvent('conversation_booking_created', {
      clinic_id: clinicId,
      conversation_id: conversationId,
      appointment_id: created.id,
      provider_id: booking.provider_id,
      service_id: service?.id ?? null,
    });
    return {
      action: 'booked',
      appointment: {
        id: created.id,
        scheduled_at: created.scheduled_at,
        status: googleCalendarConnected ? 'confirmed' : created.status,
      },
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    if (/Slot unavailable|concurrent booking/i.test(reason)) {
      return { action: 'slot_unavailable', reason };
    }
    logEvent('conversation_booking_failed', {
      clinic_id: clinicId,
      conversation_id: conversationId,
      error: reason,
    }, 'error');
    return { action: 'failed', reason };
  }
}

/** Parses a slot "YYYY-MM-DDTHH:MM:SS.000Z" (or "YYYY-MM-DDTHH:MM") into { date, time }. */
export function parseSlot(slot: string): [string, string] {
  const m = slot.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  if (m) return [m[1], m[2]];
  const parts = slot.split(' ');
  const time = parts[parts.length - 1] || '10:00';
  const date = parts.length > 1 ? parts[0] : new Date().toISOString().slice(0, 10);
  return [date, time];
}