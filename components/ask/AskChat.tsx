'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { type SuggestedClinic } from './ClinicCard';
import { displayAskClinicName } from '@/lib/services/askClinicPresentation';
import { sendGAEvent } from '@next/third-parties/google';
import type { PatientLocation } from './LocationPicker';
import type { AskConversationMessage } from '@/lib/services/askClinicPresentation';

const LocationPicker = dynamic(() => import('./LocationPicker'), {
  ssr: false,
  loading: () => <div className="h-64 animate-pulse rounded-2xl bg-slate-100" />,
});

type Msg = { role: 'user' | 'assistant'; content: string; clinics?: SuggestedClinic[]; needs_location?: boolean; bookingUrl?: string; logoUrl?: string | null };

const STORE_KEY = 'patient_location';

export default function AskChat({ assistantName = 'سنّي', logo = '🦷', quickQuestions = [] }: { assistantName?: string; logo?: string; quickQuestions?: string[] }) {
  const [messages, setMessages] = useState<Msg[]>([
    { role: 'assistant', content: "أهلاً! أنا سنّي 🦷. أخبرني بما تشعر به (مثال: 'ألم في الضرس' أو 'أريد تنظيف') وسأجد لك أفضل موعد فوراً." },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [location, setLocation] = useState<PatientLocation | null>(null);
  const [hasLocationThisSession, setHasLocationThisSession] = useState(false);
  const [showLocPicker, setShowLocPicker] = useState(false);
  const [showClinicsModal, setShowClinicsModal] = useState(false);
  const [showLocModal, setShowLocModal] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  // restore saved location for returning visitors
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORE_KEY);
      if (saved) setLocation(JSON.parse(saved));
    } catch {
      /* noop */
    }
  }, []);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, showLocPicker]);

  const saveLocation = (loc: PatientLocation | null) => {
    setLocation(loc);
    if (loc) {
      setHasLocationThisSession(true);
      try { localStorage.setItem(STORE_KEY, JSON.stringify(loc)); } catch { /* noop */ }
      try { sendGAEvent('event', 'location_set', { category: 'ask', method: loc.city ? 'city' : 'gps' }); } catch { /* noop */ }
      setMessages((m) => [...m, { role: 'user', content: `📍 موقعي: ${loc.address ?? loc.city ?? loc.lat + ', ' + loc.lng}` }]);
      void send('الموقع تم تحديده، اقترح لي أقرب المراكز.', loc);
    }
    setShowLocPicker(false);
  };

  const lastSuggestions = [...messages].reverse().find((m) => (m.clinics ?? []).length)?.clinics ?? [];

  const handleClinicSelect = (num: number) => {
    const clinic = lastSuggestions[num - 1];
    if (!clinic) return;

    const displayName = displayAskClinicName(clinic.name, clinic.type);
    const details = [
      `🎯 العيادة المختارة: ${displayName}`,
      clinic.city ? `📍 ${clinic.city}` : '📍 الموقع: غير محدد',
      clinic.address ? `🏠 ${clinic.address}` : '',
      clinic.distance_km != null ? `📏 المسافة: ${clinic.distance_km} كم` : '',
      clinic.phone ? `📞 ${clinic.phone}` : '',
      `🔗 الحجز: ${clinic.booking_url}`,
    ].filter(Boolean).join('\n');

    setMessages((m) => [...m, { role: 'user', content: `${num}` }, { role: 'assistant', content: details, bookingUrl: clinic.booking_url, logoUrl: clinic.logo ?? null }]);
  };

  const send = async (text: string, locOverride?: PatientLocation | null) => {
    const message = text.trim();
    if (!message || sending) return;

    const numericSelection = /^\d+$/.test(message) ? Number(message) : null;
    if (numericSelection && numericSelection >= 1 && lastSuggestions[numericSelection - 1]) {
      handleClinicSelect(numericSelection);
      return;
    }

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
        body: JSON.stringify({ message, location: (hasLocationThisSession ? (locOverride ?? location) : null), history }),
      });
      const json = await res.json();
      const clinics = (json.suggested_clinics ?? []) as SuggestedClinic[];
      if (clinics.length > 0) {
        try { sendGAEvent('event', 'clinics_suggested', { category: 'ask', count: clinics.length }); } catch { /* noop */ }
      }
      setMessages((m) => [
        ...m,
        { role: 'assistant', content: json.reply ?? 'حصل خطأ، جرّب مرة ثانية.', clinics, needs_location: Boolean(json.needs_location) },
      ]);
      if (json.needs_location) { setShowLocPicker(true); setShowLocModal(true); }
    } catch {
      setMessages((m) => [...m, { role: 'assistant', content: 'حصل خطأ في الاتصال — جرّب مرة ثانية.' }]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="relative rounded-3xl backdrop-blur-xl bg-gradient-to-br from-white/90 to-white/70 border border-white/60 p-4 shadow-[0_20px_80px_rgba(99,102,241,0.3)] overflow-hidden" dir="rtl">
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 via-transparent to-cyan-500/5"></div>
      <div className="absolute -top-10 -left-10 w-32 h-32 bg-gradient-to-br from-violet-400/20 to-indigo-400/20 rounded-full blur-2xl"></div>
      
      {/* Header */}
      <div className="relative flex items-center gap-3 border-b border-slate-200/50 pb-3">
        <span className="relative grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br from-indigo-600 via-violet-600 to-cyan-600 text-xl text-white shadow-[0_0_30px_rgba(99,102,241,0.6)] animate-[glow-pulse_2s_ease-in-out_infinite]">
          <span className="inline-block">{logo}</span>
          <div className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-emerald-400 border-2 border-white animate-pulse"></div>
        </span>
        <div>
          <p className="text-sm font-black bg-gradient-to-r from-indigo-600 to-cyan-600 bg-clip-text text-transparent">{assistantName}</p>
          <p className="text-xs font-semibold text-emerald-600">● متاح الآن — يرد فوراً</p>
        </div>
      </div>

      {/* Messages */}
      <div className="mt-3 max-h-96 min-h-40 space-y-3 overflow-y-auto p-1 chat-scrollbar">
        <AnimatePresence initial={false}>
          {messages.map((m, i) => (
            <motion.div
              key={i}
              layout
              initial={{ opacity: 0, x: m.role === 'user' ? 24 : -24, y: 8 }}
              animate={{ opacity: 1, x: 0, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 24 }}
              className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
            >
              {m.role === 'assistant' && m.logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.logoUrl} alt="" aria-hidden="true" className="mb-2 h-12 w-12 rounded-xl border border-slate-200 object-cover" />
              )}
              <div className={`max-w-[85%] whitespace-pre-line rounded-2xl px-4 py-2.5 text-sm leading-6 ${m.role === 'user' ? 'bg-blue-600 text-white shadow-glow-coral' : 'border border-slate-200 bg-white text-slate-800 shadow-sm'}`}>
                {m.content}
              </div>
              {m.role === 'assistant' && m.bookingUrl && (
                <a
                  href={m.bookingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-blue-600 px-5 py-2 text-sm font-bold text-white shadow-glow-coral transition hover:bg-blue-700 hover:scale-105 active:scale-95"
                >
                  🦷 احجز الآن
                </a>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
        <AnimatePresence>
          {sending && (
            <motion.div
              key="typing"
              initial={{ opacity: 0, x: -24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              className="flex justify-start"
            >
              <div className="flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm" aria-label="سنّي يفكر">
                {[0, 1, 2].map((d) => (
                  <motion.span
                    key={d}
                    className="h-2 w-2 rounded-full bg-blue-500"
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

      {lastSuggestions.length > 0 && (
        <div className="mt-3 flex justify-center">
          <button
            type="button"
            onClick={() => setShowClinicsModal(true)}
            className="rounded-full bg-gradient-to-r from-indigo-600 to-cyan-600 px-5 py-2 text-sm font-bold text-white shadow-lg transition hover:scale-105"
          >
            🏥 عرض العيادات المقترحة ({lastSuggestions.length})
          </button>
        </div>
      )}

      {showClinicsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowClinicsModal(false)}>
          <div className="max-h-[80vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-black text-slate-800">🏥 العيادات المقترحة</h3>
              <button type="button" onClick={() => setShowClinicsModal(false)} className="rounded-full bg-slate-100 px-3 py-1 text-sm hover:bg-slate-200">✕</button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {lastSuggestions.map((c, idx) => (
                <button
                  key={c.id || idx}
                  type="button"
                  onClick={() => { handleClinicSelect(idx + 1); setShowClinicsModal(false); }}
                  className="group flex flex-col items-start rounded-2xl border border-slate-100 bg-white p-4 text-right shadow-sm transition-all duration-300 ease-out hover:-translate-y-1 hover:scale-[1.03] hover:shadow-md hover:shadow-blue-900/5 hover:border-blue-200"
                >
                  <div className="mb-2 flex w-full items-center justify-between">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-800">{idx + 1}</span>
                    {c.distance_km != null && (<span className="text-[10px] font-medium text-slate-500">{c.distance_km} كم</span>)}
                  </div>
                  <div className="mb-2 flex items-center gap-2">
                    {c.logo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.logo} alt="" aria-hidden="true" className="h-9 w-9 shrink-0 rounded-lg border border-slate-200 object-cover" />
                    ) : (
                      <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-lg">
                        {c.type === 'imaging_center' ? '📷' : c.type === 'dental_lab' ? '🦷' : '🏥'}
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-bold text-slate-800 group-hover:text-blue-700">{displayAskClinicName(c.name, c.type)}</p>
                  {c.city && <p className="mt-1 text-xs text-slate-500">📍 {c.city}</p>}
                  {c.distance_km != null && <p className="mt-1 text-xs text-slate-500">📏 {c.distance_km} كم</p>}
                  {c.phone && <p className="mt-1 text-xs text-slate-500">📞 {c.phone}</p>}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {c.booking_url && (
                      <a href={c.booking_url} target="_blank" rel="noopener noreferrer" className="rounded-full bg-blue-600 px-3 py-1 text-xs font-bold text-white hover:bg-blue-700">احجز الآن</a>
                    )}
                    {c.google_maps_url && (
                      <a href={c.google_maps_url} target="_blank" rel="noopener noreferrer" className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700 hover:bg-slate-200">افتح الموقع</a>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {/* Location picker Modal */}
      {showLocModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowLocModal(false)}>
          <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-black text-slate-800">📍 تحديد موقعي</h3>
              <button type="button" onClick={() => setShowLocModal(false)} className="rounded-full bg-slate-100 px-3 py-1 text-sm hover:bg-slate-200">✕</button>
            </div>
            <LocationPicker value={location} onChange={(loc) => { saveLocation(loc); setShowLocModal(false); }} compact />
          </div>
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
              whileHover={{ scale: 1.06, boxShadow: '0 0 18px rgba(6,182,212,0.35)' }}
              whileTap={{ scale: 0.95 }}
              className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-800 transition hover:border-blue-300 hover:bg-blue-100">{q}</motion.button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="relative mt-3 flex items-center gap-2 backdrop-blur-md bg-white/60 border border-white/60 rounded-2xl p-1.5 shadow-lg">
        <button type="button" onClick={() => setShowLocModal(true)} title="حدد موقعك" className="flex-shrink-0 h-10 w-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white flex items-center justify-center hover:shadow-[0_0_20px_rgba(99,102,241,0.6)] hover:scale-105 transition-all duration-300">📍</button>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void send(input); }}
          placeholder="أخبرنا بما تشعر به لنساعدك في العثور على موعد مناسب..."
          className="flex-1 bg-transparent px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 outline-none"
        />
        <button 
          type="button" 
          onClick={() => void send(input)} 
          disabled={sending || !input.trim()} 
          className="flex-shrink-0 h-10 w-10 rounded-xl bg-gradient-to-br from-indigo-600 to-cyan-600 text-white flex items-center justify-center hover:shadow-[0_0_20px_rgba(6,182,212,0.6)] hover:scale-105 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
          aria-label="إرسال"
        >
          {sending ? <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : '🚀'}
        </button>
      </div>
    </div>
  );
}
