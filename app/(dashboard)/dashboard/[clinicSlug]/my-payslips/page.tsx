'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSupabaseConfig } from '@/lib/useSupabaseConfig';
import { useClinicContext } from '@/lib/useClinicContext';
import { periodMonthLabel } from '@/components/dashboard/payroll/PeriodCard';
import StatusBadge from '@/components/dashboard/payroll/StatusBadge';
import { printPayslip } from '@/components/dashboard/payroll/printPayslip';

type SelfPayslip = {
  id: string;
  period_month: string | null;
  period_status: string | null;
  paid_at: string | null;
  base_amount: number | string;
  commission_amount: number | string;
  bonuses_amount: number | string;
  deductions_amount: number | string;
  advances_amount: number | string;
  net_amount: number | string;
  currency: string | null;
};

type SelfAdvance = {
  id: string;
  amount: number | string;
  status: string;
  issued_at: string;
  installment_count: number | null;
  installment_amount: number | string | null;
  months_paid: number | null;
};

const n = (value: number | string | null | undefined) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Employee self-service. The API resolves "me" from the session (providers.user_id)
 * and returns only APPROVED/PAID payslips — there is no provider id in the
 * request, so nobody can read someone else's pay by editing it.
 */
export default function MyPayslipsPage() {
  const { isConfigured } = useSupabaseConfig();
  const { clinicId, clinicName, authHeaders, loading: clinicLoading } = useClinicContext();

  const [payslips, setPayslips] = useState<SelfPayslip[]>([]);
  const [advances, setAdvances] = useState<SelfAdvance[]>([]);
  const [linked, setLinked] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!clinicId) return;
    setLoading(true);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/clinic/payroll/my?clinic_id=${clinicId}`, { headers });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'تعذر جلب قسائمك');
      setPayslips((json.data?.payslips ?? []) as SelfPayslip[]);
      setAdvances((json.data?.advances ?? []) as SelfAdvance[]);
      setLinked(Boolean(json.data?.provider_id));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر جلب قسائمك');
    } finally {
      setLoading(false);
    }
  }, [clinicId, authHeaders]);

  useEffect(() => {
    void load();
  }, [load]);

  const download = async (slip: SelfPayslip) => {
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

  if (!isConfigured && !clinicLoading) {
    return <p className="text-sm text-slate-400">Supabase غير مهيأ في هذه البيئة.</p>;
  }


  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">قسائمي</h1>
        <p className="mt-1 text-sm text-slate-400">
          رواتبك المعتمدة أو المدفوعة فقط. يمكنك حفظ أي قسيمة PDF من نافذة الطباعة.
        </p>
      </div>

      {error && <p className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-sm text-rose-300">{error}</p>}

      {loading || clinicLoading ? (
        <div className="h-40 animate-pulse rounded-2xl bg-slate-800/60" />
      ) : !linked ? (
        <p className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-6 text-sm text-amber-300">
          حسابك غير مرتبط بملف موظف في هذه العيادة. اطلب من مدير العيادة ربط بريدك بملفك الوظيفي.
        </p>
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-slate-100">قسائم الرواتب ({payslips.length})</h2>
            {payslips.length === 0 ? (
              <p className="rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-8 text-center text-sm text-slate-500">
                لا توجد قسائم معتمدة بعد.
              </p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {payslips.map((slip) => (
                  <div key={slip.id} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-semibold text-slate-100">
                        {slip.period_month ? periodMonthLabel(slip.period_month) : '—'}
                      </h3>
                      <StatusBadge status={slip.period_status ?? 'draft'} />
                    </div>
                    <dl className="mt-3 space-y-1 text-sm">
                      <div className="flex justify-between"><dt className="text-slate-500">الأساسي</dt><dd className="text-slate-200">{n(slip.base_amount).toFixed(2)}</dd></div>
                      <div className="flex justify-between"><dt className="text-slate-500">العمولة</dt><dd className="text-slate-200">{n(slip.commission_amount).toFixed(2)}</dd></div>
                      <div className="flex justify-between"><dt className="text-slate-500">مكافآت</dt><dd className="text-emerald-300">{n(slip.bonuses_amount).toFixed(2)}</dd></div>
                      <div className="flex justify-between"><dt className="text-slate-500">خصومات</dt><dd className="text-rose-300">{n(slip.deductions_amount).toFixed(2)}</dd></div>
                      <div className="flex justify-between"><dt className="text-slate-500">سلف</dt><dd className="text-amber-300">{n(slip.advances_amount).toFixed(2)}</dd></div>
                      <div className="flex justify-between border-t border-slate-800 pt-2">
                        <dt className="text-slate-400">الصافي</dt>
                        <dd className="font-semibold text-cyan-300">
                          {n(slip.net_amount).toFixed(2)} {slip.currency ?? 'ILS'}
                        </dd>
                      </div>
                    </dl>
                    <button
                      type="button"
                      onClick={() => download(slip)}
                      className="mt-4 rounded-full border border-slate-700 px-4 py-2 text-xs text-slate-200 hover:border-cyan-500/50"
                    >
                      تحميل PDF
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-slate-100">سلفي ({advances.length})</h2>
            {advances.length === 0 ? (
              <p className="rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-6 text-center text-sm text-slate-500">
                لا توجد سلف.
              </p>
            ) : (
              <ul className="space-y-2">
                {advances.map((advance) => {
                  const count = Math.max(1, n(advance.installment_count));
                  const paid = Math.min(count, n(advance.months_paid));
                  return (
                    <li
                      key={advance.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-3 text-sm"
                    >
                      <span className="text-slate-100">{n(advance.amount).toFixed(2)} · {advance.issued_at}</span>
                      <span className="text-xs text-slate-400">
                        {count > 1 ? `${paid}/${count} أقساط` : 'قسط واحد'} · القسط{' '}
                        {n(advance.installment_amount ?? n(advance.amount) / count).toFixed(2)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
