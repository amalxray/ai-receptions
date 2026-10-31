'use client';

import { useEffect, useState } from 'react';
import GoogleSignInButton from '@/components/auth/GoogleSignInButton';
import ReviewPromptModal from '@/components/public/ReviewPromptModal';
import { buildGoogleCalendarUrl } from '@/lib/booking/googleCalendarLink';

type Props = {
  appointmentId: string;
  appointmentDate: string;
  clinicId: string;
  clinicName: string;
  clinicPhone?: string | null;
  clinicSlug?: string | null;
  onVisible?: () => void;
  patientName: string;
  serviceName: string;
};

export default function BookingFollowUpCard({
  appointmentId,
  appointmentDate,
  clinicId,
  clinicName,
  clinicPhone,
  clinicSlug,
  onVisible,
  patientName,
  serviceName,
}: Props) {
  const [reviewOpen, setReviewOpen] = useState(false);
  const [timeZone, setTimeZone] = useState<string>();
  useEffect(() => {
    setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, []);

  const calendarUrl = buildGoogleCalendarUrl({
    appointmentDate,
    clinicName,
    clinicPhone,
    appointmentId,
    patientName,
    serviceName,
    timeZone,
  });

  return (
    <section
      dir="rtl"
      aria-label="خيارات ما بعد الحجز"
      className="mt-3 space-y-3 rounded-2xl border border-slate-200 bg-white p-4 text-right shadow-sm"
    >
      <h3 className="text-sm font-bold text-slate-900">خيارات إضافية بعد الحجز</h3>
      <div className="grid gap-2 sm:grid-cols-2">
        {clinicSlug && (
          <button
            type="button"
            onClick={() => setReviewOpen(true)}
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-amber-400 px-4 py-2 text-sm font-bold text-slate-900 transition hover:bg-amber-300"
          >
            ⭐ قيّم تجربتك
          </button>
        )}
        {calendarUrl ? (
          <a
            href={calendarUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-bold text-blue-800 transition hover:bg-blue-100"
          >
            📅 أضف إلى Google Calendar
          </a>
        ) : (
          <p role="status" className="rounded-xl bg-slate-50 px-3 py-2 text-center text-xs text-slate-600">
            تعذر تجهيز رابط التقويم لعدم اكتمال تاريخ الموعد.
          </p>
        )}
      </div>
      <GoogleSignInButton
        label="تسجيل الدخول عبر Google"
        showAccountStatus
        clinicId={clinicId}
        appointmentId={appointmentId}
        onVisible={onVisible}
      />
      <ReviewPromptModal
        open={reviewOpen}
        clinicSlug={clinicSlug}
        source="booking"
        patientName={patientName}
        onClose={() => setReviewOpen(false)}
      />
    </section>
  );
}
