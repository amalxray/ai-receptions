'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { type SuggestedClinic } from './ClinicCard';
import { displayAskClinicName } from '@/lib/services/askClinicPresentation';
import { sendGAEvent } from '@next/third-parties/google';
import type { PatientLocation } from './LocationPicker';
import type { AskConversationMessage } from '@/lib/services/askClinicPresentation';

const LocationPicker = dynamic(() => import('./LocationPicker'), {
  ssr: false,
  loading: () => <div className="h-64 animate-pulse rounded-2xl bg-slate-100" />,
});

type Msg = { role: 'user' | 'assistant'; content: string; clinics?: SuggestedClinic[]; needs_location?: boolean };

const STORE_KEY = 'patient_location';

export default function AskChat({ assistantName = 'سنّي', logo = '🦷', quickQuestions = [] }: { assistantName?: string; logo?: string; quickQuestions?: string[] }) {
  const [messages, setMessages] = useState<Msg[]>([
    { role: 'assistant', content: "أهلاً! أنا سنّي 🦷. أخبرني بما تشعر به (مثال: 'ألم في الضرس' أو 'أريد تنظيف') وسأجد لك أفضل موعد فوراً." },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [location, setLocation] = useState<PatientLocation | null>(null);
  const [showLocPicker, setShowLocPicker] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, showLocPicker]);

  const saveLocation = (loc: PatientLocation | null) => {
    setLocation(loc);
    if (loc) {
      try { localStorage.setItem(STORE_KEY, JSON.stringify(loc)); } catch { /* noop */ }
      try { sendGAEvent('event', 'location_set', { category: 'ask', method: loc.city ? 'city' : 'gps' }); } catch { /* noop */ }
      setMessages((m) => [...m, { role: 'user', content: `📍 موقعي: ${loc.address ?? loc.city ?? loc.lat + ', ' + loc.lng}` }]);
      void send('الموقع تم تحديده، اقترح لي أقرب المراكز.', loc);
    }
    setShowLocPicker(false);
  };

  const lastSuggestions = [...messages].reverse().find((m) => (m.clinics ?? []).length)?.clinics ?? [];

  const send = async (text: string, locOverride?: PatientLocation | null) => {
    const message = text.trim();
    if (!message || sending) return;

    setInput('');
    setMessages((m) => {
      if (!m.some((x) => x.role === 'user')) {
        try { sendGAEvent('event', 'chat_started', { category: 'ask' }); } catch { /* noop */ }
      }
      return [...m, { role: 'user', content: message }];
    });
    const history: AskConversationMessage[] = messages
      .slice(-12)
      .filter((item) => item.content.trim())
      .map((item) => ({ role: item.role, content: item.content.slice(0, 700) }));
    setSending(true);
    try {
      const res = await fetch('/api/public/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, location: locOverride ?? location, history }),
      });
      const json = await res.json();
      const clinics = (json.suggested_clinics ?? []) as SuggestedClinic[];
      if (clinics.length > 0) {
        console.log('Booking URL:', clinics[0]?.booking_url);
        try { sendGAEvent('event', 'clinics_suggested', { category: 'ask', count: clinics.length }); } catch { /* noop */ }
      }
      setMessages((m) => [
        ...m,
        { role: 'assistant', content: json.reply ?? 'حصل خطأ، جرّب مرة ثانية.', clinics, needs_location: Boolean(json.needs_location) },
      ]);
      if (json.needs_location) setShowLocPicker(true);
    } catch {
      setMessages((m) => [...m, { role: 'assistant', content: 'حصل خطأ في الاتصال — جرّب مرة ثانية.' }]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="relative isolate overflow-hidden rounded-3xl border border-white/10 bg-slate-900/80 p-4 shadow-2xl shadow-emerald-950/30 backdrop-blur-xl" dir="rtl">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-emerald-500/[0.08] via-transparent to-cyan-500/[0.06]" />
      <div className="pointer-events-none absolute -left-12 -top-12 h-40 w-40 rounded-full bg-emerald-400/10 blur-3xl" />
      {/* Header */}
      <div className="relative flex items-center gap-3 border-b border-white/10 pb-3">
        <span className="relative grid h-12 w-12 place-items-center rounded-full border border-emerald-300/25 bg-gradient-to-br from-emerald-400/20 via-slate-900 to-cyan-400/15 shadow-lg shadow-emerald-500/20">
          <svg
            viewBox="0 0 64 64"
            className="h-9 w-9 animate-pulse drop-shadow-[0_0_10px_rgba(52,211,153,0.65)]"
            role="img"
            aria-label={`${assistantName} ${logo}`}
          >
            <defs>
              <linearGradient id="ask-tooth-fill" x1="13" y1="8" x2="53" y2="56" gradientUnits="userSpaceOnUse">
                <stop stopColor="#ecfdf5" />
                <stop offset=".48" stopColor="#a7f3d0" />
                <stop offset="1" stopColor="#22d3ee" />
              </linearGradient>
              <linearGradient id="ask-tooth-shine" x1="18" y1="15" x2="34" y2="40" gradientUnits="userSpaceOnUse">
                <stop stopColor="white" stopOpacity=".9" />
                <stop offset="1" stopColor="white" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path
              d="M32 7c-5.9 0-8.6 3.5-13.3 3.5C11.5 10.5 7 16.4 7 24c0 12.4 7.5 32.5 13 32.5 3.9 0 3.8-8.1 7.2-12.4 1.3-1.7 4.3-1.7 5.6 0 3.4 4.3 3.3 12.4 7.2 12.4 5.5 0 13-20.1 13-32.5 0-7.6-4.5-13.5-11.7-13.5C36.6 10.5 37.9 7 32 7Z"
              fill="url(#ask-tooth-fill)"
              stroke="#d1fae5"
              strokeOpacity=".8"
              strokeWidth="1.5"
            />
            <path d="M17 17c3-4 8-4 12-4-4 4-5 12-6 18-1 5-3 8-5 6-4-7-5-15-1-20Z" fill="url(#ask-tooth-shine)" />
          </svg>
          <div className="absolute -bottom-0.5 -left-0.5 h-3.5 w-3.5 rounded-full border-2 border-slate-900 bg-emerald-400 animate-pulse" />
        </span>
        <div>
          <p className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-sm font-black text-transparent">{assistantName}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs font-semibold text-slate-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse" />
            متاح الآن — يرد فوراً
          </p>
        </div>
      </div>

      {/* Messages */}
      <div className="mt-3 max-h-96 min-h-40 space-y-3 overflow-y-auto p-1 chat-scrollbar">
        <AnimatePresence initial={false}>
          {messages.map((m, i) => (
            <motion.div
              key={i}
              layout
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
            >
              <div className={`max-w-[85%] whitespace-pre-line rounded-2xl px-4 py-2.5 text-sm leading-6 ${m.role === 'user' ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/30' : 'border border-white/10 bg-white/5 text-slate-100 shadow-sm backdrop-blur'}`}>
                {m.content}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        <AnimatePresence>
          {sending && (
            <motion.div
              key="typing"
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0 }}
              className="flex justify-start"
            >
              <div className="flex items-center gap-1.5 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 shadow-sm backdrop-blur" aria-label="سنّي يفكر">
                {[0, 1, 2].map((d) => (
                  <motion.span
                    key={d}
                    className="h-2 w-2 rounded-full bg-emerald-400"
                    animate={{ y: [0, -5, 0] }}
                    transition={{ duration: 0.6, repeat: Infinity, delay: d * 0.15, ease: 'easeInOut' }}
                  />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div ref={endRef} />
      </div>

      {/* Clinic suggestions */}
      {lastSuggestions.length > 0 && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {lastSuggestions.map((c, idx) => (
            <a
              key={c.id || idx}
              href={c.booking_url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex flex-col items-start rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-right shadow-sm transition-all duration-300 ease-out hover:-translate-y-1 hover:scale-[1.03] hover:border-emerald-300/30 hover:bg-white/[0.07] hover:shadow-md hover:shadow-emerald-950/30"
            >
              <div className="mb-2 flex w-full items-center justify-between">
                <span className="flex h-7 w-7 items-center justify-center rounded-full border border-emerald-300/20 bg-emerald-400/10 text-xs font-bold text-emerald-200">
                  {idx + 1}
                </span>
                {c.distance_km != null && (
                  <span className="text-[10px] font-medium text-slate-400">{c.distance_km} كم</span>
                )}
              </div>
              <div className="mb-2 flex items-center gap-2">
                {c.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.logo} alt="" aria-hidden="true" className="h-9 w-9 shrink-0 rounded-lg border border-white/10 object-cover" />
                ) : (
                  <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/5 text-lg">
                    {c.type === 'imaging_center' ? '📷' : c.type === 'dental_lab' ? '🦷' : '🏥'}
                  </span>
                )}
              </div>
              <p className="text-sm font-bold text-slate-100 group-hover:text-emerald-200">
                {displayAskClinicName(c.name, c.type)}
              </p>
              {c.city && <p className="mt-1 text-xs text-slate-400">📍 {c.city}</p>}
              <p className="mt-2 text-[11px] font-medium text-emerald-300 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                🏥 عرض العيادة
              </p>
            </a>
          ))}
        </div>
      )}

      {showLocPicker && (
        <div className="mt-3">
          <LocationPicker value={location} onChange={saveLocation} compact />
        </div>
      )}

      {/* Quick replies */}
      {quickQuestions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {quickQuestions.map((q, i) => (
            <motion.button
              key={q}
              type="button"
              onClick={() => void send(q)}
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.06, type: 'spring', stiffness: 320, damping: 20 }}
              whileHover={{ scale: 1.04, boxShadow: '0 0 18px rgba(52,211,153,0.22)' }}
              whileTap={{ scale: 0.95 }}
              className="rounded-full border border-emerald-300/20 bg-emerald-400/[0.08] px-3 py-1.5 text-xs font-medium text-emerald-100 transition hover:border-emerald-300/40 hover:bg-emerald-400/[0.14]">{q}</motion.button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="relative mt-3 flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/60 p-1.5 shadow-lg shadow-slate-950/20 backdrop-blur-md">
        <button type="button" onClick={() => setShowLocPicker((s) => !s)} title="حدد موقعك" className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-emerald-300/20 bg-emerald-400/10 text-white transition-all duration-300 hover:bg-emerald-400/20 hover:shadow-lg hover:shadow-emerald-500/15">📍</button>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void send(input); }}
          placeholder="أخبرنا بما تشعر به لنساعدك في العثور على موعد مناسب..."
          className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-400 focus-visible:ring-0"
        />
        <button
          type="button"
          onClick={() => void send(input)}
          disabled={sending || !input.trim()}
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 text-white shadow-lg shadow-emerald-500/40 transition-all duration-300 hover:scale-105 hover:shadow-emerald-500/60 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
          aria-label="إرسال"
        >
          {sending ? <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /> : <Send className="h-4 w-4" aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}
