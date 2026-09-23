'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSupabaseConfig } from '@/lib/useSupabaseConfig';
import { useClinicContext } from '@/lib/useClinicContext';
import CompensationDialog, { type CompensationPayload } from '@/components/dashboard/payroll/CompensationDialog';
import PayrollTabs from '@/components/dashboard/payroll/PayrollTabs';
import {
  COMPENSATION_MODEL_AR,
  PROVIDER_TYPE_AR,
  canManageCompensations,
  compensationSummary,
  mergeCompensationState,
  salaryCounterLine,
  selectableProviders,
  translateCompensationError,
  withoutContractLine,
  type CompensationLite,
  type CompensationRow,
  type NotPayableContract,
  type ProviderLite,
} from '@/components/dashboard/payroll/compensationUi';

/**
 * Per-provider salary contracts. This screen is the missing write surface for
 * `/api/clinic/payroll/compensations` (configuration only, D-P1): without it a
 * provider has no contract and therefore never appears in a payslip.
 *
 * Writing requires owner | accountant (FINANCE_ADMIN_ROLES) — a manager reads
 * the screen and sees the buttons disabled with the reason stated, instead of a
 * button that fails with 403.
 */
export default function PayrollCompensationsPage() {
  const { isConfigured } = useSupabaseConfig();
  const { clinicId, clinicSlug, role, authHeaders, loading: clinicLoading, error: clinicError } = useClinicContext();

  const [rows, setRows] = useState<CompensationRow[]>([]);
  const [notPayable, setNotPayable] = useState<NotPayableContract[]>([]);
  const [providers, setProviders] = useState<ProviderLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorRaw, setErrorRaw] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogProviderId, setDialogProviderId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canManage = canManageCompensations(role);

  /** Sidebar/header entry = free choice; a row entry preselects that provider. */
  const openDialog = (providerId: string | null = null) => {
    setError(null);
    setErrorRaw(null);
    setDialogProviderId(providerId);
    setDialogOpen(true);
  };
  const closeDialog = () => {
    setDialogOpen(false);
    setDialogProviderId(null);
  };

  const load = useCallback(async () => {
    if (!clinicId) return;
    setLoading(true);
    try {
      const headers = await authHeaders();
      const [provRes, compRes] = await Promise.all([
        fetch(`/api/clinic/providers?clinic_id=${clinicId}`, { headers }),
        fetch(`/api/clinic/payroll/compensations?clinic_id=${clinicId}`, { headers }),
      ]);
      const provJson = await provRes.json();
      const compJson = await compRes.json();
      if (!compRes.ok) throw new Error(compJson.error || 'تعذر جلب رواتب المنتسبين');
      if (!provRes.ok) throw new Error(provJson.error || 'تعذر جلب المنتسبين');

      const allProviders = (provJson.data ?? []) as ProviderLite[];
      const compensations = (compJson.data ?? []) as CompensationLite[];
      const merged = mergeCompensationState(allProviders, compensations);

      setProviders(allProviders);
      setRows(merged.rows);
      setNotPayable(merged.notPayable);
      setError(null);
      setErrorRaw(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر جلب رواتب المنتسبين');
      setErrorRaw(null);
    } finally {
      setLoading(false);
    }
  }, [clinicId, authHeaders]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async (payload: CompensationPayload) => {
    if (!clinicId) return;
    setBusy(true);
    setError(null);
    setErrorRaw(null);
    try {
      const headers = await authHeaders();
      const res = await fetch('/api/clinic/payroll/compensations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ clinic_id: clinicId, ...payload }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(translateCompensationError(res.status, json.error));
        setErrorRaw(typeof json.error === 'string' ? json.error : null);
        return;
      }
      const name = providers.find((p) => p.id === payload.provider_id)?.name ?? 'المنتسب';
      setDialogOpen(false);
      setMessage(`تم تسجيل راتب ${name}.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر حفظ الراتب');
    } finally {
      setBusy(false);
    }
  };

  const end = async (row: CompensationRow) => {
    if (!clinicId || !row.compensation) return;
    const name = row.provider.name ?? 'المنتسب';
    if (!window.confirm(`إنهاء راتب ${name}؟ لن يُحسب في القسائم المُولَّدة لاحقاً.`)) return;
    setBusy(true);
    setError(null);
    setErrorRaw(null);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/clinic/payroll/compensations/${row.compensation.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ clinic_id: clinicId, status: 'ended' }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(translateCompensationError(res.status, json.error));
        setErrorRaw(typeof json.error === 'string' ? json.error : null);
        return;
      }
      setMessage(`تم إنهاء راتب ${name}.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر إنهاء الراتب');
    } finally {
      setBusy(false);
    }
  };

  if (!isConfigured && !clinicLoading) {
    return <p className="text-sm text-slate-400">Supabase غير مهيأ في هذه البيئة.</p>;
  }

  const withContract = rows.filter((r) => r.hasActiveContract).length;
  // Providers who could actually receive a payslip but have no contract yet: a
  // soft-deleted provider is excluded from THIS count on purpose (it can never
  // be paid) — it is still listed in the table with the «محذوف» badge.
  const withoutContract = rows.filter((r) => !r.hasActiveContract && !r.isDeleted).length;
  const counterLine = salaryCounterLine(withContract, rows.length);
  const missingLine = withoutContractLine(withoutContract);
  // Only a provider WITHOUT an active contract AND NOT soft-deleted may be
  // offered a new one — the DB keeps a single active contract per provider
  // (partial unique index), so the other choice would be a guaranteed 409.
  const availableProviders = selectableProviders(rows);

  return (
    <div className="space-y-6">
      <PayrollTabs clinicSlug={clinicSlug} active="compensations" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">رواتب المنتسبين</h1>
          <p className="mt-1 text-sm text-slate-400">
            العقد يحدّد كيفية احتساب الراتب في القسائم المُولَّدة لاحقاً. لا يُعدّل قسائم فترة معتمدة أو مدفوعة —
            استخدم «إعادة التوليد» على المسودة، أو «إعادة فتح» الفترة من صفحة الرواتب.
          </p>
          {!loading && rows.length > 0 && (
            <p className="mt-1 text-xs text-slate-500">{counterLine}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!canManage}
            title={canManage ? undefined : 'إضافة الراتب متاحة للمالك والمحاسب فقط'}
            onClick={() => openDialog()}
            className="rounded-full bg-cyan-500 px-5 py-2 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
          >
            إضافة راتب
          </button>
        </div>
      </div>

      {!canManage && (
        <p className="text-xs text-slate-400">
          إضافة/إنهاء الراتب متاح للمالك والمحاسب فقط. يمكنك العرض والطباعة.
        </p>
      )}
      {clinicError && <p className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-sm text-rose-300">{clinicError}</p>}
      {error && (
        <p
          title={errorRaw ?? undefined}
          className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-sm text-rose-300"
        >
          {error}
        </p>
      )}
      {message && <p className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-300">{message}</p>}
      {notPayable.length > 0 && (
        <p className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-300">
          منتسبون غير نشطين لهم راتب مُعرَّف: لن تُنشأ لهم قسائم حتى إعادتهم للنشاط —{' '}
          {notPayable.map((c) => c.providerName ?? 'غير معروف').join('، ')}.
        </p>
      )}
      {withoutContract > 0 && (
        <p className="text-xs text-slate-500">{missingLine}</p>
      )}

      {loading || clinicLoading ? (
        <div className="h-40 animate-pulse rounded-2xl bg-slate-800/60" />
      ) : rows.length === 0 ? (
        <p className="rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-8 text-center text-sm text-slate-500">
          لا يوجد منتسبون في هذه العيادة.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/70">
          <table className="w-full min-w-[820px] text-right text-sm">
            <thead className="bg-slate-950/60 text-xs text-slate-400">
              <tr>
                <th className="px-4 py-3">المنتسب</th>
                <th className="px-4 py-3">النموذج</th>
                <th className="px-4 py-3">الراتب</th>
                <th className="px-4 py-3">تاريخ السريان</th>
                <th className="px-4 py-3">الحالة</th>
                <th className="px-4 py-3">إجراء</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.provider.id}
                  className={
                    row.isDeleted
                      ? 'border-t border-slate-800/70 opacity-70'
                      : 'border-t border-slate-800/70'
                  }
                >
                  <td className="px-4 py-3 text-slate-100">
                    <span className="flex flex-wrap items-center gap-2">
                      <span>{row.provider.name ?? '—'}</span>
                      {row.isDeleted && (
                        <span
                          title="منتسب محذوف — لا يمكن إضافة راتب جديد له"
                          className="rounded-full border border-slate-600 bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300"
                        >
                          محذوف
                        </span>
                      )}
                    </span>
                    {(row.provider.title || row.provider.provider_type) && (
                      <span className="block text-xs text-slate-500">
                        {row.provider.title ?? PROVIDER_TYPE_AR[row.provider.provider_type ?? ''] ?? row.provider.provider_type}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-300">
                    {row.compensation ? COMPENSATION_MODEL_AR[row.compensation.model] ?? row.compensation.model : '—'}
                  </td>
                  <td className="px-4 py-3 text-cyan-300">
                    {row.compensation ? compensationSummary(row.compensation) : '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-400">
                    {row.compensation?.effective_from ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        row.hasActiveContract
                          ? 'rounded-full border border-emerald-500/40 px-3 py-1 text-xs text-emerald-300'
                          : 'rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-400'
                      }
                    >
                      {row.hasActiveContract ? 'له راتب' : 'لا راتب'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {row.compensation ? (
                      <button
                        type="button"
                        disabled={busy || !canManage}
                        title={canManage ? undefined : 'إنهاء الراتب متاح للمالك والمحاسب فقط'}
                        onClick={() => end(row)}
                        className="rounded-full border border-slate-700 px-4 py-1.5 text-xs text-slate-200 hover:border-rose-500/50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        إنهاء العقد
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={busy || !canManage || row.isDeleted}
                        title={
                          !canManage
                            ? 'إضافة الراتب متاحة للمالك والمحاسب فقط'
                            : row.isDeleted
                              ? 'المنتسب محذوف'
                              : undefined
                        }
                        onClick={() => openDialog(row.provider.id)}
                        className="rounded-full bg-cyan-500/10 px-4 py-1.5 text-xs text-cyan-300 hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        إضافة راتب
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Mounted only while open so the form never reopens with stale values. */}
      {dialogOpen && (
        <CompensationDialog
          open
          busy={busy}
          providers={availableProviders}
          initialProviderId={dialogProviderId}
          error={error}
          onClose={closeDialog}
          onSubmit={create}
        />
      )}
    </div>
  );
}
