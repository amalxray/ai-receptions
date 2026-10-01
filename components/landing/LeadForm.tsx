'use client';

import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import LandingButton from './LandingButton';

export default function LeadForm() {
  const reducedMotion = useReducedMotion();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('submitting');
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'landing_page_founding_offer',
          status: 'new',
          // clinic_id is NULL (lead before clinic registration) — handled by migration / nullable
        }),
      });
      if (res.ok) {
        setStatus('success');
        setMessage('تم استلام مكانك! رح نتواصل معك قريباً.');
      } else {
        setStatus('error');
        setMessage('حدث خطأ، حاول مرة أخرى.');
      }
    } catch {
      setStatus('error');
      setMessage('حدث خطأ، حاول مرة أخرى.');
    }
  }

  return (
    <section id="founding" className="relative isolate overflow-hidden bg-[#FAFBFC] py-20 text-slate-900 lg:py-28">
      <div aria-hidden="true" className="pointer-events-none absolute -left-16 top-0 -z-10 h-72 w-72 rounded-full bg-[#8B5CF6]/15 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -right-16 bottom-0 -z-10 h-72 w-72 rounded-full bg-[#0EA5E9]/15 blur-3xl" />
      <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: reducedMotion ? 0 : 0.6 }}
          className="rounded-3xl border border-[#E2E8F0] bg-white/90 p-8 shadow-xl shadow-slate-900/5 backdrop-blur-sm"
        >
          <motion.h2 initial={{ opacity: 0, y: reducedMotion ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reducedMotion ? 0 : 0.05 }} className="text-center font-heading text-3xl font-extrabold text-slate-900">
            احجز مكانك بين أول 100
          </motion.h2>
          <motion.p initial={{ opacity: 0, y: reducedMotion ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reducedMotion ? 0 : 0.1 }} className="mt-3 text-center text-sm text-slate-600">
            اترك بياناتك ورح نرجع نتواصل معك لعرض توضيحي وثبت سعرك مدى الحياة.
          </motion.p>

          <form onSubmit={handleSubmit} className="mt-8 grid gap-4 [&_label]:text-slate-800">
            <motion.div initial={{ opacity: 0, y: reducedMotion ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reducedMotion ? 0 : 0.15 }}>
              <label className="mb-1 block text-sm font-semibold">الاسم</label>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="اسمك الكامل"
                className="w-full rounded-xl border border-[#E2E8F0] bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#8B5CF6] focus:ring-2 focus:ring-[#8B5CF6]/20"
              />
            </motion.div>
            <motion.div initial={{ opacity: 0, y: reducedMotion ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reducedMotion ? 0 : 0.2 }}>
              <label className="mb-1 block text-sm font-semibold">رقم الهاتف</label>
              <input
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="05X-XXX-XXXX"
                className="w-full rounded-xl border border-[#E2E8F0] bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#8B5CF6] focus:ring-2 focus:ring-[#8B5CF6]/20"
              />
            </motion.div>
            <motion.div initial={{ opacity: 0, y: reducedMotion ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reducedMotion ? 0 : 0.25 }}>
              <label className="mb-1 block text-sm font-semibold">البريد الإلكتروني (اختياري)</label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="clinic@example.com"
                className="w-full rounded-xl border border-[#E2E8F0] bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#8B5CF6] focus:ring-2 focus:ring-[#8B5CF6]/20"
              />
            </motion.div>

            {status === 'success' && (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-600">{message}</p>
            )}
            {status === 'error' && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-600">{message}</p>}

            <LandingButton type="submit" size="lg" className="w-full" >
              {status === 'submitting' ? 'جارٍ الإرسال...' : 'احجز مكانك ←'}
            </LandingButton>
          </form>
        </motion.div>
      </div>
    </section>
  );
}