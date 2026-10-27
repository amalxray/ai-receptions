'use client';

import { CheckCircle, Clock3, Copy } from 'lucide-react';
import { toast } from '@/components/ui/Toast';

interface Props {
  appointmentId: string;
  serviceName: string;
  appointmentDate: string;
  patientName: string;
  appointmentStatus?: string;
  clinicPhone?: string | null;
  clinicName?: string | null;
}

export default function BookingConfirmationCard({
  appointmentId,
  serviceName,
  appointmentDate,
  patientName,
  appointmentStatus,
}: Props) {
  const isPending = appointmentStatus !== undefined && appointmentStatus !== 'confirmed';
  const statusTitle = appointmentStatus === undefined || appointmentStatus === 'confirmed'
    ? 'تم تأكيد الحجز'
    : 'تم استلام طلب الحجز';

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(appointmentId);
      toast.success('تم نسخ رقم الحجز');
    } catch {
      toast.error('تعذر نسخ رقم الحجز');
    }
  };

  return (
    <section
      dir="rtl"
      aria-label="تأكيد الحجز"
      className={`rounded-2xl border bg-gradient-to-br p-5 text-right backdrop-blur-xl ${
        isPending
          ? 'border-amber-500/30 from-amber-950/30 to-slate-900/40'
          : 'border-emerald-500/30 from-emerald-950/40 to-slate-900/40'
      }`}
    >
      <div className="mb-3 flex items-center gap-3">
        {isPending
          ? <Clock3 className="h-8 w-8 shrink-0 text-amber-300" aria-hidden="true" />
          : <CheckCircle className="h-8 w-8 shrink-0 text-emerald-400" aria-hidden="true" />}
        <h3 className="text-lg font-bold text-white">{statusTitle}</h3>
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="text-slate-400">رقم الحجز:</span>
          <span className="flex items-center gap-2">
            <span className="break-all text-left font-mono text-white">{appointmentId}</span>
            <button
              type="button"
              onClick={() => void copyId()}
              className="shrink-0 text-cyan-400 hover:text-cyan-300"
              aria-label={`نسخ رقم الحجز ${appointmentId}`}
              title="نسخ رقم الحجز"
            >
              <Copy className="h-4 w-4" aria-hidden="true" />
            </button>
          </span>
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

    </section>
  );
}
