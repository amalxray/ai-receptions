'use client';

import { useState } from 'react';

export type ProviderOption = { id: string; name: string };

/**
 * New advance. Phase 2: the amount is recovered over 1..12 monthly installments
 * — the per-installment figure shown here is what payroll will deduct each
 * month, and it is stored server-side so a later edit cannot change history.
 */
export default function AdvanceDialog({
  open,
  busy,
  providers,
  onClose,
  onSubmit,
}: {
  open: boolean;
  busy: boolean;
  providers: ProviderOption[];
  onClose: () => void;
  onSubmit: (payload: {
    provider_id: string;
    amount: number;
    reason: string;
    installment_count: number;
  }) => Promise<void> | void;
}) {
  const [providerId, setProviderId] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [installments, setInstallments] = useState(1);

  if (!open) return null;

  const amountValue = Number(amount);
  const perInstallment = amountValue > 0 && installments > 0 ? amountValue / installments : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <h3 className="text-lg font-semibold text-slate-100">سلفة جديدة</h3>

        <label className="mt-4 block text-sm text-slate-300">
          الموظف
          <select
            value={providerId}
            onChange={(e) => setProviderId(e.target.value)}
            className="mt-2 w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-2.5 text-slate-100 outline-none focus:border-cyan-500"
          >
            <option value="">— اختر —</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>

        <label className="mt-3 block text-sm text-slate-300">
          المبلغ الإجمالي
          <input
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="mt-2 w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-2.5 text-slate-100 outline-none focus:border-cyan-500"
          />
        </label>

        <label className="mt-3 block text-sm text-slate-300">
          عدد الأقساط الشهرية (1–12)
          <input
            type="range"
            min="1"
            max="12"
            value={installments}
            onChange={(e) => setInstallments(Number(e.target.value))}
            className="mt-2 w-full accent-cyan-500"
          />
          <span className="mt-1 block text-xs text-slate-400">
            {installments} قسط · القسط الشهري:{' '}
            <span className="font-semibold text-cyan-300">{perInstallment.toFixed(2)}</span>
          </span>
        </label>

        <label className="mt-3 block text-sm text-slate-300">
          السبب (اختياري)
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="mt-2 w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-2.5 text-slate-100 outline-none focus:border-cyan-500"
          />
        </label>

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            disabled={busy || !providerId || !(amountValue > 0)}
            onClick={() =>
              onSubmit({
                provider_id: providerId,
                amount: amountValue,
                reason,
                installment_count: installments,
              })
            }
            className="rounded-full bg-cyan-500 px-5 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50"
          >
            {busy ? 'جارٍ الحفظ…' : 'إضافة السلفة'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-300"
          >
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );
}
