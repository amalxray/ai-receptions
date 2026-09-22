'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSupabaseConfig } from '@/lib/useSupabaseConfig';
import { useClinicContext } from '@/lib/useClinicContext';
import { tenantDashboardUrl } from '@/lib/services/dashboardPaths';
import AdvanceDialog, { type ProviderOption } from '@/components/dashboard/payroll/AdvanceDialog';

type AdvanceRow = {
  id: string;
  provider_id: string;
  provider_name?: string | null;
  amount: number | string;
  reason: string | null;
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

const STATUS_AR: Record<string, string> = {
  pending: 'قائمة',
  deducted: 'مستقطعة',
  cancelled: 'ملغاة',
};

/** Advances: list with installment progress + create (1..12 installments). */
export default function PayrollAdvancesPage() {
  const { isConfigured } = useSupabaseConfig();
  const { clinicId, clinicSlug, role, authHeaders, loading: clinicLoading } = useClinicContext();

  const [advances, setAdvances] = useState<AdvanceRow[]>([]);
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const canManage = role === 'owner' || role === 'manager' || role === 'accountant';

  const load = useCallback(async () => {
    if (!clinicId) return;
    setLoading(true);
    try {
      const headers = await authHeaders();
      const [advRes, provRes] = await Promise.all([
        fetch(`/api/clinic/payroll/advances?clinic_id=${clinicId}`, { headers }),
        fetch(`/api/clinic/providers?clinic_id=${clinicId}`, { headers }),
      ]);
      const advJson = await advRes.json();
      if (!advRes.ok) throw new Error(advJson.error || 'تعذر جلب السلف');
      setAdvances((advJson.data ?? []) as AdvanceRow[]);

      if (provRes.ok) {
        const provJson = await provRes.json();
        setProviders(
          (provJson.data ?? [])
            .filter((p: { deleted_at?: string | null }) => !p.deleted_at)
            .map((p: { id: string; name: string | null }) => ({ id: p.id, name: p.name ?? '—' }))
        );
      }
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر جلب السلف');
    } finally {
      setLoading(false);
    }
  }, [clinicId, authHeaders]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async (payload: {
    provider_id: string;
    amount: number;
    reason: string;
    installment_count: number;
  }) => {
    if (!clinicId) return;
    setBusy(true);
    try {
      const headers = await authHeaders();
      const res = await fetch('/api/clinic/payroll/advances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ clinic_id: clinicId, ...payload }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'تعذر إنشاء السلفة');
      setDialogOpen(false);
      setMessage(
        payload.installment_count > 1
          ? `تم إنشاء السلفة على ${payload.installment_count} أقساط شهرية`
          : 'تم إنشاء السلفة'
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر إنشاء السلفة');
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
          <h1 className="text-2xl font-semibold text-white">سلف الموظفين</h1>
          <p className="mt-1 text-sm text-slate-400">
            سلفة واحدة قد تُستقطع على عدة أشهر؛ كل شهر يُسجَّل قسطه في سجل الرواتب.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href={tenantDashboardUrl(clinicSlug, 'payroll')}
            className="rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:border-cyan-500/50"
          >
            الرواتب
          </Link>
          {canManage && (
            <button
              type="button"
              onClick={() => setDialogOpen(true)}
              className="rounded-full bg-cyan-500 px-5 py-2 text-sm font-semibold text-slate-950"
            >
              سلفة جديدة
            </button>
          )}
        </div>
      </div>

      {error && <p className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-sm text-rose-300">{error}</p>}
      {message && <p className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-300">{message}</p>}

      {loading || clinicLoading ? (
        <div className="h-40 animate-pulse rounded-2xl bg-slate-800/60" />
      ) : advances.length === 0 ? (
        <p className="rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-8 text-center text-sm text-slate-500">
          لا توجد سلف مسجّلة.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/70">
          <table className="w-full min-w-[720px] text-right text-sm">
            <thead className="bg-slate-950/60 text-xs text-slate-400">
              <tr>
                <th className="px-4 py-3">الموظف</th>
                <th className="px-4 py-3">المبلغ</th>
                <th className="px-4 py-3">القسط الشهري</th>
                <th className="px-4 py-3">الأقساط</th>
                <th className="px-4 py-3">التاريخ</th>
                <th className="px-4 py-3">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {advances.map((advance) => {
                const count = Math.max(1, n(advance.installment_count));
                const paid = Math.min(count, n(advance.months_paid));
                const perInstallment = advance.installment_amount != null
                  ? n(advance.installment_amount)
                  : n(advance.amount) / count;
                return (
                  <tr key={advance.id} className="border-t border-slate-800/70">
                    <td className="px-4 py-3 text-slate-100">
                      {advance.provider_name ?? '—'}
                      {advance.reason && <span className="block text-xs text-slate-500">{advance.reason}</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-300">{n(advance.amount).toFixed(2)}</td>
                    <td className="px-4 py-3 text-cyan-300">{perInstallment.toFixed(2)}</td>
                    <td className="px-4 py-3 text-slate-300">
                      {count > 1 ? `${paid}/${count} مدفوع` : paid >= 1 ? 'كاملة' : '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-400">{advance.issued_at}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300">
                        {STATUS_AR[advance.status] ?? advance.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <AdvanceDialog
        open={dialogOpen}
        busy={busy}
        providers={providers}
        onClose={() => setDialogOpen(false)}
        onSubmit={create}
      />
    </div>
  );
}
