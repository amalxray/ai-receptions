'use client';

import { useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useToast } from '@/components/ui/Toast';
import BookingConfirmationCard from './BookingConfirmationCard';

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
  const [email, setEmail] = useState('');
  const [date, setDate] = useState(formatDate(new Date()));
  const [time, setTime] = useState('');
  const [selectedDate, setSelectedDate] = useState(formatDate(new Date()));
  const [bookedTimes, setBookedTimes] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bookingConfirmation, setBookingConfirmation] = useState<{
    appointmentId: string;
    date: string;
    time: string;
    patientName: string;
    clinicName: string;
    clinicPhone: string | null;
    emailSent: boolean;
  } | null>(null);
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
      setBookingConfirmation(null);
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
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('يرجى إدخال بريد إلكتروني صحيح');
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/public/book-quick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinicId, name, phone, email: email.trim() || null, date, time }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error || 'فشل الحجز');
      }
      addToast({ type: 'success', title: 'تم الحجز!', message: 'سنتواصل معك خلال دقائق لتأكيد الموعد.' });
      setBookingConfirmation({
        appointmentId: body.appointment_id,
        date: new Date(`${date}T12:00:00`).toLocaleDateString('ar-SA'),
        time,
        patientName: name,
        clinicName: body.clinic_name ?? 'العيادة',
        clinicPhone: body.clinic_phone ?? null,
        emailSent: body.email_sent === true,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ، حاول مرة أخرى');
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
              {bookingConfirmation ? (
                <div className="space-y-4">
                  <BookingConfirmationCard
                    appointmentId={bookingConfirmation.appointmentId}
                    serviceName="موعد سريع"
                    appointmentDate={`${bookingConfirmation.date} — ${bookingConfirmation.time}`}
                    patientName={bookingConfirmation.patientName}
                    clinicName={bookingConfirmation.clinicName}
                    clinicPhone={bookingConfirmation.clinicPhone}
                  />
                  {email.trim() && (
                    <p className={`text-center text-xs ${bookingConfirmation.emailSent ? 'text-emerald-300' : 'text-amber-300'}`} role="status">
                      {bookingConfirmation.emailSent ? 'أُرسلت تفاصيل الحجز إلى بريدك الإلكتروني.' : 'تعذر إرسال البريد حالياً؛ احتفظ برقم الحجز.'}
                    </p>
                  )}
                  <button type="button" onClick={onClose} className="w-full rounded-xl border border-white/15 py-2.5 text-sm font-semibold text-slate-200 hover:bg-white/5">
                    إغلاق
                  </button>
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
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">البريد الإلكتروني (اختياري)</label>
                    <input
                      type="email"
                      maxLength={254}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@example.com"
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
