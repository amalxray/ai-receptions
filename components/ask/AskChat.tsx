'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import ClinicCard, { type SuggestedClinic } from './ClinicCard';
import { sendGAEvent } from '@next/third-parties/google';
import { TextShimmer } from '@/components/ui/text-shimmer';
import type { PatientLocation } from './LocationPicker';

const LocationPicker = dynamic(() => import('./LocationPicker'), {
  ssr: false,
  loading: () => <div className="h-64 animate-pulse rounded-2xl bg-white/5" />,
});

type Msg = { role: 'user' | 'assistant'; content: string; clinics?: SuggestedClinic[]; needs_location?: boolean };

const STORE_KEY = 'patient_location';

export default function AskChat({ assistantName = 'سنّي', logo = '🦷', quickQuestions = [] }: { assistantName?: string; logo?: string; quickQuestions?: string[] }) {
  const [messages, setMessages] = useState<Msg[]>([
    { role: 'assistant', content: `أهلاً! أنا ${assistantName} 🦷 اكتب شو عم يصير معك وسأساعدك في العثور على أقرب طبيب.` },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [location, setLocation] = useState<PatientLocation | null>(null);
  const [showLocPicker, setShowLocPicker] = useState(false);
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
      try { localStorage.setItem(STORE_KEY, JSON.stringify(loc)); } catch { /* noop */ }
      try { sendGAEvent('event', 'location_set', { category: 'ask', method: loc.city ? 'city' : 'gps' }); } catch { /* noop */ }
      setMessages((m) => [...m, { role: 'user', content: `📍 موقعي: ${loc.address ?? loc.city ?? loc.lat + ', ' + loc.lng}` }]);
      void send('الموقع تم تحديده، اقترح لي أقرب المراكز.', loc);
    }
    setShowLocPicker(false);
  };

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
    setSending(true);
    try {
      const res = await fetch('/api/public/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, location: locOverride ?? location }),
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

  return (
    <div className="rounded-3xl border border-white/10 bg-slate-900/60 p-4 shadow-xl" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-white/10 pb-3">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-emerald-400 to-cyan-500 text-lg">{logo}</span>
        <div>
          <p className="text-sm font-bold text-slate-100">{assistantName}</p>
          <p className="text-xs text-emerald-400">● متاح الآن — يرد فوراً</p>
        </div>
      </div>

      {/* Messages */}
      <div className="mt-3 max-h-96 min-h-40 space-y-3 overflow-y-auto p-1">
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div className={`max-w-[85%] whitespace-pre-line rounded-2xl px-4 py-2.5 text-sm leading-6 ${m.role === 'user' ? 'bg-cyan-500 text-slate-950' : 'bg-slate-800/80 text-slate-100'}`}>
              {m.content}
              {m.clinics && m.clinics.length > 0 && (
                <div className="mt-3 space-y-2">
                  {m.clinics.map((c) => <ClinicCard key={c.id} clinic={c} />)}
                </div>
              )}
            </div>
          </div>
        ))}
        {sending && <div className="flex justify-start"><div className="rounded-2xl bg-slate-800/80 px-4 py-2"><TextShimmer duration={1}>سنّي يفكر…</TextShimmer></div></div>}
        <div ref={endRef} />
      </div>

      {/* Location picker (slides in when needed) */}
      {showLocPicker && (
        <div className="mt-3">
          <LocationPicker value={location} onChange={saveLocation} compact />
        </div>
      )}

      {/* Quick replies */}
      {quickQuestions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {quickQuestions.map((q) => (
            <button key={q} type="button" onClick={() => void send(q)} className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-200 hover:border-emerald-400/40 hover:text-emerald-300">{q}</button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="chat-input-container mt-3">
        <button type="button" onClick={() => setShowLocPicker((s) => !s)} title="حدد موقعك" className="chat-button" style={{ background: 'rgba(255,255,255,0.12)' }}>📍</button>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void send(input); }}
          placeholder="اكتب مشكلتك هنا..."
          className="chat-input"
        />
        <button type="button" onClick={() => void send(input)} disabled={sending || !input.trim()} className="chat-button" aria-label="إرسال">🚀</button>
      </div>
    </div>
  );
}
