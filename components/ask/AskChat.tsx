'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import ClinicCard, { type SuggestedClinic } from './ClinicCard';
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
      setMessages((m) => [...m, { role: 'user', content: `📍 موقعي: ${loc.address ?? loc.city ?? loc.lat + ', ' + loc.lng}` }]);
      void send('الموقع تم تحديده، اقترح لي أقرب المراكز.', loc);
    }
    setShowLocPicker(false);
  };

  const send = async (text: string, locOverride?: PatientLocation | null) => {
    const message = text.trim();
    if (!message || sending) return;
    setInput('');
    setMessages((m) => [...m, { role: 'user', content: message }]);
    setSending(true);
    try {
      const res = await fetch('/api/public/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, location: locOverride ?? location }),
      });
      const json = await res.json();
      setMessages((m) => [
        ...m,
        { role: 'assistant', content: json.reply ?? 'حصل خطأ، جرّب مرة ثانية.', clinics: json.suggested_clinics ?? [], needs_location: Boolean(json.needs_location) },
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
        {sending && <div className="flex justify-start"><div className="rounded-2xl bg-slate-800/80 px-4 py-2 text-sm text-slate-400">… يكتب</div></div>}
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
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setShowLocPicker((s) => !s)}
          title="حدد موقعك"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/10 text-lg hover:bg-white/20"
        >
          📍
        </button>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void send(input); }}
          placeholder="اكتب مشكلتك هنا..."
          className="w-full rounded-full border border-white/10 bg-slate-950/70 px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-400/60 focus:outline-none"
        />
        <button type="button" onClick={() => void send(input)} disabled={sending || !input.trim()} className="shrink-0 rounded-full bg-emerald-500 px-5 py-2.5 text-sm font-bold text-slate-950 hover:bg-emerald-400 disabled:opacity-40">إرسال</button>
      </div>
    </div>
  );
}
