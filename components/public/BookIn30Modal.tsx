'use client';

import { useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useToast } from '@/components/ui/Toast';

interface Props {
  clinicId: string;
  isOpen: boolean;
  onClose: () => void;
}

const DAYS_AHEAD = 7;
const TIME_START = 9;
const TIME_END = 20;

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function generateTimes(): string[] {
  const times: string[] = [];
  for (let h = TIME_START; h < TIME_END; h++) {
    times.push(`${String(h).padStart(2, '0')}:00`);
    times.push(`${String(h).padStart(2, '0')}:30`);
  }
  return times;
}

export default function BookIn30Modal({ clinicId, isOpen, onClose }: Props) {
  const { addToast } = useToast();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [date, setDate] = useState(formatDate(new Date()));
  const [time, setTime] = useState('');
  const [selectedDate, setSelectedDate] = useState(formatDate(new Date()));
  const [bookedTimes, setBookedTimes] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const times = generateTimes();

  const fetchAvailability = useCallback(async (d: string) => {
    try {
      const res = await fetch(`/api/public/book-quick?clinic_id=${encodeURIComponent(clinicId)}&date=${encodeURIComponent(d)}`);
      if (res.ok) {
        const data = await res.json();
        setBookedTimes(new Set(data.bookedTimes ?? []));
      }
    } catch {
      // ignore
    }
  }, [clinicId]);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setBookedTimes(new Set());
      fetchAvailability(date);
    }
  }, [isOpen, date, fetchAvailability]);

  const handleDateSelect = (d: string) => {
    setDate(d);
    setSelectedDate(d);
    setTime('');
    fetchAvailability(d);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !phone || !date || !time) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/public/book-quick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinicId, name, phone, date, time }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'فشل الحجز');
      }
      await res.json();
      addToast({ type: 'success', title: 'تم الحجز!', message: 'سنتواصل معك خلال دقائق لتأكيد الموعد.' });
      setSuccess(true);
      setTimeout(() => { onClose(); setSuccess(false); }, 2000);
    } catch (err) {
      setError(typeof err === 'string' ? err : err?.message || err?.error?.message || 'حدث خطأ، حاول مرة أخرى');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isDisabled = isSubmitting || !name || !phone || !date || !time;

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-2xl flex items-center justify-center p-4"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="max-w-lg w-full rounded-3xl border border-white/10 bg-slate-950/95 p-6"
              onClick={(e) => e.stopPropagation()}
            >
              {success ? (
                <div className="text-center py-8">
                  <div className="text-4xl mb-2">✅</div>
                  <h3 className="text-xl font-bold text-white mb-2">تم الحجز!</h3>
                  <p className="text-slate-400 text-sm">سنتواصل معك خلال دقائق لتأكيد الموعد.</p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">الاسم الكامل</label>
                    <input
                      type="text"
                      required
                      minLength={2}
                      maxLength={50}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="أحمد محمد"
                      className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-500/20"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">رقم الهاتف</label>
                    <input
                      type="tel"
                      required
                      pattern="[0-9+\\-\\s]{7,15}"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+966501234567"
                      className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-500/20"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">التاريخ</label>
                    <div className="grid grid-cols-3 gap-2">
                      {Array.from({ length: DAYS_AHEAD }, (_, i) => {
                        const d = addDays(new Date(), i);
                        const ds = formatDate(d);
                        const selected = ds === selectedDate;
                        const label = i === 0 ? 'اليوم' : i === 1 ? 'غداً' : d.toLocaleDateString('ar-SA', { weekday: 'short' });
                        return (
                          <button
                            key={ds}
                            type="button"
                            onClick={() => handleDateSelect(ds)}
                            className={`rounded-xl border px-3 py-2 text-sm font-medium transition ${selected
                              ? 'bg-cyan-500 border-cyan-500 text-slate-950'
                              : 'bg-slate-800 border-white/10 text-white hover:border-cyan-400/50'}`}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">الوقت</label>
                    <div className="grid grid-cols-4 gap-2">
                      {times.map((t) => {
                        const disabled = bookedTimes.has(t);
                        return (
                          <button
                            key={t}
                            type="button"
                            onClick={() => setTime(t)}
                            disabled={disabled}
                            className={`rounded-xl border px-3 py-2 text-sm font-medium transition ${t === time
                              ? 'bg-cyan-500 border-cyan-500 text-slate-950'
                              : disabled
                                ? 'bg-slate-800 border-white/10 text-slate-500 cursor-not-allowed opacity-40'
                                : 'bg-slate-800 border-white/10 text-white hover:border-cyan-400/50'}`}
                          >
                            {t}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {error && (
                    <p className="text-sm text-rose-400 bg-rose-500/10 rounded-lg p-3">{String(error)}</p>
                  )}
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    disabled={isDisabled}
                    onClick={(e) => { e.preventDefault(); handleSubmit(e as React.FormEvent); }}
                    className={`w-full rounded-xl bg-gradient-to-l from-cyan-500 to-emerald-500 py-3 text-lg font-bold text-slate-950 disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {isSubmitting ? 'جارٍ الحجز...' : 'تأكيد الحجز ⚡'}
                  </motion.button>
                </form>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}