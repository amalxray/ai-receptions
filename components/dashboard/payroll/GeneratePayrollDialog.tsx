'use client';

import { useState } from 'react';

/** Generate (or regenerate) a draft payroll period for a month. */
export default function GeneratePayrollDialog({
  open,
  busy,
  onClose,
  onSubmit,
}: {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onSubmit: (periodMonth: string) => Promise<void> | void;
}) {
  const now = new Date();
  const [month, setMonth] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <h3 className="text-lg font-semibold text-slate-100">توليد فترة رواتب</h3>
        <p className="mt-1 text-xs text-slate-500">
          تُبنى القسائم من عقود التعويضات والإيراد المُنسب وسلف الشهر. إعادة التوليد متاحة للمسودة فقط.
        </p>
        <label className="mt-4 block text-sm text-slate-300">
          الشهر
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="mt-2 w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-2.5 text-slate-100 outline-none focus:border-cyan-500"
          />
        </label>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            disabled={busy || !/^\d{4}-\d{2}$/.test(month)}
            onClick={() => onSubmit(month)}
            className="rounded-full bg-cyan-500 px-5 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50"
          >
            {busy ? 'جارٍ التوليد…' : 'توليد'}
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
