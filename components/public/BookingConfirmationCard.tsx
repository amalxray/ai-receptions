'use client';

import { CheckCircle, Copy, MessageCircle, Phone } from 'lucide-react';
import { toast } from '@/components/ui/Toast';

interface Props {
  appointmentId: string;
  serviceName: string;
  appointmentDate: string;
  patientName: string;
  clinicPhone?: string | null;
  clinicName?: string | null;
}

export default function BookingConfirmationCard({
  appointmentId,
  serviceName,
  appointmentDate,
  patientName,
  clinicPhone,
  clinicName,
}: Props) {
  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(appointmentId);
      toast.success('تم نسخ رقم الحجز');
    } catch {
      toast.error('تعذر نسخ رقم الحجز');
    }
  };

  const shortId = appointmentId.slice(0, 8);
  const whatsappText = `حجزي رقم ${shortId} - ${serviceName} - ${appointmentDate}`;
  const whatsappPhone = clinicPhone?.replace(/[^0-9]/g, '');
  const whatsappUrl = `https://wa.me/${whatsappPhone || ''}?text=${encodeURIComponent(whatsappText)}`;

  return (
    <section
      dir="rtl"
      aria-label="تأكيد الحجز"
      className="rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-950/40 to-slate-900/40 p-5 text-right backdrop-blur-xl"
    >
      <div className="mb-3 flex items-center gap-3">
        <CheckCircle className="h-6 w-6 shrink-0 text-emerald-400" aria-hidden="true" />
        <h3 className="text-lg font-bold text-white">تم تسجيل حجزك</h3>
      </div>

      {clinicName && <p className="mb-3 text-sm text-slate-300">{clinicName}</p>}

      <div className="space-y-2 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="text-slate-400">رقم الحجز:</span>
          <button
            type="button"
            onClick={() => void copyId()}
            className="flex items-center gap-1 font-mono text-cyan-400 hover:text-cyan-300"
            aria-label={`نسخ رقم الحجز ${appointmentId}`}
          >
            {shortId}...
            <Copy className="h-3 w-3" aria-hidden="true" />
          </button>
        </div>
        <div className="flex justify-between gap-3">
          <span className="shrink-0 text-slate-400">الخدمة:</span>
          <span className="text-white">{serviceName}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="shrink-0 text-slate-400">التاريخ:</span>
          <span className="text-white">{appointmentDate}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="shrink-0 text-slate-400">الاسم:</span>
          <span className="text-white">{patientName}</span>
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        {clinicPhone && (
          <a
            href={`tel:${clinicPhone}`}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 py-2 text-sm text-cyan-300 hover:bg-cyan-500/20"
          >
            <Phone className="h-4 w-4" aria-hidden="true" /> اتصال
          </a>
        )}
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-green-500/30 bg-green-500/10 py-2 text-sm text-green-300 hover:bg-green-500/20"
        >
          <MessageCircle className="h-4 w-4" aria-hidden="true" /> واتساب
        </a>
      </div>
      <p className="mt-3 text-xs text-slate-400">📌 احتفظ برقم الحجز. سنتواصل معك لتأكيد الموعد.</p>
    </section>
  );
}
