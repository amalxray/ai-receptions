'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import DashboardSection from '@/components/dashboard/DashboardSection';
import EmptyState from '@/components/dashboard/EmptyState';
import Skeleton from '@/components/ui/Skeleton';
import StatusPill from '@/components/dashboard/StatusPill';
import { useClinicContext } from '@/lib/useClinicContext';
import { tenantDashboardUrl } from '@/lib/services/dashboardPaths';
import {
  referralPriorityLabel,
  referralStatusLabel,
  referralStatusTone,
} from '@/lib/services/referralWorkflow';

/**
 * REFERRALS (B20) — one page for BOTH legs of a cross-tenant referral.
 *
 * The same screen serves the two tenants because the direction is resolved by
 * the DATA, not by the activity type: `outgoing` lists the referrals THIS
 * organization sent (it is the referring clinic) and `incoming` lists the ones
 * it received (it owns the activity side). A clinic that also runs a center, or
 * a center that refers patients onward, needs no separate page.
 *
 * Rows come from `GET /api/imaging/referrals` (membership-gated; the row filter
 * is applied server-side against the caller's clinic_id). The counterpart name
 * arrives in the same response as a `partners` lookup — one query for the whole
 * list instead of one request per row.
 */

type ReferralRow = {
  id: string;
  clinic_id: string;
  referring_clinic_id: string | null;
  patient_id: string | null;
  patient_id_center: string | null;
  patient_ref: string | null;
  requested_service: string | null;
  modality: string | null;
  status: string;
  imaging_status: string | null;
  priority: string | null;
  notes: string | null;
  scheduled_at: string | null;
  completed_at: string | null;
  created_at: string | null;
};

type Partner = { name: string | null; slug: string | null; activity_type: string | null };
type ReverseReferralRow = {
  id: string;
  from_clinic_id: string;
  patient_id_to: string;
  patient_name: string;
  patient_phone: string | null;
  image_url: string;
  notes: string | null;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: string;
  accepted_at: string | null;
  from_clinic_name: string | null;
};

type DirectionTab = 'outgoing' | 'incoming';

const TAB_LABELS: Record<DirectionTab, string> = {
  outgoing: '📤 أرسلتها',
  incoming: '📥 استلمتها',
};

function formatDateAr(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('ar', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

export default function ReferralsPage() {
  const { clinicId, clinicSlug, activityType, authHeaders, loading, error: clinicError } = useClinicContext();
  const [tab, setTab] = useState<DirectionTab>('outgoing');
  const [rows, setRows] = useState<ReferralRow[] | null>(null);
  const [reverseRows, setReverseRows] = useState<ReverseReferralRow[] | null>(null);
  const [partners, setPartners] = useState<Record<string, Partner>>({});
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(
    async (direction: DirectionTab) => {
      if (!clinicId) return;
      setRows(null);
      setReverseRows(null);
      setErr(null);
      try {
        const headers = await authHeaders();
        const res = await fetch(
          `/api/imaging/referrals?clinic_id=${encodeURIComponent(clinicId)}&direction=${direction}`,
          { headers },
        );
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body?.error ?? 'تعذر تحميل التحويلات');
        let incomingReverseRows: ReverseReferralRow[] = [];
        if (direction === 'incoming' && activityType === 'clinic') {
          const reverseResponse = await fetch(
            `/api/clinic/reverse-referrals?clinic_id=${encodeURIComponent(clinicId)}`,
            { headers },
          );
          const reverseBody = await reverseResponse.json().catch(() => ({}));
          if (!reverseResponse.ok) throw new Error(reverseBody?.error ?? 'تعذر تحميل التحويلات العكسية');
          incomingReverseRows = Array.isArray(reverseBody.data) ? reverseBody.data as ReverseReferralRow[] : [];
        }
        setRows((body?.data ?? []) as ReferralRow[]);
        setPartners((body?.partners ?? {}) as Record<string, Partner>);
        setReverseRows(incomingReverseRows);
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'حدث خطأ');
        setRows([]);
        setReverseRows([]);
      }
    },
    [activityType, clinicId, authHeaders],
  );

  useEffect(() => {
    if (loading) return;
    void load(tab);
  }, [loading, load, tab]);

  const isCenter = activityType === 'imaging_center';
  const description =
    tab === 'outgoing'
      ? 'التحويلات التي أرسلتها إلى مركز تصوير/مختبر شريك — تابع حالتها وافتح التفاصيل للاطلاع على النتيجة.'
      : 'التحويلات الواردة إليك من العيادات المحيلة — اقبلها، اطلب توضيحًا، أو ارفع النتيجة.';

  if (loading) return <Skeleton className="h-60" />;
  if (clinicError) return <EmptyState title="تعذر تحميل التحويلات" description={clinicError} />;

  const updateReverseReferral = async (id: string, status: 'accepted' | 'rejected') => {
    if (!clinicId) return;
    setErr(null);
    try {
      const headers = await authHeaders();
      const response = await fetch(`/api/clinic/reverse-referrals?id=${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ clinic_id: clinicId, status }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error ?? 'تعذر تحديث التحويل');
      setReverseRows((current) =>
        (current ?? []).map((row) =>
          row.id === id ? { ...row, status: body.data.status, accepted_at: body.data.accepted_at } : row,
        ),
      );
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'تعذر تحديث التحويل');
    }
  };

  return (
    <DashboardSection title="التحويلات بين المنشآت" subtitle={description}>
      <div className="mb-5 flex flex-wrap gap-2">
        {(['outgoing', 'incoming'] as DirectionTab[]).map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setTab(d)}
            className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
              tab === d
                ? 'border-cyan-500/70 bg-cyan-500/10 text-white'
                : 'border-slate-700 text-slate-300 hover:border-cyan-500/40 hover:text-white'
            }`}
          >
            {TAB_LABELS[d]}
          </button>
        ))}
      </div>

      {err && <p className="mb-4 text-sm text-red-400">{err}</p>}

      {rows === null ? (
        <Skeleton className="h-40" />
      ) : rows.length === 0 && (reverseRows?.length ?? 0) === 0 ? (
        <EmptyState
          title={tab === 'outgoing' ? 'لم تُرسل أي تحويل بعد' : 'لا توجد تحويلات واردة'}
          description={
            tab === 'outgoing'
              ? 'افتح ملف المريض ثم «تحويل لمركز تصوير» لإرسال أول تحويل — يظهر هنا مع حالته.'
              : isCenter
                ? 'ستظهر هنا الطلبات الواردة من العيادات المرتبطة بمركزك بعد قبول العلاقة.'
                : 'ستظهر هنا الطلبات الواردة من العيادات المحيلة المرتبطة بك.'
          }
        />
      ) : (
        <div className="space-y-3">
          {tab === 'incoming' && reverseRows?.map((row) => (
            <article key={`reverse-${row.id}`} className="rounded-2xl border border-violet-500/30 bg-slate-950/70 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-base font-semibold text-white">إعادة تحويل المريض إلى العيادة</p>
                  <p className="mt-1 text-sm text-slate-400">
                    المريض: {row.patient_name}
                    {row.patient_phone ? ` · ${row.patient_phone}` : ''}
                    {row.from_clinic_name ? ` · من: ${row.from_clinic_name}` : ''}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">{formatDateAr(row.created_at)}</p>
                </div>
                <StatusPill
                  tone={row.status === 'accepted' ? 'success' : row.status === 'pending' ? 'warning' : 'danger'}
                >
                  {row.status === 'accepted' ? 'مقبول' : row.status === 'pending' ? 'بانتظار القبول' : 'مرفوض'}
                </StatusPill>
              </div>
              {row.notes && <p className="mt-3 text-sm text-slate-300">{row.notes}</p>}
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Link
                  href={tenantDashboardUrl(clinicSlug ?? '', `patients/${encodeURIComponent(row.patient_id_to)}`)}
                  className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
                >
                  ملف المريض
                </Link>
                <a
                  href={row.image_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-100 hover:bg-cyan-500/20"
                >
                  عرض الصورة
                </a>
                {row.status === 'pending' && (
                  <>
                    <button
                      type="button"
                      onClick={() => void updateReverseReferral(row.id, 'accepted')}
                      className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100 hover:bg-emerald-500/20"
                    >
                      قبول التحويل
                    </button>
                    <button
                      type="button"
                      onClick={() => void updateReverseReferral(row.id, 'rejected')}
                      className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-100 hover:bg-red-500/20"
                    >
                      رفض
                    </button>
                  </>
                )}
              </div>
            </article>
          ))}
          {rows.map((r) => {
            const counterpartId = tab === 'outgoing' ? r.clinic_id : r.referring_clinic_id;
            const counterpart = counterpartId ? partners[counterpartId] : null;
            return (
              <Link
                key={r.id}
                href={`${tenantDashboardUrl(clinicSlug ?? '', 'referrals')}/${encodeURIComponent(r.id)}`}
                className="block rounded-2xl border border-slate-800 bg-slate-950/70 p-5 transition hover:border-cyan-500/50"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-white">
                      {r.requested_service ?? 'تحويل'}
                      {r.modality ? <span className="text-slate-400"> · {r.modality}</span> : null}
                    </p>
                    <p className="mt-1 text-sm text-slate-400">
                      المريض: {r.patient_ref ?? (r.patient_id ? `${r.patient_id.slice(0, 8)}…` : '—')}
                      {counterpart?.name ? ` · ${tab === 'outgoing' ? 'إلى' : 'من'}: ${counterpart.name}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {r.priority === 'urgent' && <StatusPill tone="danger">{referralPriorityLabel(r.priority)}</StatusPill>}
                    <StatusPill tone={referralStatusTone(r.status)}>{referralStatusLabel(r.status)}</StatusPill>
                  </div>
                </div>
                <p className="mt-2 text-xs text-slate-500">{formatDateAr(r.created_at)}</p>
              </Link>
            );
          })}
        </div>
      )}
    </DashboardSection>
  );
}
