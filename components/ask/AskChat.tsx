'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { createPortal } from 'react-dom';
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
  const [isModalOpen, setIsModalOpen] = useState(false);
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

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, showLocPicker, isModalOpen]);

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

  const closeOnBackdrop = (handler: () => void) => (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) handler();
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
              <div className={`max-w-[85%] whitespace-pre-line rounded-2xl px-4 py-2.5 text-sm leading-6 ${m.role === 'user' ? 'bg-blue-600 text-white shadow-glow-coral' : 'border border-slate-200 bg-white text-slate-800 shadow-sm'}`}>
                {m.content}
              </div>
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

      {/* Clinics trigger link -> opens the first clinic's booking page directly */}
      {lastSuggestions.length > 0 && lastSuggestions[0]?.booking_url && (
        <a
          href={lastSuggestions[0].booking_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 w-full flex items-center justify-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-4 py-2.5 text-sm font-bold text-blue-800 transition hover:bg-blue-100 hover:shadow-[0_0_15px_rgba(6,182,212,0.35)]"
        >
          🏥 عرض العيادة
        </a>
      )}

      {/* Location picker modal */}
      {showLocPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={closeOnBackdrop(() => setShowLocPicker(false))}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <motion.div
            initial={{ scale: 0.95, y: 10 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 10 }}
            className="relative w-full max-w-lg bg-white/95 backdrop-blur-xl border border-white/60 rounded-2xl p-5 shadow-2xl mx-4 max-h-[85vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-slate-800">تحديد الموقع</h3>
              <button type="button" onClick={() => setShowLocPicker(false)} className="rounded-full bg-slate-100 p-1.5 text-slate-600 hover:bg-slate-200">✕</button>
            </div>
            <LocationPicker value={location} onChange={saveLocation} />
          </motion.div>
        </div>
      )}

      {/* Clinics modal */}
      {isModalOpen && typeof window !== 'undefined' && createPortal(
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.7)',
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={() => setIsModalOpen(false)}
        >
          <div
            style={{
              background: 'white',
              padding: 24,
              borderRadius: 16,
              maxWidth: 600,
              maxHeight: '80vh',
              overflow: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button onClick={() => setIsModalOpen(false)}>✕ إغلاق</button>
            <h2>العيادات المقترحة</h2>
            {lastSuggestions.map((c) => (
              <div key={c.id || c.slug} style={{ marginBottom: 16, padding: 16, border: '1px solid #ddd', borderRadius: 8 }}>
                <h3 style={{ margin: 0 }}>{displayAskClinicName(c.name, c.type)}</h3>
                {c.city && <p style={{ margin: 4 }}>📍 {c.city}</p>}
                {c.distance_km != null && <p style={{ margin: 4 }}>📏 المسافة: {c.distance_km} كم</p>}
                {c.phone && <a href={`tel:${c.phone}`} style={{ marginRight: 12 }}>📞 {c.phone}</a>}
                <br />
                <a
                  href={c.booking_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'inline-block', marginTop: 8, padding: '8px 16px', background: '#4f46e5', color: 'white', borderRadius: 8, textDecoration: 'none' }}
                >
                  احجز الآن →
                </a>
              </div>
            ))}
          </div>
        </div>,
        document.body
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
        <button type="button" onClick={() => setShowLocPicker((s) => !s)} title="حدد موقعك" className="flex-shrink-0 h-10 w-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white flex items-center justify-center hover:shadow-[0_0_20px_rgba(99,102,241,0.6)] hover:scale-105 transition-all duration-300">📍</button>
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
