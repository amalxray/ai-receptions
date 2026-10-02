'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { type SuggestedClinic } from './ClinicCard';
import { displayAskClinicName } from '@/lib/services/askClinicPresentation';
import { sendGAEvent } from '@next/third-parties/google';
import { TextShimmer } from '@/components/ui/text-shimmer';
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

    setMessages((m) => [...m, { role: 'user', content: `${num}` }, { role: 'assistant', content: details }]);
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

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-lg shadow-slate-200/70" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-blue-600 to-cyan-500 text-lg text-white">{logo}</span>
        <div>
          <p className="text-sm font-bold text-slate-800">{assistantName}</p>
          <p className="text-xs font-medium text-emerald-700">● متاح الآن — يرد فوراً</p>
        </div>
      </div>

      {/* Messages */}
      <div className="mt-3 max-h-96 min-h-40 space-y-3 overflow-y-auto p-1">
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div className={`max-w-[85%] whitespace-pre-line rounded-2xl px-4 py-2.5 text-sm leading-6 ${m.role === 'user' ? 'bg-blue-600 text-white' : 'border border-slate-200 bg-white text-slate-800 shadow-sm'}`}>
              {m.content}
           </div>
         </div>
        ))}
        {sending && <div className="flex justify-start"><div className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-slate-700 shadow-sm"><TextShimmer duration={1}>سنّي يفكر…</TextShimmer></div></div>}
        <div ref={endRef} />
      </div>

      {lastSuggestions.length > 0 && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 animate-in fade-in slide-in-from-bottom-4 duration-500">
         {lastSuggestions.map((c, idx) => (
           <button
             key={c.id || idx}
             type="button"
             onClick={() => handleClinicSelect(idx + 1)}
             className="group flex flex-col items-start rounded-2xl border border-slate-100 bg-white p-4 text-right shadow-sm transition-all duration-300 ease-out hover:-translate-y-1 hover:scale-[1.03] hover:shadow-md hover:shadow-blue-900/5 hover:border-blue-200"
           >
             <div className="mb-2 flex w-full items-center justify-between">
               <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-800">
                 {idx + 1}
               </span>
               {c.distance_km != null && (
                 <span className="text-[10px] font-medium text-slate-500">{c.distance_km} كم</span>
               )}
             </div>
             <p className="text-sm font-bold text-slate-800 group-hover:text-blue-700">
               {displayAskClinicName(c.name, c.type)}
             </p>
             {c.city && <p className="mt-1 text-xs text-slate-500">📍 {c.city}</p>}
             <p className="mt-2 text-[11px] font-medium text-blue-600 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
               اضغط لعرض التفاصيل ←
             </p>
           </button>
         ))}
        </div>
      )}

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
            <button key={q} type="button" onClick={() => void send(q)} className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-800 transition hover:border-blue-300 hover:bg-blue-100">{q}</button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="chat-input-container mt-3">
        <button type="button" onClick={() => setShowLocPicker((s) => !s)} title="حدد موقعك" className="chat-button" style={{ background: '#2563eb' }}>📍</button>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void send(input); }}
          placeholder="أخبرنا بما تشعر به لنساعدك في العثور على موعد مناسب..."
          className="chat-input"
        />
        <button type="button" onClick={() => void send(input)} disabled={sending || !input.trim()} className="chat-button" aria-label="إرسال">🚀</button>
      </div>
    </div>
  );
}
