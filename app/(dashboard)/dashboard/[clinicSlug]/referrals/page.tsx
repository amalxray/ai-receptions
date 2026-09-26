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
  const [partners, setPartners] = useState<Record<string, Partner>>({});
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(
    async (direction: DirectionTab) => {
      if (!clinicId) return;
      setRows(null);
      setErr(null);
      try {
        const headers = await authHeaders();
        const res = await fetch(
          `/api/imaging/referrals?clinic_id=${encodeURIComponent(clinicId)}&direction=${direction}`,
          { headers },
        );
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body?.error ?? 'تعذر تحميل التحويلات');
        setRows((body?.data ?? []) as ReferralRow[]);
        setPartners((body?.partners ?? {}) as Record<string, Partner>);
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'حدث خطأ');
        setRows([]);
      }
    },
    [clinicId, authHeaders],
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
      ) : rows.length === 0 ? (
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
