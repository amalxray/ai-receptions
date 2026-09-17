'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { freshConversationState, conversationStorageKeysToPurge } from '@/lib/chat/conversationReset';
import type { ChatInteractive } from '@/lib/ai/chatInteractive';
import { QuickReplyChips, OptionCards, BookingProgress } from './InteractiveReplies';

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

  return (
    <div
      className={`flex flex-col rounded-[2rem] border border-slate-800 bg-slate-900/80 shadow-xl shadow-slate-950/30 ${
        embedded ? 'h-full w-full' : 'min-h-[40rem]'
      }`}
    >
      <div className="flex items-start justify-between rounded-t-[2rem] bg-slate-950/90 px-6 py-5">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-300/80">
            {assistantName ? `${assistantName} — ` : ''}محادثة AI
          </p>
          {clinicName && <p className="mt-1 text-xs text-slate-400">{clinicName}</p>}
        </div>
        {/* New Conversation: full isolation from the previous session. */}
        {!isLoadingHistory && (
          <button
            type="button"
            onClick={startNewConversation}
            disabled={isSubmitting}
            aria-label="بدء محادثة جديدة"
            title="ابدأ محادثة جديدة — المحادثة الحالية تبقى محفوظة في السجل"
            className="shrink-0 rounded-full border border-slate-700 bg-slate-900 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-cyan-500/70 hover:text-white disabled:opacity-50"
          >
            + محادثة جديدة
          </button>
        )}
      </div>
      {lastInteractive?.progress?.length ? <BookingProgress steps={lastInteractive.progress} /> : null}
      <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
        {statusMessage ? (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">{statusMessage}</div>
        ) : null}

        {isLoadingHistory ? (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-600 border-t-cyan-400" />
            جارٍ تحميل المحادثة...
          </div>
        ) : (
          <>
            {messages.map((message, index) => (
              <div
                key={message.id ?? `${message.role}-${index}`}
                className={`rounded-3xl px-5 py-4 ${
                  message.role === 'assistant'
                    ? 'bg-slate-950 text-slate-200'
                    : 'bg-cyan-500/10 text-cyan-200 self-end'
                }`}
              >
                <p className="text-sm leading-6 whitespace-pre-wrap">{message.text}</p>
                {index === messages.length - 1 && message.role === 'assistant' && message.interactive ? (
                  <>
                    {message.interactive.card_group && message.interactive.card_group.items.length > 0 ? (
                      <div>
                        <p className="mt-3 text-xs font-semibold text-slate-300">{message.interactive.card_group.label}</p>
                        <OptionCards
                          options={message.interactive.card_group.items.map((o) => ({
                            id: o.id,
                            title: o.title,
                            subtitle: o.subtitle,
                            meta: o.price,
                            icon: o.icon,
                            value: o.value ?? o.title,
                          }))}
                          onSelect={(value) => { void handleSubmit(null, value); }}
                          disabled={isSubmitting}
                          columns={message.interactive?.card_group?.kind === 'time' ? 3 : 2}
                        />
                      </div>
                    ) : null}
                    {message.interactive.quick_replies && message.interactive.quick_replies.length > 0 ? (
                      <QuickReplyChips
                        replies={message.interactive.quick_replies}
                        onSelect={(value) => { void handleSubmit(null, value); }}
                        disabled={isSubmitting}
                      />
                    ) : null}
                  </>
                ) : null}
              </div>
            ))}

            {isSubmitting && (
              <div className="flex items-center gap-2 rounded-3xl bg-slate-950 px-5 py-4 text-sm text-slate-400">
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-600 border-t-cyan-400" />
                جارٍ الكتابة...
              </div>
            )}

            {showSuggested && messages.length <= 1 && (
              <div className="mt-2 space-y-2">
                <p className="text-xs text-slate-500">أسئلة مقترحة:</p>
                <div className="flex flex-wrap gap-2">
                  {suggestedQuestionsFor(activityType).map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => {
                        setDraft(q);
                        setShowSuggested(false);
                      }}
                      className="rounded-full border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-200 transition hover:border-cyan-500/70 hover:text-white"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {aiUnavailable && (
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
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
      <form onSubmit={handleSubmit} className="rounded-b-[2rem] border-t border-slate-800 bg-slate-950/90 px-6 py-5">
        <div className="flex gap-3">
          <input
            type="text"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="اكتب رسالة..."
            maxLength={MAX_MESSAGE_LENGTH}
            aria-label="رسالة"
            className="min-w-0 flex-1 rounded-full border border-slate-800 bg-slate-900 px-4 py-3 text-slate-100 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
          />
          <button
            type="submit"
            disabled={isSubmitting || !draft.trim()}
            className="rounded-full bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? 'جارٍ الإرسال...' : 'إرسال'}
          </button>
        </div>
      </form>
    </div>
  );
}
