'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

type SalesMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  action?: { label: string; href: string };
};

const WELCOME_MESSAGE = 'أهلاً بك في AI-Receptions. كيف يمكنني مساعدتك في تطوير عيادتك اليوم؟';
const QUICK_PROMPTS = [
  { icon: '💰', label: 'كم تكلفة الاشتراك؟', value: 'كم تكلفة الاشتراك؟' },
  { icon: '🚀', label: 'أريد تجربة مجانية', value: 'أريد تجربة مجانية' },
  { icon: '📊', label: 'ما هي المميزات؟', value: 'ما هي المميزات؟' },
  { icon: '📈', label: 'كيف ستجلب لي مرضى؟', value: 'كيف ستجلب لي مرضى؟' },
];

function makeMessageId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function SalesChatWidget() {
  const [open, setOpen] = useState(false);
  const [showTeaser, setShowTeaser] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showQuickOptions, setShowQuickOptions] = useState(true);
  const [messages, setMessages] = useState<SalesMessage[]>([
    { id: 'welcome', role: 'assistant', content: WELCOME_MESSAGE },
  ]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, open]);

  useEffect(() => {
    if (open) {
      setShowTeaser(false);
      return;
    }
    if (window.sessionStorage.getItem('sales-chat-teaser-shown')) return;

    const showTimer = window.setTimeout(() => {
      window.sessionStorage.setItem('sales-chat-teaser-shown', 'true');
      setShowTeaser(true);
    }, 4000);
    const hideTimer = window.setTimeout(() => setShowTeaser(false), 14000);

    return () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(hideTimer);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  async function sendMessage(rawMessage: string) {
    const content = rawMessage.trim();
    if (!content || loading) return;

    const userMessage: SalesMessage = { id: makeMessageId(), role: 'user', content };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput('');
    setShowQuickOptions(false);
    setLoading(true);

    try {
      const response = await fetch('/api/public/ai/sales-bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextMessages.map(({ role, content: messageContent }) => ({ role, content: messageContent })),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? 'تعذّر الاتصال بالمستشارة');

      setMessages((current) => [
        ...current,
        {
          id: makeMessageId(),
          role: 'assistant',
          content: payload.message ?? 'يسعدني مساعدتك. ابدأ الآن من /register.',
          action: payload.cta ?? (payload.redirectTo ? { label: 'افتح /ask', href: payload.redirectTo } : undefined),
        },
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: makeMessageId(),
          role: 'assistant',
          content: error instanceof Error ? error.message : 'تعذّر الاتصال بالمستشارة الآن. جرّبي مرة أخرى.',
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(input);
  }

  return (
    <>
      <style jsx global>{`
        @keyframes sales-chat-glow {
          0%, 100% { filter: drop-shadow(0 10px 22px rgba(79, 70, 229, 0.14)); }
          50% { filter: drop-shadow(0 14px 28px rgba(79, 70, 229, 0.3)); }
        }
        @keyframes sales-chat-shimmer {
          0% { transform: translateX(120%); }
          100% { transform: translateX(-120%); }
        }
      `}</style>

      <AnimatePresence>
        {!open && (
          <div className="fixed bottom-20 left-4 z-[60] sm:bottom-6 sm:left-6">
            <AnimatePresence>
              {showTeaser && (
                <motion.div
                  aria-label="رسالة من مستشارة النمو"
                  className="absolute bottom-full right-0 mb-3 flex max-w-[min(30rem,calc(100vw-2rem))] items-start gap-4 rounded-2xl border border-slate-700 bg-slate-900 px-6 py-5 text-right text-lg leading-7 text-white shadow-2xl shadow-slate-950/50"
                  initial={{ opacity: 0, y: 8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.96 }}
                >
                  <button
                    type="button"
                    onClick={() => setOpen(true)}
                    className="flex-1"
                  >
                    هل ترغب في تنمية عيادتك؟ أنا هنا لمساعدتك.
                  </button>
                  <button
                    type="button"
                    aria-label="إخفاء الرسالة"
                    onClick={() => setShowTeaser(false)}
                    className="text-xl text-slate-400 transition hover:text-white"
                  >
                    ×
                  </button>
                  <span
                    aria-hidden="true"
                    className="absolute -bottom-2 right-16 h-4 w-4 rotate-45 rounded-br border-b border-r border-slate-700 bg-slate-900"
                  />
                </motion.div>
              )}
            </AnimatePresence>
            <motion.button
              type="button"
              aria-label="فتح مستشارة النمو"
              onClick={() => setOpen(true)}
              className="relative flex min-h-[140px] max-w-[calc(100vw-2rem)] items-center gap-3 rounded-full border border-slate-200 bg-white/95 px-5 py-4 text-slate-800 shadow-2xl shadow-indigo-500/20 backdrop-blur transition-[transform,box-shadow] hover:scale-105 hover:shadow-indigo-500/35 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:ring-offset-2 sm:gap-6 sm:px-8"
              style={{ animation: 'sales-chat-glow 2.6s ease-in-out infinite' }}
              initial={{ opacity: 0, scale: 0.7, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.7, y: 20 }}
              whileTap={{ scale: 0.94 }}
            >
              <span className="relative block h-28 w-28 shrink-0 rounded-full border-2 border-white/50 shadow-lg shadow-slate-950/20 sm:h-36 sm:w-36">
                <span className="absolute inset-0 overflow-hidden rounded-full">
                  <img
                    src="/avatars/consultant-main.png"
                    alt="مستشارة النمو"
                    className="h-full w-full scale-[1.4] rounded-full object-cover object-[center_30%]"
                  />
                </span>
                <span className="absolute bottom-1 right-1 h-7 w-7 rounded-full border-4 border-white bg-emerald-500 shadow-[0_0_14px_rgba(16,185,129,0.8)] animate-pulse" />
              </span>
              <span className="flex flex-col items-start gap-1 whitespace-nowrap text-slate-800">
                <span className="text-xl font-bold sm:text-2xl">
                  مستشارة النمو
                  <span aria-hidden="true" className="mr-3">→</span>
                </span>
                <span className="flex items-center gap-2 text-sm font-semibold text-emerald-600 sm:text-base">
                  <span className="h-3 w-3 animate-pulse rounded-full bg-emerald-500" />
                  متاحة الآن
                </span>
              </span>
            </motion.button>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <>
            <motion.button
              type="button"
              aria-label="إغلاق مستشارة المبيعات"
              className="fixed inset-0 z-[55] cursor-default bg-slate-950/60 backdrop-blur-[2px]"
              onClick={() => setOpen(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
            <motion.section
              role="dialog"
              aria-modal="true"
              aria-label="مستشارة مبيعات AI-Receptions"
              dir="rtl"
              className="fixed bottom-4 left-4 right-4 z-[60] flex h-[min(78dvh,680px)] flex-col overflow-hidden rounded-[2rem] border border-amber-300/20 bg-slate-950/90 text-white shadow-2xl shadow-indigo-950/60 backdrop-blur-2xl sm:bottom-6 sm:left-6 sm:right-auto sm:w-[min(94vw,430px)]"
              initial={{ opacity: 0, y: 30, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 30, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 280, damping: 28 }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="relative overflow-hidden border-b border-white/10 bg-gradient-to-l from-indigo-950/90 via-slate-950 to-amber-950/40 px-5 py-5">
                <div className="pointer-events-none absolute -left-12 -top-20 h-40 w-40 rounded-full bg-amber-400/15 blur-3xl" />
                <div className="relative flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-amber-300/30 bg-gradient-to-br from-amber-300/20 to-indigo-500/30 text-2xl">📈</span>
                    <div>
                      <p className="font-heading text-base font-bold text-amber-100">مستشارة نمو العيادة</p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-300"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" /> متاحة الآن</p>
                    </div>
                  </div>
                  <button type="button" onClick={() => setOpen(false)} aria-label="إغلاق المحادثة" className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10 hover:text-white">×</button>
                </div>
              </div>

              <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-5" aria-live="polite">
                {messages.map((message) => (
                  <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-start' : 'justify-end'}`}>
                    <div className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-7 ${message.role === 'user' ? 'rounded-bl-md bg-indigo-500/20 text-indigo-50' : 'rounded-br-md border border-amber-200/10 bg-white/[0.07] text-slate-100'}`}>
                      <p className="whitespace-pre-wrap">{message.content}</p>
                      {message.role === 'assistant' && message.id !== 'welcome' && (
                        <a href={message.action?.href ?? '/register'} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-gradient-to-l from-amber-300 to-[#D4AF37] px-4 py-2 text-xs font-black text-slate-950 transition hover:brightness-110">
                          {message.action?.label ?? 'ابدأ الآن'} <span aria-hidden>←</span>
                        </a>
                      )}
                    </div>
                  </div>
                ))}
                {loading && <div className="flex justify-end"><div className="rounded-2xl rounded-br-md border border-amber-200/10 bg-white/[0.07] px-4 py-3 text-sm text-amber-100"><span className="inline-flex gap-1"><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-amber-300" /><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-amber-300 [animation-delay:120ms]" /><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-amber-300 [animation-delay:240ms]" /></span></div></div>}
              </div>

              {showQuickOptions && (
                <div className="border-t border-white/10 px-4 py-3">
                  <p className="mb-2 text-right text-[11px] font-semibold text-slate-400">اختر سؤالاً سريعاً</p>
                  <div className="grid grid-cols-2 gap-2">
                    {QUICK_PROMPTS.map((prompt) => (
                      <button key={prompt.value} type="button" disabled={loading} onClick={() => void sendMessage(prompt.value)} className="rounded-xl border border-amber-200/15 bg-white/[0.05] px-2 py-2 text-right text-[11px] font-semibold leading-5 text-amber-50 transition hover:border-amber-300/40 hover:bg-amber-300/10 disabled:opacity-50"><span className="ml-1" aria-hidden>{prompt.icon}</span>{prompt.label}</button>
                    ))}
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="border-t border-white/10 bg-black/10 p-3">
                {!showQuickOptions && (
                  <button type="button" onClick={() => setShowQuickOptions(true)} className="mb-2 rounded-lg border border-amber-300/40 bg-transparent px-3 py-1.5 text-xs font-semibold text-amber-200 transition hover:bg-amber-300/10">
                    ← العودة للخيارات
                  </button>
                )}
                <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.06] p-1.5 focus-within:border-amber-300/40">
                  <input value={input} onChange={(event) => setInput(event.target.value)} disabled={loading} placeholder="اكتب سؤالك عن نمو عيادتك..." className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500" aria-label="رسالتك" />
                  <button type="submit" disabled={loading || !input.trim()} className="relative overflow-hidden rounded-xl bg-gradient-to-l from-amber-300 to-[#D4AF37] px-4 py-2 text-sm font-black text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"><span className="relative z-10">إرسال</span><span aria-hidden className="absolute inset-0 -translate-x-full bg-white/30" style={{ animation: 'sales-chat-shimmer 2.8s linear infinite' }} /></button>
                </div>
                <p className="mt-2 text-center text-[10px] text-slate-500">مستشارة مبيعات مستقلة — لا تنفذ حجوزات المرضى</p>
              </form>
            </motion.section>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
