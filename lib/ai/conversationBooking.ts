import { supabaseAdmin } from '@/lib/supabase/admin';
import { logEvent } from '@/lib/server/logging';
import { findOrCreatePatient, createBooking, isValidBookingPhone } from '@/lib/services/bookingService';
import { clinicLocalToInstant } from '@/lib/services/clinicClock';
import { queueGoogleCalendarSync, syncGoogleCalendarAppointment } from '@/lib/services/googleCalendarSync';
import { createInAppNotification } from '@/lib/notifications/inAppNotifier';
import { tenantDashboardUrl } from '@/lib/services/dashboardPaths';
import { getClinicSlugById } from '@/lib/services/tenantAccess';
import type { ClinicOperatingData, ClinicServiceForAI } from './clinicDataContext';
import { persistReceptionistSlot } from './clinicDataContext';

/**
 * Arabic/English confirmation words (fix [4]). The state machine's
 * `patient_confirmed_booking` never fired for plain spoken Arabic ("طيب",
 * "تمام", "احجز"), so the booking never executed while the model still CLAIMED
 * it was done — the exact "fake confirmation" bug. This local gate runs on the
 * RAW user message (no LLM) as a second consent path.
 */
const AFFIRMATIVE_WORDS = new Set([
  'نعم', 'اجل', 'اي', 'اه', 'اكيد', 'اكد', 'موافق', 'موافقة', 'اوافق', 'تمام', 'حسنا',
  'احجز', 'احجزي', 'احجزلي', 'احجزيلي', 'yes', 'yep', 'yeah', 'ok', 'okay', 'sure',
  'confirm', 'confirmed', 'agree', 'agreed', 'book', 'booked',
]);
const AFFIRMATIVE_TAIL_WORDS = new Set([
  'نعم', 'اجل', 'اي', 'اه', 'اكيد', 'اكد', 'موافق', 'موافقة', 'اوافق', 'تمام', 'حسنا',
  'احجز', 'احجزي', 'احجزلي', 'احجزيلي', 'yes', 'yep', 'yeah', 'ok', 'okay', 'sure',
  'confirm', 'confirmed', 'agree', 'agreed', 'book', 'booked', 'اريد', 'لي', 'على', 'عليه',
  'ذلك', 'هذا', 'الموعد', 'الحجز', 'بالتأكيد', 'بالتاكيد', 'فضلك', 'من', 'لو', 'سمحت',
  'please', 'the', 'appointment', 'it', 'now', 'i', 'انا',
]);
const NON_AFFIRMATIVE_WORDS = new Set([
  'لا', 'مش', 'مو', 'ليس', 'لست', 'لكن', 'بس', 'but', 'however', 'no', 'not', 'انتظر',
  'استنى', 'wait', 'cancel', 'تراجع', 'الغاء', 'الغ', 'تعديل', 'غير', 'ما', 'متى', 'كيف', 'السعر',
]);

/** True when the raw message is a clear affirmative reply, not a side question. */
export function containsConfirmationWord(text: string | null | undefined): boolean {
  if (!text) return false;
  const normalized = text
    .toLowerCase()
    .normalize('NFKC')
    .replace(/\b(?:don't|doesn't|didn't|isn't|can't|won't)\b/g, 'not')
    .replace(/[\u064B-\u0652\u0670ـ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/[.,!?؟،؛:()[\]{}"“”'’]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized || /[?؟]/.test(text)) return false;

  const words = normalized.split(' ');
  if (words.some((word) => NON_AFFIRMATIVE_WORDS.has(word))) return false;
  if (words[0] === 'انا') {
    return AFFIRMATIVE_WORDS.has(words[1] ?? '') && words.slice(2).every((word) => AFFIRMATIVE_TAIL_WORDS.has(word));
  }
  if (words[0] === 'i') {
    return ['agree', 'confirm', 'book'].includes(words[1] ?? '') && words.slice(2).every((word) => AFFIRMATIVE_TAIL_WORDS.has(word));
  }
  return AFFIRMATIVE_WORDS.has(words[0]) && words.slice(1).every((word) => AFFIRMATIVE_TAIL_WORDS.has(word));
}

/**
 * Conversational booking execution — creates the appointment when the patient
 * explicitly agrees in the chat or uses the confirmation action, and every
 * required field (service, provider, patient name, phone, slot) is known.
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
  | { action: 'failed'; reason: string; failureSource?: 'database_or_booking' | 'google_calendar' | 'validation'; stack?: string };

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
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/[ى]/g, 'ي')
    .replace(/[\u064B-\u065F\u0670]/g, '')
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
  timeZone?: string | null;
  initialStatus?: 'tentative' | 'pending_confirmation' | 'confirmed';
}): Promise<BookingAttemptResult> {
  const { clinicId, conversationId, state, patientConfirmedBooking, booking, operatingData, serviceNameHint, requirePhone = false, googleCalendar = false, timeZone, initialStatus = 'pending_confirmation' } = params;

  if (!['BOOKING', 'AWAITING_BOOKING_CONFIRMATION'].includes(state) || !patientConfirmedBooking) {
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
    return { action: 'failed', reason: 'recommendation_out_of_clinic', failureSource: 'validation' };
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
      initialStatus,
      // UNIFIED SAVE PATH: no `timeZone` here on purpose — the availability
      // engine already emits wall-clock-as-UTC slots ("2026-09-19T09:00:00Z"
      // means 09:00 AT THE CLINIC), which is the convention the public
      // "request service" path writes and the one the dashboard
      // (`toISOString().slice(11,16)`) and booking emails (`getUTCHours()`)
      // read back. Passing `timeZone` made the SAME createBooking() store a
      // different instant (09:00 local → 06:00Z) and shifted every
      // chat-originated appointment by the UTC offset.
    });

    if (googleCalendar) {
      const appointmentTime = clinicLocalToInstant(date, time, timeZone ?? 'Asia/Jerusalem').toISOString();
      try {
        await queueGoogleCalendarSync(created.id, clinicId, appointmentTime);
      } catch (err) {
        logEvent('conversation_google_calendar_queue_failed', {
          clinic_id: clinicId,
          conversation_id: conversationId,
          appointment_id: created.id,
          error: err instanceof Error ? err.message : String(err),
        }, 'error');
      }
      void syncGoogleCalendarAppointment(created.id).catch((err) => {
        logEvent('conversation_google_calendar_sync_failed', {
          clinic_id: clinicId,
          conversation_id: conversationId,
          appointment_id: created.id,
          error: err instanceof Error ? err.message : String(err),
        }, 'error');
      });
    }

    // Persist the booking in the conversation state regardless of Google Calendar sync result.
    // The DB appointment is the source of truth.
    await persistReceptionistSlot(clinicId, conversationId, {
      appointment_id: created.id,
      appointment_status: created.status,
      scheduled_at: created.scheduled_at,
    });

    try {
      const clinicSlug = await getClinicSlugById(clinicId);
      await createInAppNotification({
        clinicId,
        patientId,
        appointmentId: created.id,
        event: 'appointment_new',
        title: '\u062d\u062c\u0632 \u0645\u0648\u0639\u062f \u062c\u062f\u064a\u062f',
        body: `\u062a\u0645 \u062a\u0633\u062c\u064a\u0644 \u0645\u0648\u0639\u062f \u062c\u062f\u064a\u062f \u0644\u0644\u0645\u0631\u064a\u0636 ${(booking.patient_name as string).trim()} \u0628\u062a\u0627\u0631\u064a\u062e ${date} \u0627\u0644\u0633\u0627\u0639\u0629 ${time} (${service.name}).`,
        link: tenantDashboardUrl(clinicSlug ?? clinicId, 'appointments'),
      });
    } catch (error) {
      logEvent('conversation_booking_notification_failed', {
        clinic_id: clinicId,
        conversation_id: conversationId,
        appointment_id: created.id,
        error: error instanceof Error ? error.message : String(error),
      }, 'warn');
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
        status: created.status,
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
      stack: err instanceof Error ? err.stack ?? null : null,
    }, 'error');
    return { action: 'failed', reason, failureSource: 'database_or_booking', stack: err instanceof Error ? err.stack : undefined };
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
