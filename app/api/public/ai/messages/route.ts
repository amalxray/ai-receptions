import { NextResponse } from 'next/server';
import { z } from 'zod';
import { resolvePublicClinic } from '@/lib/services/clinics';
import { createConversation, getConversationById } from '@/lib/services/conversationService';
import { receivePatientMessage } from '@/lib/services/messageService';
import { getSupabaseEnvConfig } from '@/lib/config';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { RateLimiter, getClientId } from '@/lib/services/gateway/security/rate-limiter';
import { logEvent } from '@/lib/server/logging';
import { buildPendingBookingContext } from '@/lib/ai/bookingContextBridge';
import { buildChatInteractive } from '@/lib/ai/chatInteractive';
import { buildBookingConfirmation } from '@/lib/ai/bookingConfirmation';
import { containsConfirmationWord, attemptConversationBooking } from '@/lib/ai/conversationBooking';
import { getChatBookingPolicy } from '@/lib/ai/chatBookingPolicy';
import { loadClinicOperatingData, loadClinicProfile, loadReceptionistConversationState, type ClinicOperatingData, type ReceptionistConversationState } from '@/lib/ai/clinicDataContext';
import { saveMessage } from '@/lib/services/messageService';
import { createInAppNotification } from '@/lib/notifications/inAppNotifier';
import { tenantDashboardUrl } from '@/lib/services/dashboardPaths';
import { EXPIRED_TRIAL_MESSAGE, getClinicSubscriptionAccess } from '@/lib/subscription/access';

// AI generation on the Free Tier can legitimately take 10–30s (measured up to
// 25s); the platform default (~10s on serverless) was cutting successful
// generations short.
export const maxDuration = 60;

const bodySchema = z.object({
  clinic_slug: z.string().min(1).max(200).optional(),
  clinic_id: z.string().uuid().optional(),
  conversation_id: z.string().min(1).max(256).optional().nullable(),
  text: z.string().min(1).max(4096),
  stream: z.boolean().optional().default(false),
});

// Abuse protection for a public, AI-cost-bearing endpoint. Defaults preserved
// (10 messages / minute / IP); tunable via env without code changes.
function positiveEnvInt(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}
const POST_RATE_MAX = positiveEnvInt('PUBLIC_AI_RATE_LIMIT_MAX', 10);
const POST_RATE_WINDOW_MS = positiveEnvInt('PUBLIC_AI_RATE_LIMIT_WINDOW_MS', 60_000);
const POST_RATE_WINDOW_SECONDS = Math.ceil(POST_RATE_WINDOW_MS / 1000);
const postLimiter = new RateLimiter(POST_RATE_MAX, POST_RATE_WINDOW_MS);
// History reads are cheap DB queries but still public: 30 / minute / IP.
const getLimiter = new RateLimiter(30, 60_000);
const SOURCE_CITATION_PATTERN = /\[Source:[^\]]+\]/g;
const CHAT_BOOKING_PENDING_MESSAGE = '\u062a\u0645 \u062a\u0633\u062c\u064a\u0644 \u0645\u0648\u0639\u062f\u0643 \u0641\u064a \u0642\u0627\u0639\u062f\u0629 \u0628\u064a\u0627\u0646\u0627\u062a \u0627\u0644\u0639\u064a\u0627\u062f\u0629 \u0648\u0647\u0648 \u0628\u0627\u0646\u062a\u0638\u0627\u0631 \u062a\u0623\u0643\u064a\u062f \u0627\u0644\u0639\u064a\u0627\u062f\u0629.';

function buildBookingReceipt(
  clinic: { name: string; phone: string | null },
  state: ReceptionistConversationState | null,
  operatingData: ClinicOperatingData,
) {
  const appointmentId = state?.booking.appointment_id;
  if (!appointmentId || !state) return null;
  const serviceId = state.booking.service_id ?? state.recommended_service_id;
  const service = operatingData.services.find((item) => item.id === serviceId)?.name ?? 'موعد';
  const slot = state.booking.slot ?? state.booking.scheduled_at ?? '';
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(slot);
  return {
    appointment_id: appointmentId,
    service,
    appointment_date: match ? `${match[1]} — ${match[2]}` : slot,
    patient_name: state.booking.patient_name ?? '',
    clinic_name: clinic.name,
    clinic_phone: clinic.phone,
  };
}

function stripSourceCitations(content: string): string {
  return content.replace(SOURCE_CITATION_PATTERN, '').replace(/[ \t]{2,}/g, ' ').trim();
}

async function persistFinalAssistantReply(
  clinicId: string,
  conversationId: string,
  assistant: { id?: string | null; content?: string | null },
  content: string,
) {
  if (assistant.id) {
    if (assistant.content === content) return;
    const { error } = await supabaseAdmin
      .from('messages')
      .update({ content })
      .eq('id', assistant.id)
      .eq('conversation_id', conversationId)
      .eq('clinic_id', clinicId)
      .eq('role', 'assistant');
    if (error) {
      logEvent('public_ai_final_assistant_reply_update_failed', {
        clinic_id: clinicId,
        conversation_id: conversationId,
        message_id: assistant.id,
        error: error.message,
      }, 'error');
    }
    return;
  }

  try {
    await saveMessage({
      conversation_id: conversationId,
      clinic_id: clinicId,
      role: 'assistant',
      content,
    });
  } catch (error) {
    logEvent('public_ai_final_assistant_reply_insert_failed', {
      clinic_id: clinicId,
      conversation_id: conversationId,
      error: error instanceof Error ? error.message : String(error),
    }, 'error');
  }
}

export async function POST(req: Request) {
  if (!postLimiter.isAllowed(getClientId(req))) {
    logEvent('public_ai_rate_limited', { route: 'POST /api/public/ai/messages' });
    // Honest 429: Arabic reason the frontend surfaces verbatim + standard
    // Retry-After so well-behaved clients back off instead of hammering.
    return new NextResponse(
      JSON.stringify({ error: 'لقد أرسلت رسائل كثيرة بسرعة. انتظر نحو دقيقة ثم أعد المحاولة.' }),
      {
        status: 429,
        headers: {
          'content-type': 'application/json',
          'Retry-After': String(POST_RATE_WINDOW_SECONDS),
        },
      },
    );
  }
  try {
    const parsedBody = await req.json();
    const parsed = bodySchema.safeParse(parsedBody);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    const config = getSupabaseEnvConfig();
    if (!config.isConfigured) {
      return NextResponse.json({ error: 'AI runtime not configured' }, { status: 503 });
    }

    const { clinic_slug, clinic_id, conversation_id, text } = parsed.data;
    const clinic = await resolvePublicClinic({ id: clinic_id, slug: clinic_slug });
    if (!clinic) return NextResponse.json({ error: 'Clinic not found' }, { status: 404 });

    const access = await getClinicSubscriptionAccess(clinic.id);
    if (!access.allowed) {
      return NextResponse.json({ error: EXPIRED_TRIAL_MESSAGE, expired: true }, { status: 402 });
    }

    let convId = conversation_id || null;
    if (convId) {
      try {
        const conv = await getConversationById(convId, clinic.id);
        if (!conv) return NextResponse.json({ error: 'Conversation not found for this clinic' }, { status: 404 });
      } catch (e) {
        return NextResponse.json({ error: 'Conversation not found for this clinic' }, { status: 404 });
      }
    } else {
      const conv = await createConversation({ clinic_id: clinic.id, session_id: `public:${Date.now()}` });
      convId = conv.id;
    }

    const completeTurn = async (onToken?: (chunk: string) => void) => {
      const { userMessage, assistantMessage } = await receivePatientMessage({
        clinicId: clinic.id,
        conversationId: convId,
        userId: null,
        text,
        onToken,
      });
      void createInAppNotification({
        clinicId: clinic.id,
        event: 'message_new',
        title: 'رسالة جديدة من مريض',
        body: text.slice(0, 140),
        // B20 — `/dashboard/{clinic_id}/chat` never existed as a tenant module and
        // carried a clinic id instead of the slug. The real surface is the
        // conversations module, deep-linked to this conversation.
        link: `${tenantDashboardUrl(clinic.slug, 'conversations')}/${encodeURIComponent(convId)}`,
      });

    // AI-outage fallback: the orchestrator persists a safe reply + marks handoff.
    // Never render an undefined message to the patient.
    const safeAssistant = assistantMessage ?? {
      id: '', role: 'assistant', content: 'عذراً، حدثت مشكلة مؤقتة. سيتابع فريق العيادة معك قريباً.', created_at: new Date().toISOString(),
    };
    let updatedConversation = await getConversationById(convId, clinic.id);
    let metadata = (updatedConversation as any)?.metadata ?? {};
    let conversationState = (updatedConversation as any)?.conversation_state ?? null;
    // STEP 7: canonical booking projection derived from one source. The UI
    // reflects only these server-verified fields (service/provider ids from
    // operating data, and slot from real availability) — never invents.
    // STEP 10C: suppress entirely once the conversation is handed off to staff.
    let [receptionState, operatingData] = await Promise.all([
      loadReceptionistConversationState(clinic.id, convId),
      loadClinicOperatingData(clinic.id),
    ]);
    let confirmedByMessage = false;
    let bookingAttemptResult: Awaited<ReturnType<typeof attemptConversationBooking>> | null = null;
    if (
      metadata.handoff !== true &&
      receptionState &&
      ['BOOKING', 'AWAITING_BOOKING_CONFIRMATION'].includes(receptionState.state) &&
      !receptionState.booking.appointment_id &&
      containsConfirmationWord(text) &&
      (receptionState.booking.service_id ?? receptionState.recommended_service_id) &&
      (receptionState.booking.provider_id ?? receptionState.recommended_provider_id) &&
      receptionState.booking.slot &&
      receptionState.booking.patient_name?.trim() &&
      receptionState.booking.phone?.trim()
    ) {
      let googleCalendar = false;
      try {
        googleCalendar = (await getChatBookingPolicy(clinic.id)).createGoogleCalendarEvent;
      } catch (error) {
        logEvent('public_ai_booking_policy_failed', {
          clinic_id: clinic.id,
          conversation_id: convId,
          error: error instanceof Error ? error.message : String(error),
        }, 'warn');
      }
      const profile = await loadClinicProfile(clinic.id);
      const attempt = await attemptConversationBooking({
        clinicId: clinic.id,
        conversationId: convId,
        // A clear affirmative in either active booking stage is consent. The
        // booking service still validates all fields and rechecks the slot.
        state: 'BOOKING',
        patientConfirmedBooking: true,
        booking: {
          ...receptionState.booking,
          service_id: receptionState.booking.service_id ?? receptionState.recommended_service_id,
          provider_id: receptionState.booking.provider_id ?? receptionState.recommended_provider_id,
        },
        operatingData,
        requirePhone: true,
        googleCalendar,
        timeZone: profile.timezone,
      });
      bookingAttemptResult = attempt;
      if (attempt.action === 'booked' || attempt.action === 'already_booked') {
        confirmedByMessage = true;
        updatedConversation = await getConversationById(convId, clinic.id);
        metadata = (updatedConversation as any)?.metadata ?? {};
        conversationState = (updatedConversation as any)?.conversation_state ?? null;
        [receptionState, operatingData] = await Promise.all([
          loadReceptionistConversationState(clinic.id, convId),
          loadClinicOperatingData(clinic.id),
        ]);
      }
    }
    const bookingContext = buildPendingBookingContext(metadata, { conversationState });
    const bookingConfirmation = metadata.handoff === true
      ? null
      : buildBookingConfirmation(clinic, receptionState, operatingData);
    const assistantContent = String(safeAssistant.content ?? '');
    const hasCompleteBookingDetails = Boolean(
      receptionState &&
      (receptionState.booking.service_id ?? receptionState.recommended_service_id) &&
      (receptionState.booking.provider_id ?? receptionState.recommended_provider_id) &&
      receptionState.booking.slot &&
      receptionState.booking.patient_name?.trim() &&
      receptionState.booking.phone?.trim()
    );
    const hasUnverifiedBookingClaim = !receptionState?.booking.appointment_id &&
      (/\[BOOKING_SAVED\b/i.test(assistantContent) ||
        /(?:تم|قمنا)\s+(?:ب)?(?:حجز|تثبيت|تأكيد)\s+(?:موعدك|حجزك|الحجز)/.test(assistantContent) ||
        /(?:لقد\s+)?(?:تم|جرى)\s+(?:تثبيت|تأكيد)\s+(?:موعدك|حجزك|الحجز)/.test(assistantContent));
    const bookingDetailsPending = !metadata.handoff &&
      receptionState?.state === 'BOOKING' &&
      Boolean(receptionState.booking.slot) &&
      !receptionState.booking.appointment_id;
    const responseAssistant = confirmedByMessage
      ? { ...safeAssistant, content: CHAT_BOOKING_PENDING_MESSAGE }
      : bookingAttemptResult?.action === 'slot_unavailable'
        ? { ...safeAssistant, content: 'لم يعد هذا الموعد متاحًا، لذلك لم يتم إنشاء الحجز. اختر وقتًا آخر من المواعيد المتاحة.' }
      : bookingAttemptResult?.action === 'failed'
        ? { ...safeAssistant, content: 'تعذر إنشاء الحجز الآن، ولم يتم تسجيل الموعد. حاول اختيار موعد متاح آخر أو تواصل مع الاستقبال.' }
      : bookingConfirmation
      ? { ...safeAssistant, content: 'تفاصيل الموعد جاهزة. أرسل «نعم» لإنشاء الحجز، أو عدّل أي معلومة من البطاقة.' }
      : hasCompleteBookingDetails && !metadata.handoff
        ? { ...safeAssistant, content: 'تعذر تجهيز بطاقة تأكيد الموعد حالياً، ولم يتم إنشاء الحجز. يرجى المحاولة مرة أخرى أو التواصل مع الاستقبال.' }
      : bookingDetailsPending && !receptionState.booking.patient_name?.trim()
        ? { ...safeAssistant, content: 'ما الاسم الكامل للمريض/ة؟' }
      : bookingDetailsPending && !receptionState.booking.phone?.trim()
        ? { ...safeAssistant, content: 'ما رقم الهاتف للتواصل؟' }
      : hasUnverifiedBookingClaim
        ? { ...safeAssistant, content: 'لم يتم إنشاء الحجز بعد. أكمل البيانات المطلوبة، ثم أرسل «نعم» للموافقة على تسجيل الموعد.' }
        : safeAssistant;
    responseAssistant.content = stripSourceCitations(String(responseAssistant.content ?? ''));
    await persistFinalAssistantReply(clinic.id, convId, safeAssistant, responseAssistant.content);
      return {
        conversation_id: convId,
        user_message: userMessage,
        assistant_message: responseAssistant,
        booking_context: bookingContext,
        booking_completed: Boolean(receptionState?.booking.appointment_id),
        booking_confirmation_result: confirmedByMessage
          ? buildBookingReceipt(clinic, receptionState, operatingData)
          : null,
        // الردود التفاعلية (أزرار سريعة + بطاقات + مؤشر تقدّم) — مشتقة من
        // الحالة الخادمية فقط: slot محقَّق من التوفر + نية الحجز في metadata.
        interactive: buildChatInteractive({
          bookingContext,
          conversationState: { state: conversationState },
          metadata,
          bookingConfirmation,
        }),
      };
    };

    if (parsed.data.stream) {
      const encoder = new TextEncoder();
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          const write = (event: Record<string, unknown>) => {
            try {
              controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
              return true;
            } catch {
              return false;
            }
          };
          let emittedToken = false;
          void completeTurn((chunk) => {
            if (!chunk) return;
            emittedToken = true;
            write({ type: 'token', text: chunk });
          }).then((payload) => {
            const finalText = String(payload.assistant_message?.content ?? '');
            // Safe deterministic replies (e.g. handoff or missing clinic data)
            // do not pass through a model stream, so still deliver them as one chunk.
            if (!emittedToken && finalText) write({ type: 'token', text: finalText });
            write({ type: 'done', payload });
            controller.close();
          }).catch((err) => {
            const message = err instanceof Error ? err.message : String(err);
            logEvent('public_ai_message_error', { error: message, streaming: true }, 'error');
            write({ type: 'error', message: 'حدث خطأ غير متوقع. حاول مرة أخرى.' });
            controller.close();
          });
        },
      });
      return new Response(body, {
        headers: {
          'content-type': 'application/x-ndjson; charset=utf-8',
          'cache-control': 'no-cache, no-transform',
          'x-accel-buffering': 'no',
        },
      });
    }

    return NextResponse.json(await completeTurn());
  } catch (err: any) {
    const message = err instanceof Error ? err.message : String(err);
    logEvent('public_ai_message_error', { error: message }, 'error');
    return NextResponse.json({ error: 'حدث خطأ غير متوقع. حاول مرة أخرى.' }, { status: 500 });
  }
}

export async function GET(req: Request) {
  if (!getLimiter.isAllowed(getClientId(req))) {
    return NextResponse.json({ error: 'Too many requests. Please slow down.' }, { status: 429 });
  }
  try {
    const url = new URL(req.url);
    const convId = url.searchParams.get('conversation_id');
    const clinicSlug = url.searchParams.get('clinic_slug');
    const clinicId = url.searchParams.get('clinic_id');
    if (!convId || (!clinicSlug && !clinicId)) {
      return NextResponse.json({ error: 'conversation_id and clinic identifier required' }, { status: 400 });
    }
    const clinic = await resolvePublicClinic({ id: clinicId ?? undefined, slug: clinicSlug ?? undefined });
    if (!clinic) return NextResponse.json({ error: 'Clinic not found' }, { status: 404 });

    // Verify the conversation belongs to this clinic (IDOR protection)
    try {
      const conv = await getConversationById(convId, clinic.id);
      if (!conv) return NextResponse.json({ error: 'Conversation not found for this clinic' }, { status: 404 });
    } catch {
      return NextResponse.json({ error: 'Conversation not found for this clinic' }, { status: 404 });
    }

    const access = await getClinicSubscriptionAccess(clinic.id);
    if (!access.allowed) {
      return NextResponse.json({ error: EXPIRED_TRIAL_MESSAGE, expired: true }, { status: 402 });
    }

    // Load real message history for this conversation
    const { data: messages, error } = await supabaseAdmin
      .from('messages')
      .select('id, role, content, created_at')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true });

    if (error) {
      return NextResponse.json({ error: 'Failed to load conversation history' }, { status: 500 });
    }

    // STEP 7: also restore the canonical pending-booking projection so a reload
    // reflects the server state (reviewer UI keeps service/provider/slot/patient
    // unless the user changes them) instead of empty stale localStorage.
    const conv = await getConversationById(convId, clinic.id);
    const metadata = (conv as any)?.metadata ?? {};
    const conversationState = (conv as any)?.conversation_state ?? null;
    const bookingContext = buildPendingBookingContext(metadata, { conversationState });
    const [receptionState, operatingData] = await Promise.all([
      loadReceptionistConversationState(clinic.id, convId),
      loadClinicOperatingData(clinic.id),
    ]);
    const bookingConfirmation = metadata.handoff === true
      ? null
      : buildBookingConfirmation(clinic, receptionState, operatingData);
    const bookingConfirmationResult = metadata.handoff === true
      ? null
      : buildBookingReceipt(clinic, receptionState, operatingData);
    const bookingDetailsPending = metadata.handoff !== true &&
      receptionState?.state === 'BOOKING' &&
      Boolean(receptionState.booking.slot) &&
      !receptionState.booking.appointment_id;
    const hasCompleteBookingDetails = Boolean(
      receptionState &&
      (receptionState.booking.service_id ?? receptionState.recommended_service_id) &&
      (receptionState.booking.provider_id ?? receptionState.recommended_provider_id) &&
      receptionState.booking.slot &&
      receptionState.booking.patient_name?.trim() &&
      receptionState.booking.phone?.trim()
    );
    if (bookingConfirmation || bookingDetailsPending || hasCompleteBookingDetails) {
      for (let index = (messages ?? []).length - 1; index >= 0; index -= 1) {
        if (messages[index].role === 'assistant') {
          messages[index].content = bookingConfirmation
            ? 'راجعي تفاصيل الموعد في البطاقة. أرسلي «نعم» لإنشاء الحجز، أو عدّلي أي معلومة قبل المتابعة.'
            : hasCompleteBookingDetails
              ? 'تعذر تجهيز بطاقة تأكيد الموعد حالياً، ولم يتم إنشاء الحجز. يرجى المحاولة مرة أخرى أو التواصل مع الاستقبال.'
              : !receptionState?.booking.patient_name?.trim()
                ? 'ما الاسم الكامل للمريض/ة؟'
                : 'ما رقم الهاتف للتواصل؟';
          break;
        }
      }
    }
    for (const message of messages ?? []) {
      if (message.role === 'assistant' && typeof message.content === 'string') {
        message.content = stripSourceCitations(message.content);
      }
    }
    return NextResponse.json({
      data: messages ?? [],
      // STEP 10C: suppress pending-booking projection for staff-handoff conversations.
      booking_context: bookingContext,
      booking_completed: Boolean(receptionState?.booking.appointment_id),
      booking_confirmation_result: bookingConfirmationResult,
      // نفس الحمولة التفاعلية بعد إعادة التحميل — تُشتق من الخادم لا من localStorage.
      interactive: buildChatInteractive({
        bookingContext,
        conversationState: { state: conversationState },
        metadata,
        bookingConfirmation,
      }),
    });
  } catch (err: any) {
    const message = err instanceof Error ? err.message : String(err);
    logEvent('public_ai_history_error', { error: message }, 'error');
    return NextResponse.json({ error: 'تعذر تحميل سجل المحادثة. حاول مرة أخرى.' }, { status: 500 });
  }
}
