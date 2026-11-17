'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, ExternalLink, Globe2, MessageSquareText, Star, Stethoscope } from 'lucide-react';
import Skeleton from '@/components/ui/Skeleton';

type GeoStatus = {
  slug: string;
  publicPageAvailable: boolean;
  schemaType: string;
  faqCount: number;
  reviews: { total: number; average: number } | null;
};

type GEOStatusCardProps = {
  clinicId: string;
  clinicSlug: string | null;
  authHeaders: () => Promise<Record<string, string>>;
};

function StatusItem({
  icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail?: string;
  tone: 'success' | 'pending' | 'warning';
}) {
  const toneClass = {
    success: 'text-emerald-300',
    pending: 'text-amber-300',
    warning: 'text-rose-300',
  }[tone];

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
      <div className="flex items-center gap-2 text-sm text-slate-400">
        {icon}
        <span>{label}</span>
      </div>
      <div className={`mt-3 flex items-center gap-2 font-semibold ${toneClass}`}>
        {tone === 'success' ? <CheckCircle2 size={17} /> : null}
        {tone === 'pending' ? <Clock3 size={17} /> : null}
        {tone === 'warning' ? <AlertTriangle size={17} /> : null}
        <span>{value}</span>
      </div>
      {detail ? <p className="mt-1 text-xs text-slate-500">{detail}</p> : null}
    </div>
  );
}

export default function GEOStatusCard({ clinicId, clinicSlug, authHeaders }: GEOStatusCardProps) {
  const [status, setStatus] = useState<GeoStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const headers = await authHeaders();
        const response = await fetch(`/api/clinic/geo-status?clinic_id=${encodeURIComponent(clinicId)}`, { headers });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.error ?? 'تعذر تحميل حالة الحضور الرقمي.');
        if (mounted) setStatus(body.data as GeoStatus);
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : 'تعذر تحميل حالة الحضور الرقمي.');
      } finally {
        if (mounted) setLoading(false);
      }
    }

    if (clinicId) void load();
    return () => { mounted = false; };
  }, [clinicId, authHeaders]);

  const publicUrl = clinicSlug ? `https://${clinicSlug}.dentairec.com` : null;

  return (
    <section className="rounded-[1.75rem] border border-slate-800 bg-slate-950/70 p-5">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-white">جاهزية الحضور الرقمي</h2>
          <p className="mt-1 text-sm text-slate-400">تعكس مؤشرات Schema وFAQ والتقييمات البيانات والإعدادات المتوفرة، ولا تضمن ظهورها في محركات البحث.</p>
        </div>
        {publicUrl ? (
          <a
            href={publicUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-sm font-medium text-cyan-200 transition hover:border-cyan-400/60"
          >
            تحقق من صفحتك العامة
            <ExternalLink size={15} />
          </a>
        ) : null}
      </header>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[...Array(4)].map((_, index) => <Skeleton key={index} className="h-28" />)}
        </div>
      ) : error || !status ? (
        <div className="rounded-xl border border-rose-900/60 bg-rose-950/30 p-4 text-sm text-rose-200" role="status">
          <AlertTriangle className="mr-2 inline-block h-4 w-4" />
          {error ?? 'تعذر التحقق من مؤشرات الحضور الرقمي.'}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatusItem
            icon={<Globe2 size={16} className="text-cyan-300" />}
            label="الرابط العام"
            value={status.publicPageAvailable ? 'مُعدّ' : 'غير مُعدّ'}
            tone={status.publicPageAvailable ? 'success' : 'pending'}
          />
          <StatusItem
            icon={<Stethoscope size={16} className="text-cyan-300" />}
            label="Schema الطبي"
            value={status.schemaType || 'غير مُفعّل'}
            tone={status.schemaType ? 'success' : 'pending'}
            detail={status.schemaType === 'MedicalBusiness' ? 'يُستخدم نوع Schema المناسب لهذا النشاط.' : undefined}
          />
          <StatusItem
            icon={<MessageSquareText size={16} className="text-cyan-300" />}
            label="FAQPage"
            value={status.faqCount > 0 ? `${status.faqCount} أسئلة مخصصة` : 'لا توجد أسئلة مخصصة'}
            tone={status.faqCount > 0 ? 'success' : 'pending'}
            detail={status.faqCount === 0 ? 'تُنشئ الصفحة أسئلة عامة تلقائيًا.' : undefined}
          />
          {status.reviews ? (
            <StatusItem
              icon={<Star size={16} className="text-amber-300" />}
              label="التقييمات المنشورة"
              value={status.reviews.total > 0 ? `⭐ ${status.reviews.average.toFixed(1)} (${status.reviews.total})` : 'لا توجد تقييمات منشورة'}
              tone={status.reviews.total > 0 ? 'success' : 'pending'}
            />
          ) : (
            <StatusItem
              icon={<Star size={16} className="text-amber-300" />}
              label="التقييمات المنشورة"
              value="تعذّر التحقق"
              tone="warning"
            />
          )}
        </div>
      )}
    </section>
  );
}
