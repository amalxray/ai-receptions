import { NextResponse } from 'next/server';
import { z } from 'zod';
import { attemptConversationBooking } from '@/lib/ai/conversationBooking';
import { buildBookingConfirmation } from '@/lib/ai/bookingConfirmation';
import { loadClinicOperatingData, loadClinicProfile, loadReceptionistConversationState, persistReceptionistSlot } from '@/lib/ai/clinicDataContext';
import { getChatBookingPolicy } from '@/lib/ai/chatBookingPolicy';
import { resolvePublicClinic } from '@/lib/services/clinics';
import { getAvailableSlots, isValidBookingPhone } from '@/lib/services/bookingService';
import { getConversationById } from '@/lib/services/conversationService';
import { saveMessage } from '@/lib/services/messageService';
import { logEvent } from '@/lib/server/logging';
import { RateLimiter, getClientId } from '@/lib/services/gateway/security/rate-limiter';
import { EXPIRED_TRIAL_MESSAGE, getClinicSubscriptionAccess } from '@/lib/subscription/access';

const requestSchema = z.object({
  clinic_slug: z.string().min(1).max(200).optional(),
  clinic_id: z.string().uuid().optional(),
  conversation_id: z.string().min(1).max(256),
  action: z.enum(['confirm', 'edit']),
  service_id: z.string().optional(),
  provider_id: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  patient_name: z.string().max(200).optional(),
  phone: z.string().max(30).optional(),
  email: z.string().trim().email().max(320).nullable().optional(),
});

const BOOKING_SUCCESS = '✅ تم تأكيد الحجز';
const BOOKING_PENDING = '\u062a\u0645 \u062a\u0633\u062c\u064a\u0644 \u0645\u0648\u0639\u062f\u0643 \u0641\u064a \u0642\u0627\u0639\u062f\u0629 \u0628\u064a\u0627\u0646\u0627\u062a \u0627\u0644\u0639\u064a\u0627\u062f\u0629 \u0648\u0647\u0648 \u0628\u0627\u0646\u062a\u0638\u0627\u0631 \u062a\u0623\u0643\u064a\u062f \u0627\u0644\u0639\u064a\u0627\u062f\u0629.';
const bookingMessage = (status?: string | null) =>
  status === 'confirmed' ? BOOKING_SUCCESS : BOOKING_PENDING;
const bookingActionLimiter = new RateLimiter(10, 60_000);

export async function POST(request: Request) {
  if (!bookingActionLimiter.isAllowed(getClientId(request))) {
    return NextResponse.json({ error: 'أرسلت طلبات كثيرة بسرعة. انتظر دقيقة ثم أعد المحاولة.' }, { status: 429 });
  }
  let clinicIdForLogging: string | null = null;
  let googleCalendarConnectedForLogging: boolean | null = null;
  try {
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: 'بيانات الطلب غير صالحة.' }, { status: 400 });

    const input = parsed.data;
    if (!input.clinic_slug && !input.clinic_id) {
      return NextResponse.json({ error: 'يجب تحديد العيادة.' }, { status: 400 });
    }
    const clinic = await resolvePublicClinic({ slug: input.clinic_slug, id: input.clinic_id });
    if (!clinic) return NextResponse.json({ error: 'العيادة غير موجودة.' }, { status: 404 });
    clinicIdForLogging = clinic.id;
    const conversation = await getConversationById(input.conversation_id, clinic.id);
    if (!conversation) return NextResponse.json({ error: 'المحادثة غير موجودة لهذه العيادة.' }, { status: 404 });

    const access = await getClinicSubscriptionAccess(clinic.id);
    if (!access.allowed) {
      return NextResponse.json({ error: EXPIRED_TRIAL_MESSAGE, expired: true }, { status: 402 });
    }

    const [state, operatingData, profile] = await Promise.all([
      loadReceptionistConversationState(clinic.id, input.conversation_id),
      loadClinicOperatingData(clinic.id),
      loadClinicProfile(clinic.id),
    ]);
    if (!state) return NextResponse.json({ error: 'تعذر تحميل بيانات الحجز.' }, { status: 500 });
    const toConfirmationCard = (appointmentId: string) => {
      const serviceId = state.booking.service_id ?? state.recommended_service_id;
      const service = operatingData.services.find((item) => item.id === serviceId);
      const slot = state.booking.slot ?? state.booking.scheduled_at ?? '';
      const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(slot);
      return {
        appointment_id: appointmentId,
        service: service?.name ?? 'موعد',
        appointment_date: match ? `${match[1]} — ${match[2]}` : slot,
        patient_name: state.booking.patient_name ?? '',
        clinic_name: clinic.name,
        clinic_phone: clinic.phone,
      };
    };
    if (state.booking.appointment_id) {
      return NextResponse.json({
        ok: true,
        appointment_id: state.booking.appointment_id,
        status: state.booking.appointment_status,
        message: bookingMessage(state.booking.appointment_status),
        confirmation: toConfirmationCard(state.booking.appointment_id),
      });
    }

    if (input.action === 'edit') {
      const serviceId = input.service_id ?? state.booking.service_id ?? state.recommended_service_id;
      const providerId = input.provider_id ?? state.booking.provider_id ?? state.recommended_provider_id;
      const date = input.date;
      const time = input.time;
      const patientName = input.patient_name?.trim() ?? state.booking.patient_name?.trim();
      const phone = input.phone?.trim() ?? state.booking.phone?.trim();
      if (!serviceId || !providerId || !date || !time || !patientName || !phone || !isValidBookingPhone(phone)) {
        return NextResponse.json({ error: 'يرجى استكمال بيانات الموعد ورقم هاتف صحيح.' }, { status: 400 });
      }
      const service = operatingData.services.find((item) => item.id === serviceId && item.active);
      const provider = operatingData.providers.find((item) => item.id === providerId);
      if (!service || !provider) return NextResponse.json({ error: 'الخدمة أو الطبيب غير متاحين في هذه العيادة.' }, { status: 400 });
      const requestedSlot = `${date}T${time}`;
      let availableSlots: string[];
      try {
        availableSlots = await getAvailableSlots(clinic.id, providerId, date, 200, serviceId);
      } catch (error) {
        logEvent('public_ai_booking_edit_availability_failed', {
          clinic_id: clinic.id,
          conversation_id: input.conversation_id,
          error: error instanceof Error ? error.message : String(error),
        }, 'warn');
        return NextResponse.json({ error: 'تعذر التحقق من هذا الاختيار. اختر طبيباً يقدم الخدمة وحاول مرة أخرى.' }, { status: 409 });
      }
      if (!availableSlots.some((slot) => slot.slice(0, 16) === requestedSlot)) {
        return NextResponse.json({ error: 'هذا الموعد لم يعد متاحاً. عدّل الوقت واختر خانة متاحة.' }, { status: 409 });
      }
      const selectedSlot = availableSlots.find((slot) => slot.slice(0, 16) === requestedSlot);
      if (!selectedSlot) return NextResponse.json({ error: 'هذا الموعد لم يعد متاحاً. اختر وقتاً آخر.' }, { status: 409 });
      await persistReceptionistSlot(clinic.id, input.conversation_id, {
        service_id: serviceId,
        provider_id: providerId,
        slot: selectedSlot,
        patient_name: patientName,
        phone,
        ...(input.email !== undefined ? { email: input.email } : {}),
        state: 'BOOKING',
        patient_confirmed_booking: false,
      });
      const updatedState = await loadReceptionistConversationState(clinic.id, input.conversation_id);
      const confirmation = buildBookingConfirmation(clinic, updatedState, operatingData);
      if (!confirmation) {
        return NextResponse.json({ error: 'تعذر حفظ التعديلات. أعد تحميل المحادثة وحاول مرة أخرى.' }, { status: 500 });
      }
      return NextResponse.json({ ok: true, booking_confirmation: confirmation });
    }

    const confirmation = buildBookingConfirmation(clinic, state, operatingData);
    if (!confirmation) return NextResponse.json({ error: 'بيانات الحجز غير مكتملة. أرسل الخدمة والطبيب والتاريخ والوقت والاسم والهاتف.' }, { status: 409 });

    await persistReceptionistSlot(clinic.id, input.conversation_id, {
      ...(input.email !== undefined ? { email: input.email } : {}),
      state: 'BOOKING',
      patient_confirmed_booking: true,
    });
    const bookingState = await loadReceptionistConversationState(clinic.id, input.conversation_id);
    if (!bookingState?.patient_confirmed_booking) {
      return NextResponse.json({ error: 'تعذر تثبيت تأكيد الحجز. حاول مرة أخرى.' }, { status: 500 });
    }

    const policy = await getChatBookingPolicy(clinic.id);
    googleCalendarConnectedForLogging = policy.createGoogleCalendarEvent;
    const result = await attemptConversationBooking({
      clinicId: clinic.id,
      conversationId: input.conversation_id,
      state: 'BOOKING',
      patientConfirmedBooking: true,
      booking: {
        ...bookingState.booking,
        service_id: bookingState.booking.service_id ?? bookingState.recommended_service_id,
        provider_id: bookingState.booking.provider_id ?? bookingState.recommended_provider_id,
      },
      operatingData,
      requirePhone: true,
      googleCalendar: policy.createGoogleCalendarEvent,
      timeZone: profile.timezone,
      initialStatus: 'confirmed',
    });

    if (result.action === 'already_booked') {
      return NextResponse.json({
        ok: true,
        message: bookingMessage(state.booking.appointment_status),
        appointment_id: result.appointment_id,
        status: state.booking.appointment_status,
        confirmation: toConfirmationCard(result.appointment_id),
      });
    }
    if (result.action === 'slot_unavailable') {
      await persistReceptionistSlot(clinic.id, input.conversation_id, { patient_confirmed_booking: false });
      return NextResponse.json({ error: 'هذا الموعد حُجز للتو. عدّل الوقت لاختيار موعد آخر.' }, { status: 409 });
    }
    if (result.action !== 'booked') {
      logEvent('public_ai_booking_action_failed', {
        clinic_id: clinic.id,
        conversation_id: input.conversation_id,
        failure_source: result.action === 'failed'
          ? result.failureSource ?? (result.reason === 'google_calendar_booking_failed' ? 'google_calendar' : 'database_or_booking')
          : result.action,
        error: result.action === 'failed' ? result.reason : result.action,
        stack: result.action === 'failed' ? result.stack ?? null : null,
        google_calendar_connected: googleCalendarConnectedForLogging,
      }, 'error');
      await persistReceptionistSlot(clinic.id, input.conversation_id, { patient_confirmed_booking: false });
      return NextResponse.json({ error: 'تعذر إتمام الحجز حالياً. يرجى المحاولة مجدداً أو التواصل مع العيادة.' }, { status: 503 });
    }

    await persistReceptionistSlot(clinic.id, input.conversation_id, {
      appointment_id: result.appointment.id,
      appointment_status: result.appointment.status,
      scheduled_at: result.appointment.scheduled_at,
      state: 'COMPLETED',
      patient_confirmed_booking: true,
    });
    const resultMessage = bookingMessage(result.appointment.status);
    try {
      await saveMessage({
        conversation_id: input.conversation_id,
        clinic_id: clinic.id,
        role: 'assistant',
        content: resultMessage,
      });
    } catch (error) {
      logEvent('public_ai_booking_confirmation_message_failed', {
        clinic_id: clinic.id,
        conversation_id: input.conversation_id,
        appointment_id: result.appointment.id,
        error: error instanceof Error ? error.message : String(error),
      }, 'error');
    }

    return NextResponse.json({
      ok: true,
      message: resultMessage,
      appointment_id: result.appointment.id,
      status: result.appointment.status,
      confirmation: {
        appointment_id: result.appointment.id,
        service: confirmation.data.service,
        appointment_date: `${confirmation.data.date} — ${confirmation.data.time}`,
        patient_name: confirmation.data.patient_name,
        clinic_name: clinic.name,
        clinic_phone: clinic.phone,
      },
    });
  } catch (error) {
    logEvent('public_ai_booking_action_error', {
      clinic_id: clinicIdForLogging,
      failure_source: googleCalendarConnectedForLogging ? 'google_calendar_or_database' : 'database_or_booking',
      google_calendar_connected: googleCalendarConnectedForLogging,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack ?? null : null,
    }, 'error');
    return NextResponse.json({ error: 'تعذر تنفيذ إجراء الحجز حالياً.' }, { status: 500 });
  }
}
