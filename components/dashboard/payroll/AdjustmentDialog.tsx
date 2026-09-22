'use client';

import { useState } from 'react';

/** Bonus / deduction on a draft period's payslip (reason is required by the API). */
export default function AdjustmentDialog({
  open,
  busy,
  providerName,
  onClose,
  onSubmit,
}: {
  open: boolean;
  busy: boolean;
  providerName: string;
  onClose: () => void;
  onSubmit: (payload: { type: 'bonus' | 'deduction'; amount: number; reason: string }) => Promise<void> | void;
}) {
  const [type, setType] = useState<'bonus' | 'deduction'>('bonus');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');

  if (!open) return null;
  const value = Number(amount);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <h3 className="text-lg font-semibold text-slate-100">تسجيل مكافأة / خصم — {providerName}</h3>

        <div className="mt-4 flex gap-2">
          {(['bonus', 'deduction'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setType(option)}
              className={`rounded-full px-4 py-2 text-sm ${
                type === option
                  ? 'bg-cyan-500 font-semibold text-slate-950'
                  : 'border border-slate-700 text-slate-300'
              }`}
            >
              {option === 'bonus' ? 'مكافأة' : 'خصم'}
            </button>
          ))}
        </div>

        <label className="mt-4 block text-sm text-slate-300">
          المبلغ
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
          السبب (مطلوب)
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="mt-2 w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-2.5 text-slate-100 outline-none focus:border-cyan-500"
          />
        </label>

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            disabled={busy || !(value > 0) || reason.trim().length === 0}
            onClick={() => onSubmit({ type, amount: value, reason: reason.trim() })}
            className="rounded-full bg-cyan-500 px-5 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50"
          >
            {busy ? 'جارٍ الحفظ…' : 'حفظ'}
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
