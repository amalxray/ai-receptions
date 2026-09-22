'use client';

import { useState } from 'react';

/**
 * Unlock (owner only) — returns a finalized period to draft so it can be
 * regenerated. The reason is mandatory (≥5 chars) because it is stored on the
 * period and written to the payroll audit trail verbatim.
 */
export default function UnlockDialog({
  open,
  busy,
  onClose,
  onSubmit,
}: {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void> | void;
}) {
  const [reason, setReason] = useState('');
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
      <div className="w-full max-w-md rounded-2xl border border-amber-500/40 bg-slate-900 p-5">
        <h3 className="text-lg font-semibold text-amber-300">إعادة فتح الفترة (للمالك فقط)</h3>
        <p className="mt-1 text-xs text-slate-400">
          ستتحول الفترة إلى مسودة ويمكن إعادة توليدها. العملية مُسجَّلة بالكامل، ولا تحذف أي حركة مالية سابقة.
        </p>
        <label className="mt-4 block text-sm text-slate-300">
          السبب (5 أحرف على الأقل)
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="mt-2 w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-2.5 text-slate-100 outline-none focus:border-amber-500"
          />
        </label>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            disabled={busy || reason.trim().length < 5}
            onClick={() => onSubmit(reason.trim())}
            className="rounded-full bg-amber-500 px-5 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50"
          >
            {busy ? 'جارٍ التنفيذ…' : 'إعادة الفتح'}
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
