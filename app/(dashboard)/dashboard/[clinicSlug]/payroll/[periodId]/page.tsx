'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useSupabaseConfig } from '@/lib/useSupabaseConfig';
import { useClinicContext } from '@/lib/useClinicContext';
import StatusBadge from '@/components/dashboard/payroll/StatusBadge';
import PayslipTable, { type PayslipRow } from '@/components/dashboard/payroll/PayslipTable';
import UnlockDialog from '@/components/dashboard/payroll/UnlockDialog';
import AdjustmentDialog from '@/components/dashboard/payroll/AdjustmentDialog';
import { periodMonthLabel } from '@/components/dashboard/payroll/PeriodCard';
import { printPayslip } from '@/components/dashboard/payroll/printPayslip';

type PeriodDetail = {
  period: {
    id: string;
    period_month: string;
    status: string;
    currency: string | null;
    total_base: number | string;
    total_commission: number | string;
    total_bonuses: number | string;
    total_deductions: number | string;
    total_advances: number | string;
    total_net: number | string;
    unlock_count?: number | null;
    unlock_reason?: string | null;
    unlocked_at?: string | null;
  };
  payslips: PayslipRow[];
};

type AuditRow = {
  id: string;
  action: string;
  actor_email: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
};

const n = (value: number | string | null | undefined) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const ACTION_AR: Record<string, string> = {
  generated: 'توليد الفترة',
  approved: 'اعتماد',
  paid: 'دفع',
  cancelled: 'إلغاء',
  unlocked: 'إعادة فتح',
};

export default function PayrollPeriodPage() {
  const params = useParams<{ clinicSlug: string; periodId: string }>();
  const periodId = params?.periodId ?? '';
  const { isConfigured } = useSupabaseConfig();
  const { clinicId, clinicName, role, authHeaders, loading: clinicLoading, error: clinicError } = useClinicContext();

  const [detail, setDetail] = useState<PeriodDetail | null>(null);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [adjustFor, setAdjustFor] = useState<PayslipRow | null>(null);

  const canManage = role === 'owner' || role === 'manager' || role === 'accountant';
  const isOwner = role === 'owner';

  const load = useCallback(async () => {
    if (!clinicId || !periodId) return;
    setLoading(true);
    try {
      const headers = await authHeaders();
      const [detailRes, auditRes] = await Promise.all([
        fetch(`/api/clinic/payroll/periods/${periodId}?clinic_id=${clinicId}`, { headers }),
        fetch(`/api/clinic/payroll/audit?clinic_id=${clinicId}&period_id=${periodId}`, { headers }),
      ]);
      const detailJson = await detailRes.json();
      if (!detailRes.ok) throw new Error(detailJson.error || 'تعذر جلب الفترة');
      setDetail(detailJson.data as PeriodDetail);

      if (auditRes.ok) {
        const auditJson = await auditRes.json();
        setAudit((auditJson.logs ?? []) as AuditRow[]);
      }
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر جلب الفترة');
    } finally {
      setLoading(false);
    }
  }, [clinicId, periodId, authHeaders]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (action: 'approve' | 'pay' | 'cancel') => {
    if (!clinicId) return;
    if (action === 'cancel' && !window.confirm('إلغاء الفترة؟ ستعود السلف غير المكتملة إلى قائمة الانتظار.')) return;
    setBusy(true);
    setMessage(null);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/clinic/payroll/periods/${periodId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ clinic_id: clinicId, action }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'فشل الإجراء');
      setMessage(
        action === 'approve'
          ? 'تم اعتماد الفترة'
          : action === 'pay'
            ? 'تم دفع الفترة وتسجيلها في السجل المالي'
            : 'تم إلغاء الفترة'
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل الإجراء');
    } finally {
      setBusy(false);
    }
  };

  const unlock = async (reason: string) => {
    if (!clinicId) return;
    setBusy(true);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/clinic/payroll/periods/${periodId}/unlock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ clinic_id: clinicId, reason }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'تعذر إعادة الفتح');
      setUnlockOpen(false);
      setMessage('تمت إعادة الفتح — يمكنك إعادة التوليد ثم الاعتماد');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر إعادة الفتح');
    } finally {
      setBusy(false);
    }
  };

  const addAdjustment = async (payload: { type: 'bonus' | 'deduction'; amount: number; reason: string }) => {
    if (!clinicId || !adjustFor) return;
    setBusy(true);
    try {
      const headers = await authHeaders();
      const res = await fetch('/api/clinic/payroll/adjustments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          clinic_id: clinicId,
          period_id: periodId,
          provider_id: adjustFor.provider_id,
          type: payload.type,
          amount: payload.amount,
          reason: payload.reason,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'تعذر حفظ التسجيل');
      setAdjustFor(null);
      setMessage('تم تسجيل الحركة — أعد التوليد لتظهر في القسيمة');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر حفظ التسجيل');
    } finally {
      setBusy(false);
    }
  };

  const print = async (slip: PayslipRow) => {
    if (!clinicId) return;
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/clinic/payroll/payslips/${slip.id}?clinic_id=${clinicId}`, { headers });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'تعذر تحميل القسيمة');
      printPayslip(json.data, clinicName);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل القسيمة');
    }
  };

  const kpis = useMemo(() => {
    const p = detail?.period;
    return [
      ['الأساسي', n(p?.total_base), 'text-slate-100'],
      ['العمولة', n(p?.total_commission), 'text-slate-100'],
      ['المكافآت', n(p?.total_bonuses), 'text-emerald-300'],
      ['الخصومات', n(p?.total_deductions), 'text-rose-300'],
      ['السلف', n(p?.total_advances), 'text-amber-300'],
      ['الصافي', n(p?.total_net), 'text-cyan-300'],
    ] as const;
  }, [detail]);

  if (!isConfigured && !clinicLoading) {
    return <p className="text-sm text-slate-400">Supabase غير مهيأ في هذه البيئة.</p>;
  }

  const period = detail?.period;
  const currency = period?.currency ?? 'ILS';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">
            رواتب {period ? periodMonthLabel(period.period_month) : '…'}
          </h1>
          {period && (
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-slate-400">
              <StatusBadge status={period.status} />
              {(period.unlock_count ?? 0) > 0 && (
                <span className="text-xs text-amber-400">
                  أُعيد فتحها {period.unlock_count} مرة{period.unlock_reason ? ` — ${period.unlock_reason}` : ''}
                </span>
              )}
            </div>
          )}
        </div>

        {canManage && period && (
          <div className="flex flex-wrap gap-2">
            {period.status === 'draft' && (
              <button
                type="button"
                disabled={busy}
                onClick={() => act('approve')}
                className="rounded-full bg-amber-500 px-5 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50"
              >
                اعتماد الفترة
              </button>
            )}
            {period.status === 'approved' && (
              <button
                type="button"
                disabled={busy}
                onClick={() => act('pay')}
                className="rounded-full bg-emerald-500 px-5 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50"
              >
                تسجيل الدفع
              </button>
            )}
            {period.status !== 'cancelled' && period.status !== 'paid' && (
              <button
                type="button"
                disabled={busy}
                onClick={() => act('cancel')}
                className="rounded-full border border-rose-500/50 px-4 py-2 text-sm text-rose-300 disabled:opacity-50"
              >
                إلغاء
              </button>
            )}
            {isOwner && (period.status === 'approved' || period.status === 'paid') && (
              <button
                type="button"
                disabled={busy}
                onClick={() => setUnlockOpen(true)}
                className="rounded-full border border-amber-500/50 px-4 py-2 text-sm text-amber-300 disabled:opacity-50"
              >
                إعادة فتح (مالك)
              </button>
            )}
          </div>
        )}
      </div>

      {clinicError && <p className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-sm text-rose-300">{clinicError}</p>}
      {error && <p className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-sm text-rose-300">{error}</p>}
      {message && <p className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-300">{message}</p>}

      {loading ? (
        <div className="h-40 animate-pulse rounded-2xl bg-slate-800/60" />
      ) : !detail ? (
        <p className="rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-8 text-center text-sm text-slate-500">
          الفترة غير موجودة أو لا تملك صلاحية عرضها.
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
            {kpis.map(([label, value, tone]) => (
              <div key={label} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                <p className="text-xs text-slate-500">{label}</p>
                <p className={`mt-1 text-lg font-semibold ${tone}`}>{value.toFixed(2)}</p>
              </div>
            ))}
          </div>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-slate-100">قسائم الرواتب ({detail.payslips.length})</h2>
            <PayslipTable
              payslips={detail.payslips}
              currency={currency}
              onPrint={print}
              canAdjust={canManage && period?.status === 'draft'}
              onAdjust={setAdjustFor}
            />
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-slate-100">سجل الرواتب</h2>
            {audit.length === 0 ? (
              <p className="rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-6 text-center text-sm text-slate-500">
                لا توجد حركات مسجّلة بعد.
              </p>
            ) : (
              <ul className="space-y-2">
                {audit.map((row) => (
                  <li
                    key={row.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-3 text-sm"
                  >
                    <span className="text-slate-200">{ACTION_AR[row.action] ?? row.action}</span>
                    <span className="text-xs text-slate-500">
                      {row.actor_email ?? '—'} · {new Date(row.created_at).toLocaleString('ar')}
                    </span>
                    {row.details && typeof row.details.reason === 'string' && row.details.reason && (
                      <span className="w-full text-xs text-amber-400">السبب: {row.details.reason}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <UnlockDialog open={unlockOpen} busy={busy} onClose={() => setUnlockOpen(false)} onSubmit={unlock} />
      <AdjustmentDialog
        open={Boolean(adjustFor)}
        busy={busy}
        providerName={adjustFor?.provider_name ?? ''}
        onClose={() => setAdjustFor(null)}
        onSubmit={addAdjustment}
      />
    </div>
  );
}

