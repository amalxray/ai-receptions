'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSupabaseConfig } from '@/lib/useSupabaseConfig';
import { useClinicContext } from '@/lib/useClinicContext';
import { tenantDashboardUrl } from '@/lib/services/dashboardPaths';
import PeriodCard, { type PayrollPeriodRow } from '@/components/dashboard/payroll/PeriodCard';
import GeneratePayrollDialog from '@/components/dashboard/payroll/GeneratePayrollDialog';

const n = (value: number | string | null | undefined) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** Payroll periods: list, yearly summary, and draft generation. */
export default function PayrollPage() {
  const { isConfigured } = useSupabaseConfig();
  const { clinicId, clinicSlug, role, authHeaders, loading: clinicLoading, error: clinicError } = useClinicContext();

  const [periods, setPeriods] = useState<PayrollPeriodRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [generateOpen, setGenerateOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const isAdmin = role === 'owner' || role === 'manager' || role === 'accountant';

  const load = useCallback(async () => {
    if (!clinicId) return;
    setLoading(true);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/clinic/payroll/periods?clinic_id=${clinicId}`, { headers });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'تعذر جلب فترات الرواتب');
      setPeriods((json.data ?? []) as PayrollPeriodRow[]);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر جلب فترات الرواتب');
    } finally {
      setLoading(false);
    }
  }, [clinicId, authHeaders]);

  useEffect(() => {
    void load();
  }, [load]);

  const years = useMemo(() => {
    const set = new Set(periods.map((p) => p.period_month.slice(0, 4)));
    set.add(String(new Date().getFullYear()));
    return Array.from(set).sort().reverse();
  }, [periods]);

  const visible = useMemo(
    () => periods.filter((p) => p.period_month.startsWith(year)),
    [periods, year]
  );

  const yearTotals = useMemo(
    () =>
      visible.reduce(
        (acc, p) => ({
          net: acc.net + n(p.total_net),
          advances: acc.advances + n(p.total_advances),
          commissions: acc.commissions + n(p.total_commission),
        }),
        { net: 0, advances: 0, commissions: 0 }
      ),
    [visible]
  );

  const generate = async (periodMonth: string) => {
    if (!clinicId) return;
    setBusy(true);
    setMessage(null);
    try {
      const headers = await authHeaders();
      const res = await fetch('/api/clinic/payroll/periods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ clinic_id: clinicId, period_month: periodMonth }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'تعذر توليد الفترة');
      setMessage(`تم توليد فترة ${periodMonth} (${json.data?.breakdown?.length ?? 0} قسيمة)`);
      setGenerateOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر توليد الفترة');
    } finally {
      setBusy(false);
    }
  };

  if (!isConfigured && !clinicLoading) {
    return <p className="text-sm text-slate-400">Supabase غير مهيأ في هذه البيئة.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">الرواتب</h1>
          <p className="mt-1 text-sm text-slate-400">
            فترات شهرية: توليد → اعتماد → دفع. السلف تُستقطع تلقائيًا (بالأقساط إن وُجدت).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={tenantDashboardUrl(clinicSlug, 'payroll/advances')}
            className="rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:border-cyan-500/50"
          >
            السلف
          </Link>
          <select
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="rounded-full border border-slate-800 bg-slate-950 px-4 py-2 text-sm text-slate-200"
          >
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setGenerateOpen(true)}
              className="rounded-full bg-cyan-500 px-5 py-2 text-sm font-semibold text-slate-950"
            >
              توليد فترة
            </button>
          )}
        </div>
      </div>

      {clinicError && <p className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-sm text-rose-300">{clinicError}</p>}
      {error && <p className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-sm text-rose-300">{error}</p>}
      {message && <p className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-300">{message}</p>}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
          <p className="text-xs text-slate-500">صافي السنة</p>
          <p className="mt-1 text-xl font-semibold text-emerald-300">{yearTotals.net.toFixed(2)}</p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
          <p className="text-xs text-slate-500">عمولات السنة</p>
          <p className="mt-1 text-xl font-semibold text-slate-100">{yearTotals.commissions.toFixed(2)}</p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
          <p className="text-xs text-slate-500">سلف السنة</p>
          <p className="mt-1 text-xl font-semibold text-amber-300">{yearTotals.advances.toFixed(2)}</p>
        </div>
      </div>

      {loading || clinicLoading ? (
        <div className="h-40 animate-pulse rounded-2xl bg-slate-800/60" />
      ) : visible.length === 0 ? (
        <p className="rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-8 text-center text-sm text-slate-500">
          لا توجد فترات في {year}. ابدأ بـ«توليد فترة».
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((period) => (
            <PeriodCard
              key={period.id}
              period={period}
              href={tenantDashboardUrl(clinicSlug, `payroll/${period.id}`)}
            />
          ))}
        </div>
      )}

      <GeneratePayrollDialog
        open={generateOpen}
        busy={busy}
        onClose={() => setGenerateOpen(false)}
        onSubmit={generate}
      />
    </div>
  );
}

