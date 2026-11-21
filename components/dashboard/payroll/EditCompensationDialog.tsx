'use client';

import { useState } from 'react';
import {
  isFirstOfMonth,
  minimumRevisionDate,
  type CompensationLite,
} from './compensationUi';

export type EditCompensationPayload = {
  commission_percent: number | null;
  fixed_monthly_amount: number | null;
  effective_from: string;
};

export default function EditCompensationDialog({
  compensation,
  providerName,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  compensation: CompensationLite;
  providerName: string;
  busy: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (payload: EditCompensationPayload) => Promise<void> | void;
}) {
  const minimumDate = minimumRevisionDate(compensation.effective_from);
  const [commissionPercent, setCommissionPercent] = useState(
    compensation.commission_percent == null ? '' : String(compensation.commission_percent),
  );
  const [fixedMonthlyAmount, setFixedMonthlyAmount] = useState(
    compensation.fixed_monthly_amount == null ? '' : String(compensation.fixed_monthly_amount),
  );
  const [effectiveFrom, setEffectiveFrom] = useState(minimumDate);

  const needsCommission = compensation.model === 'commission_percentage' || compensation.model === 'hybrid';
  const needsAmount = compensation.model === 'fixed_monthly' || compensation.model === 'hybrid';
  const commissionValue = Number(commissionPercent);
  const amountValue = Number(fixedMonthlyAmount);
  const dateValid = isFirstOfMonth(effectiveFrom) && effectiveFrom >= minimumDate;
  const commissionValid = !needsCommission || (
    commissionPercent.trim() !== '' &&
    Number.isFinite(commissionValue) &&
    commissionValue >= 0 &&
    commissionValue <= 100
  );
  const amountValid = !needsAmount || (
    fixedMonthlyAmount.trim() !== '' &&
    Number.isFinite(amountValue) &&
    amountValue >= 0
  );
  const valid = dateValid && commissionValid && amountValid;
  const inputClass =
    'mt-2 w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-2.5 text-slate-100 outline-none focus:border-cyan-500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <h3 className="text-lg font-semibold text-slate-100">تعديل راتب {providerName}</h3>
        <p className="mt-1 text-xs text-slate-400">
          سيُحفظ التعديل كسجل جديد، وتبقى القسائم السابقة دون تغيير.
        </p>

        {needsAmount && (
          <label className="mt-4 block text-sm text-slate-300">
            المبلغ الشهري
            <input
              type="number"
              min="0"
              step="0.01"
              value={fixedMonthlyAmount}
              onChange={(event) => setFixedMonthlyAmount(event.target.value)}
              className={inputClass}
            />
          </label>
        )}

        {needsCommission && (
          <label className="mt-3 block text-sm text-slate-300">
            النسبة من الإيراد (0–100)
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={commissionPercent}
              onChange={(event) => setCommissionPercent(event.target.value)}
              className={inputClass}
            />
          </label>
        )}

        <label className="mt-3 block text-sm text-slate-300">
          تاريخ السريان
          <input
            type="date"
            min={minimumDate}
            value={effectiveFrom}
            onChange={(event) => setEffectiveFrom(event.target.value)}
            className={inputClass}
          />
        </label>
        {!dateValid && (
          <span className="mt-1 block text-xs text-rose-300">
            يجب أن يكون تاريخ السريان أول يوم من الشهر القادم أو شهر لاحق.
          </span>
        )}

        {error && (
          <p className="mt-4 rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-xs text-rose-300">
            {error}
          </p>
        )}

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            disabled={busy || !valid}
            onClick={() => onSubmit({
              commission_percent: needsCommission ? commissionValue : null,
              fixed_monthly_amount: needsAmount ? amountValue : null,
              effective_from: effectiveFrom,
            })}
            className="rounded-full bg-cyan-500 px-5 py-2 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? 'جارٍ الحفظ…' : 'حفظ التعديل'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-300 disabled:opacity-50"
          >
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );
}
