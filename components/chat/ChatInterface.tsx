'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { freshConversationState, conversationStorageKeysToPurge } from '@/lib/chat/conversationReset';
import type { BookingConfirmationData, ChatInteractive } from '@/lib/ai/chatInteractive';
import { QuickReplyChips, OptionCards } from './InteractiveReplies';
import { ChatPersonaAvatar, TypingDots } from './ChatPersona';

type ChatMessage = {
  id?: string;
  role: 'assistant' | 'user' | 'patient' | 'staff' | 'system';
  text: string;
  /** طبقة تفاعلية مشتقة خادمياً (أزرار/بطاقات/تقدّم) — على آخر رسالة مساعد فقط. */
  interactive?: ChatInteractive;
};

type Props = {
  clinicId?: string;
  initialConversationId?: string | null;
  /** Render in a full-height panel (floating widget) instead of a tall card. */
  embedded?: boolean;
  /**
   * Business activity: clinic / imaging_center / dental_lab.
   * Drives the suggested-question chips (a dental clinic must not suggest
   * "تنظيف الأسنان" questions to an imaging center). Defaults to 'clinic'.
   */
  activityType?: string | null;
  /**
   * Explicit API mode. NEVER inferred from the identifier shape (that caused
   * anonymous visitors to hit the session-protected route → 401 everywhere).
   * Public chat pages/widgets leave the default 'public'.
   */
};

const STORAGE_KEY_PREFIX = 'dentalai_chat_conv_';
const MAX_MESSAGE_LENGTH = 2000;

const ACTIVITY_QUESTIONS: Record<string, string[]> = {
  clinic: [
    'ما هي خدمات العيادة؟',
    'كم سعر تنظيف الأسنان؟',
    'أريد حجز موعد لفحص',
    'ما أوقات الدوام؟',
  ],
  imaging_center: [
    'ما هي خدمات التصوير؟',
    'كم سعر البانوراما؟',
    'كم سعر الـ CBCT؟',
    'أريد حجز تصوير بانوراما',
    'ما أوقات الدوام؟',
  ],
  dental_lab: [
    'ما هي خدمات المختبر؟',
    'كم سعر التركيبة؟',
    'أريد حجز موعد للمختبر',
    'ما أوقات الدوام؟',
  ],
};

/** Suggested questions are activity-aware — never a hard-coded dental list. */
function suggestedQuestionsFor(activity?: string | null): string[] {
  return ACTIVITY_QUESTIONS[activity ?? 'clinic'] ?? ACTIVITY_QUESTIONS.clinic;
}

export default function ChatInterface({ clinicId = '', initialConversationId = null, embedded = false, activityType = null }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [conversationId, setConversationId] = useState<string | null>(initialConversationId);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [clinicName, setClinicName] = useState<string | null>(null);
  const [assistantName, setAssistantName] = useState<string | null>(null);
  const [welcomeMessage, setWelcomeMessage] = useState<string | null>(null);
  const [showSuggested, setShowSuggested] = useState(true);
  const [aiUnavailable, setAiUnavailable] = useState(false);
  const [bookingCompleted, setBookingCompleted] = useState(false);
  const [editingBooking, setEditingBooking] = useState(false);
  const [bookingDraft, setBookingDraft] = useState<BookingConfirmationData | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastSentRef = useRef<string | null>(null);

  const isUuid = /^[0-9a-fA-F-]{36}$/.test(clinicId);
const clinicQueryField = isUuid ? 'clinic_id' : 'clinic_slug';
  const storageKey = `${STORAGE_KEY_PREFIX}${clinicId}`;

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSubmitting]);

  // Load clinic info + welcome message
  useEffect(() => {
    if (!clinicId) return;
    async function loadClinicInfo() {
      try {
        // resolvePublicClinic accepts either identifier — query with the right key
        // so dashboard-originated UUID links ALSO resolve the real clinic name.
        const query = isUuid
          ? `clinic_id=${encodeURIComponent(clinicId)}`
          : `slug=${encodeURIComponent(clinicId)}`;
        const res = await fetch(`/api/booking/clinic?${query}`);
        if (res.ok) {
          const payload = await res.json();
          setClinicName(payload?.data?.name ?? null);
        }
      } catch {
        // Non-fatal — fallback welcome below
      }
    }
    void loadClinicInfo();
  }, [clinicId, isUuid]);

  // Load conversation history on mount
  useEffect(() => {
    async function loadHistory() {
      setIsLoadingHistory(true);
      // Restore conversation_id from localStorage
      const savedConvId = localStorage.getItem(storageKey);
      const effectiveConvId = conversationId ?? savedConvId;

      if (effectiveConvId) {
        // Root-fix: visitors ALWAYS use the public route. No endpoint guessing by identifier shape.
      const base = '/api/public/ai/messages';
        const params = isUuid
          ? `conversation_id=${effectiveConvId}&clinic_id=${clinicId}`
          : `conversation_id=${effectiveConvId}&${clinicQueryField}=${encodeURIComponent(clinicId)}`;
        try {
          const response = await fetch(`${base}?${params}`);
          if (response.ok) {
            const payload = await response.json();
            setBookingCompleted(Boolean(payload?.booking_completed));
            const items = Array.isArray(payload?.data) ? payload.data : [];
            if (items.length > 0) {
              const restored = items.map((item: any) => ({
                id: item.id as string | undefined,
                role: (item.role === 'assistant' ? 'assistant' : 'user') as ChatMessage['role'],
                text: item.content as string,
                interactive: undefined as ChatInteractive | undefined,
              }));
              // الطبقة التفاعلية تُشتق خادمياً للمحادثة كاملة (أحدث خطوة معلّقة)
              // وتُرفق بآخر رسالة مساعد فقط — لا أزرار قديمة من localStorage.
              const serverInteractive = (payload?.interactive ?? null) as ChatInteractive | null;
              if (serverInteractive) {
                for (let i = restored.length - 1; i >= 0; i -= 1) {
                  if (restored[i].role === 'assistant') {
                    restored[i].interactive = serverInteractive;
                    break;
                  }
                }
              }
              setMessages(restored);
              setConversationId(effectiveConvId);
              setShowSuggested(false);
              setIsLoadingHistory(false);
              return;
            }
          }
        } catch {
          // Fall through to welcome message
        }
      }

      // No history — show welcome message
      const fallbackWelcome = clinicName
        ? `أهلًا بك في ${clinicName} 👋\nأنا ${assistantName ?? 'موظفة الاستقبال الافتراضية'}. كيف يمكنني مساعدتك؟`
        : 'أهلًا بك 👋\nأنا موظفة الاستقبال الافتراضية. كيف يمكنني مساعدتك؟';
      setMessages([{ role: 'assistant', text: welcomeMessage ?? fallbackWelcome }]);
      setShowSuggested(true);
      setIsLoadingHistory(false);
    }

    void loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinicId, isUuid]);

  // Persist conversation_id to localStorage whenever it changes
  useEffect(() => {
    if (conversationId) {
      localStorage.setItem(storageKey, conversationId);
    }
  }, [conversationId, storageKey]);

  async function handleSubmit(event: FormEvent<HTMLFormElement> | null, overrideText?: string) {
    if (event) event.preventDefault();
    if (bookingCompleted) {
      setStatusMessage('اكتمل الحجز. ابدأ محادثة جديدة إذا أردت طلباً آخر.');
      return;
    }
    const trimmed = (overrideText ?? draft).trim();

    // Empty / whitespace-only validation
    if (!trimmed) {
      setStatusMessage('يرجى كتابة رسالة قبل الإرسال.');
      return;
    }

    // Long message validation
    if (trimmed.length > MAX_MESSAGE_LENGTH) {
      setStatusMessage(`الرسالة طويلة جدًا. الحد الأقصى ${MAX_MESSAGE_LENGTH} حرفًا.`);
      return;
    }

    // Duplicate message protection
    if (lastSentRef.current === trimmed && isSubmitting) {
      return;
    }
    lastSentRef.current = trimmed;

    setMessages((current) => [...current, { role: 'user', text: trimmed }]);
    setDraft('');
    setIsSubmitting(true);
    setStatusMessage(null);
    setAiUnavailable(false);
    setShowSuggested(false);

    try {
      // Root-fix: visitors ALWAYS use the public route. No endpoint guessing by identifier shape.
      const base = '/api/public/ai/messages';
      const payloadBody = isUuid
        ? { clinic_id: clinicId, conversation_id: conversationId, text: trimmed, stream: false }
        : { [clinicQueryField]: clinicId, conversation_id: conversationId, text: trimmed, stream: false };

      const response = await fetch(base, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payloadBody),
      });

      // Parse body safely (may be non-JSON). We never blindly assume JSON.
      let payload: any = {};
      try {
        payload = await response.json();
      } catch {
        payload = { error: 'Unreadable server response' };
      }

      if (!response.ok) {
        // Log the REAL error on the client for diagnosis (not just a friendly fallback).
        console.warn('Chat AI request failed:', response.status, payload?.error ?? response.statusText);

        // Distinguish "clinic not found" from a generic AI/provider error.
        const errText = String(payload?.error ?? '').toLowerCase();
        const isClinicNotFound =
          response.status === 404 && (errText.includes('clinic not found') || errText.includes('conversation not found'));

        if (isClinicNotFound) {
          setAiUnavailable(true);
          setMessages((current) => [
            ...current,
            { role: 'assistant', text: 'لم نستطع تحديد العيادة المطلوبة. تأكد من رابط العيادة ثم أعد المحاولة.' },
          ]);
          return;
        }

        // RATE LIMITED (429): an HONEST, specific message surfaced verbatim from
        // the server. The old behavior lumped this into "المساعد غير متاح" which
        // was both untrue and drove users to retry harder into the same limit.
        if (response.status === 429) {
          const rateLimitText = String(payload?.error ?? '') || 'أرسلت رسائل كثيرة بسرعة. انتظر قليلاً ثم أعد المحاولة.';
          setMessages((current) => [...current, { role: 'assistant', text: rateLimitText }]);
          return;
        }

        // SERVER/PROVIDER FAILURE (5xx and opaque errors): the ONE case where
        // "المساعد غير متاح حاليًا" is truthful — a real upstream failure that
        // is also logged server-side (public_ai_message_error) with its cause.
        setAiUnavailable(true);
        const friendly = 'عذرًا، يبدو أن المساعد غير متاح حاليًا. يمكنك ترك رقم هاتفك وسيتواصل معك فريق العيادة.';
        setMessages((current) => [...current, { role: 'assistant', text: friendly }]);
        return;
      }

      const assistantText = payload?.assistant_message?.content ?? payload?.assistant_message ?? 'تمت معالجة الرسالة.';
      setConversationId(payload?.conversation_id ?? conversationId);
      const serverInteractive = (payload?.interactive ?? null) as ChatInteractive | null;
      setMessages((current) => [
        ...current,
        { role: 'assistant', text: assistantText, interactive: serverInteractive ?? undefined },
      ]);
    } catch (err) {
      // Network-level failure (offline / server unreachable) — DISTINCT from
      // "assistant unavailable": the browser itself could not complete the
      // request, so blaming the AI provider would be misleading.
      console.warn('[ai chat] request threw:', err);
      setAiUnavailable(true);
      setMessages((current) => [
        ...current,
        { role: 'assistant', text: 'تعذّر الاتصال بالخادم. تحقق من اتصالك بالإنترنت ثم أعد المحاولة.' },
      ]);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleBookingAction(action: 'confirm' | 'edit') {
    if (!conversationId) {
      setStatusMessage('تعذر تحديد المحادثة. أرسل رسالة أولاً ثم أعد المحاولة.');
      return;
    }
    setIsSubmitting(true);
    setStatusMessage(null);
    try {
      const requestBody = {
        ...(isUuid ? { clinic_id: clinicId } : { clinic_slug: clinicId }),
        conversation_id: conversationId,
        action,
        ...(action === 'edit' && bookingDraft ? {
          service_id: bookingDraft.service_id,
          provider_id: bookingDraft.provider_id,
          date: bookingDraft.date,
          time: bookingDraft.time,
          patient_name: bookingDraft.patient_name,
          phone: bookingDraft.phone,
        } : {}),
      };
      const response = await fetch('/api/public/ai/booking-action', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      const payload = await response.json();
      if (!response.ok) {
        setStatusMessage(payload?.error ?? 'تعذر تنفيذ الإجراء. يرجى المحاولة مرة أخرى.');
        return;
      }
      if (action === 'edit') {
        setEditingBooking(false);
        setBookingDraft(null);
        setMessages((current) => current.map((message, index) =>
          index === current.length - 1 && message.role === 'assistant'
            ? {
                ...message,
                interactive: {
                  ...message.interactive,
                  booking_confirmation: payload.booking_confirmation,
                },
              }
            : message,
        ));
      } else {
        setEditingBooking(false);
        setBookingDraft(null);
        setBookingCompleted(true);
        setMessages((current) => [
          ...current,
          { role: 'assistant', text: payload.message ?? 'تم حجز موعدك بنجاح ✅ سنرسل لك تذكيراً قبل الموعد.' },
        ]);
      }
    } catch (error) {
      console.error('[chat booking action] request failed:', error);
      setStatusMessage('تعذر الاتصال بالخادم لتنفيذ الحجز. حاول مرة أخرى.');
    } finally {
      setIsSubmitting(false);
    }
  }

  // NEW-CONVERSATION ISOLATION (root-cause fix): starts a genuinely fresh
  // conversation — new conversation_id on the next message, fresh messages,
  // fresh PatientContext/state-machine (server-side: new conversation row has
  // empty metadata), and fresh booking context. The old conversation remains
  // in the database and stays visible in the clinic dashboard history.
  const startNewConversation = useCallback(() => {
    const welcome = welcomeMessage
      ?? (clinicName ? `أهلًا بك في ${clinicName} 👋\nأنا ${assistantName ?? 'موظفة الاستقبال الافتراضية'}. كيف يمكنني مساعدتك؟` : 'أهلًا بك 👋\nأنا موظفة الاستقبال الافتراضية. كيف يمكنني مساعدتك؟');
    const fresh = freshConversationState(welcome);

    setMessages(fresh.messages);
    setConversationId(fresh.conversationId);
    setBookingCompleted(false);
    setShowSuggested(fresh.showSuggested);
    setStatusMessage(fresh.statusMessage);
    lastSentRef.current = null;

    // Purge this device's pointers (conversation id + booking context).
    // The conversation itself is NOT deleted server-side.
    try {
      for (const key of conversationStorageKeysToPurge(storageKey)) {
        localStorage.removeItem(key);
      }
    } catch {
      // localStorage unavailable (private mode) — state reset above is enough.
    }
  }, [welcomeMessage, clinicName, assistantName, storageKey]);

  // الطبقة التفاعلية لآخر رسالة مساعد فقط: شريط تقدّم لاصق + أزرار قابلة للنقر.
  // الرسائل الأقدم تبقى نصاً خالصاً — لا أزرار عتيقة.
  const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
  const lastInteractive = lastMessage?.role === 'assistant' ? lastMessage.interactive ?? null : null;
  const patientIsActive = !isSubmitting && draft.trim().length > 0;
  const receptionistIsActive = isSubmitting || (!patientIsActive && lastMessage?.role !== 'user');

  return (
    <div
      dir="rtl"
      className={`flex flex-col rounded-[2rem] border border-slate-200 bg-white text-slate-800 shadow-xl shadow-slate-900/10 ${
        embedded ? 'h-full min-h-0 w-full' : 'min-h-[40rem]'
      }`}
    >
      <div className="flex items-center justify-between gap-4 rounded-t-[2rem] border-b border-slate-100 bg-white px-5 py-4 sm:px-7">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-700">
            {assistantName ?? 'موظفة الاستقبال'} · محادثة مباشرة
          </p>
          {clinicName && <p className="mt-1 text-xs text-slate-500">{clinicName}</p>}
        </div>
        {/* New Conversation: full isolation from the previous session. */}
        {!isLoadingHistory && (
          <button
            type="button"
            onClick={startNewConversation}
            disabled={isSubmitting}
            aria-label="بدء محادثة جديدة"
            title="ابدأ محادثة جديدة — المحادثة الحالية تبقى محفوظة في السجل"
            className="shrink-0 rounded-full border border-teal-200 bg-teal-50 px-4 py-2 text-xs font-bold text-teal-800 transition hover:border-teal-400 hover:bg-teal-100 disabled:opacity-50"
          >
            + محادثة جديدة
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 border-b border-slate-100 bg-gradient-to-b from-white to-cyan-50/60 px-4 py-5 sm:gap-5 sm:px-7 sm:py-6">
        <div className={`flex min-w-0 flex-col items-center gap-2 rounded-3xl px-2 py-3 text-center transition-colors sm:gap-3 ${patientIsActive ? 'bg-cyan-50 ring-1 ring-cyan-200' : ''}`}>
          <ChatPersonaAvatar persona="patient" active={patientIsActive} />
          <span className="min-w-0">
            <span className="block text-sm font-bold text-slate-800">أنت</span>
          </span>
        </div>
        <div className={`flex min-w-0 flex-col items-center gap-2 rounded-3xl px-2 py-3 text-center transition-colors sm:gap-3 ${receptionistIsActive ? 'bg-teal-50 ring-1 ring-teal-200' : ''}`}>
          <ChatPersonaAvatar persona="receptionist" active={receptionistIsActive} />
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold text-slate-800">{assistantName ?? 'موظفة الاستقبال'}</span>
            <span className="mt-0.5 flex items-center justify-center gap-1.5 text-xs text-teal-700">
              <span className="h-1.5 w-1.5 rounded-full bg-teal-500" />
              متاحة الآن
            </span>
          </span>
        </div>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto bg-[radial-gradient(ellipse_at_top,_rgba(236,254,255,0.75),_transparent_68%)] px-4 py-5 sm:px-7 sm:py-7">
        {statusMessage ? (
          <div role="status" className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{statusMessage}</div>
        ) : null}

        {isLoadingHistory ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-teal-500" />
            جارٍ تحميل المحادثة...
          </div>
        ) : (
          <>
            {messages.map((message, index) => {
              const isReceptionist = message.role === 'assistant';
              return (
                <div
                  key={message.id ?? `${message.role}-${index}`}
                  dir="ltr"
                  className={`flex w-full items-start gap-3 sm:gap-4 ${isReceptionist ? 'justify-end' : 'justify-start'}`}
                >
                  {!isReceptionist && <ChatPersonaAvatar persona="patient" active={patientIsActive && index === messages.length - 1} size="small" />}
                  <div
                    dir="rtl"
                    className={`min-w-0 max-w-[84%] flex-1 py-1 sm:max-w-[78%] ${
                      isReceptionist ? 'border-r-2 border-teal-300 pr-3 text-right sm:pr-5' : 'border-l-2 border-cyan-300 pl-3 text-right sm:pl-5'
                    }`}
                  >
                    <p className={`mb-1 text-[11px] font-bold tracking-wide ${isReceptionist ? 'text-teal-700' : 'text-cyan-800'}`}>
                      {isReceptionist ? (assistantName ?? 'موظفة الاستقبال') : 'أنت'}
                    </p>
                    <p className="whitespace-pre-wrap text-sm leading-7 text-slate-700 sm:text-[15px]">{message.text}</p>
                    {index === messages.length - 1 && isReceptionist && message.interactive ? (
                      <>
                        {message.interactive.booking_confirmation ? (() => {
                          const booking = message.interactive!.booking_confirmation!.data;
                          const draft = bookingDraft ?? booking;
                          return (
                            <section className="mt-4 rounded-2xl border border-teal-200 bg-teal-50 p-4 text-right shadow-sm" aria-label="تأكيد تفاصيل الحجز">
                              <h3 className="mb-3 text-base font-bold text-teal-900">تأكيد تفاصيل الموعد</h3>
                              <div className="grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
                                <p><strong>العيادة:</strong> {booking.clinic}</p>
                                <label className="grid gap-1"><strong>الخدمة</strong>
                                  {editingBooking ? (
                                    <select className="rounded-lg border border-slate-300 bg-white px-2 py-2" value={draft.service_id} onChange={(event) => {
                                      const selected = booking.service_options.find((option) => option.id === event.target.value);
                                      setBookingDraft({ ...draft, service_id: event.target.value, service: selected?.name ?? draft.service });
                                    }}>
                                      {booking.service_options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
                                    </select>
                                  ) : <span>{booking.service}</span>}
                                </label>
                                <label className="grid gap-1"><strong>الطبيب</strong>
                                  {editingBooking ? (
                                    <select className="rounded-lg border border-slate-300 bg-white px-2 py-2" value={draft.provider_id} onChange={(event) => {
                                      const selected = booking.provider_options.find((option) => option.id === event.target.value);
                                      setBookingDraft({ ...draft, provider_id: event.target.value, provider: selected?.name ?? draft.provider });
                                    }}>
                                      {booking.provider_options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
                                    </select>
                                  ) : <span>{booking.provider}</span>}
                                </label>
                                <label className="grid gap-1"><strong>التاريخ</strong>
                                  {editingBooking
                                    ? <input className="rounded-lg border border-slate-300 bg-white px-2 py-2" type="date" value={draft.date} onChange={(event) => setBookingDraft({ ...draft, date: event.target.value })} />
                                    : <span>{booking.date}</span>}
                                </label>
                                <label className="grid gap-1"><strong>الساعة</strong>
                                  {editingBooking
                                    ? <input className="rounded-lg border border-slate-300 bg-white px-2 py-2" type="time" value={draft.time} onChange={(event) => setBookingDraft({ ...draft, time: event.target.value })} />
                                    : <span>{booking.time}</span>}
                                </label>
                                <label className="grid gap-1"><strong>الاسم</strong>
                                  {editingBooking
                                    ? <input className="rounded-lg border border-slate-300 bg-white px-2 py-2" value={draft.patient_name} onChange={(event) => setBookingDraft({ ...draft, patient_name: event.target.value })} />
                                    : <span>{booking.patient_name}</span>}
                                </label>
                                <label className="grid gap-1"><strong>الهاتف</strong>
                                  {editingBooking
                                    ? <input className="rounded-lg border border-slate-300 bg-white px-2 py-2" type="tel" value={draft.phone} onChange={(event) => setBookingDraft({ ...draft, phone: event.target.value })} />
                                    : <span>{booking.phone}</span>}
                                </label>
                              </div>
                              <div className="mt-4 flex flex-wrap gap-2">
                                {editingBooking ? (
                                  <>
                                    <button type="button" disabled={isSubmitting} onClick={() => { void handleBookingAction('edit'); }} className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-bold text-white hover:bg-teal-800 disabled:opacity-50">حفظ التعديلات</button>
                                    <button type="button" disabled={isSubmitting} onClick={() => { setEditingBooking(false); setBookingDraft(null); }} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">إلغاء</button>
                                  </>
                                ) : (
                                  <>
                                    <button type="button" disabled={isSubmitting} onClick={() => { void handleBookingAction('confirm'); }} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50">✅ تأكيد الحجز</button>
                                    <button type="button" disabled={isSubmitting} onClick={() => { setBookingDraft(booking); setEditingBooking(true); }} className="rounded-xl bg-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-300 disabled:opacity-50">↩️ تعديل</button>
                                  </>
                                )}
                              </div>
                            </section>
                          );
                        })() : null}
                        {!message.interactive.booking_confirmation && message.interactive.card_group && message.interactive.card_group.items.length > 0 ? (
                          <div>
                            <p className="mt-3 text-xs font-semibold text-slate-600">{message.interactive.card_group.label}</p>
                            <OptionCards
                              options={message.interactive.card_group.items.map((o) => ({
                                id: o.id,
                                title: o.title,
                                subtitle: o.subtitle,
                                meta: o.price,
                                icon: o.icon,
                                value: o.value ?? o.title,
                                disabled: o.disabled,
                              }))}
                              onSelect={(value) => { void handleSubmit(null, value); }}
                              disabled={isSubmitting}
                              columns={message.interactive?.card_group?.kind === 'time' ? 3 : 2}
                            />
                          </div>
                        ) : null}
                        {!message.interactive.booking_confirmation && message.interactive.quick_replies && message.interactive.quick_replies.length > 0 ? (
                          <QuickReplyChips
                            replies={message.interactive.quick_replies}
                            onSelect={(value) => { void handleSubmit(null, value); }}
                            disabled={isSubmitting}
                          />
                        ) : null}
                      </>
                    ) : null}
                  </div>
                  {isReceptionist && <ChatPersonaAvatar persona="receptionist" active={index === messages.length - 1 && receptionistIsActive} size="small" />}
                </div>
              );
            })}

            {isSubmitting && (
              <div dir="ltr" className="flex items-center justify-end gap-3 sm:gap-4">
                <div dir="rtl" className="flex items-center gap-2 border-r-2 border-teal-300 py-2 pr-3 text-sm text-slate-500 sm:pr-5">
                  <span>موظفة الاستقبال تكتب</span>
                  <TypingDots />
                </div>
                <ChatPersonaAvatar persona="receptionist" active size="small" />
              </div>
            )}

            {showSuggested && messages.length <= 1 && (
              <div className="mt-4 space-y-3 rounded-2xl border border-slate-100 bg-white/70 p-4 sm:p-5">
                <p className="text-xs font-bold text-slate-600">يمكنك البدء بأحد هذه الأسئلة</p>
                <div className="flex flex-wrap gap-2">
                  {suggestedQuestionsFor(activityType).map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => {
                        setDraft(q);
                        setShowSuggested(false);
                      }}
                      className="rounded-full border border-teal-100 bg-white px-3.5 py-2 text-sm text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-teal-400 hover:text-teal-800"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {aiUnavailable && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {/*
                  F5: the `<input type="tel">` that used to live here was DEAD —
                  no value/onChange/name and no submit handler, so it silently
                  discarded whatever the visitor typed. The honest instruction is
                  to type the number into the chat, which the real form below
                  (the only input wired to handleSubmit) actually sends.
                */}
                <p>يمكنك كتابة رقم هاتفك في الرسالة أدناه وسيتواصل معك فريق العيادة.</p>
              </div>
            )}

          </>
        )}
        <div ref={messagesEndRef} />
      </div>
      <form onSubmit={handleSubmit} className="rounded-b-[2rem] border-t border-slate-100 bg-white px-4 py-4 sm:px-6 sm:py-5">
        <div className="flex gap-2 sm:gap-3">
          <input
            type="text"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={bookingCompleted ? 'اكتمل الحجز — ابدأ محادثة جديدة لطلب آخر' : 'اكتب رسالة...'}
            maxLength={MAX_MESSAGE_LENGTH}
            aria-label="رسالة"
            disabled={bookingCompleted}
            className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-teal-400 focus:bg-white focus:ring-4 focus:ring-teal-500/10"
          />
          <button
            type="submit"
            disabled={bookingCompleted || isSubmitting || !draft.trim()}
            className="rounded-2xl bg-gradient-to-l from-teal-600 to-cyan-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-teal-700/15 transition hover:from-teal-500 hover:to-cyan-500 disabled:cursor-not-allowed disabled:opacity-50 sm:px-6"
          >
            {isSubmitting ? 'جارٍ الإرسال...' : 'إرسال'}
          </button>
        </div>
      </form>
    </div>
  );
}
