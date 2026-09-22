'use client';

export type PayslipRow = {
  id: string;
  provider_id: string;
  provider_name?: string | null;
  base_amount: number | string;
  commission_amount: number | string;
  bonuses_amount: number | string;
  deductions_amount: number | string;
  advances_amount: number | string;
  revenue_attributed?: number | string | null;
  net_amount: number | string;
  currency: string | null;
  breakdown?: { advance_details?: Array<{ advance_id: string; amount: number; installment_number: number; installments: number }> } | null;
};

const n = (value: number | string | null | undefined) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export default function PayslipTable({
  payslips,
  currency,
  onPrint,
  onAdjust,
  canAdjust,
}: {
  payslips: PayslipRow[];
  currency: string;
  onPrint: (payslip: PayslipRow) => void;
  onAdjust?: (payslip: PayslipRow) => void;
  canAdjust?: boolean;
}) {
  if (payslips.length === 0) {
    return (
      <p className="rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-6 text-center text-sm text-slate-500">
        لا توجد قسائم في هذه الفترة بعد.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/70">
      <table className="w-full min-w-[720px] text-right text-sm">
        <thead className="bg-slate-950/60 text-xs text-slate-400">
          <tr>
            <th className="px-4 py-3">الموظف</th>
            <th className="px-4 py-3">الأساسي</th>
            <th className="px-4 py-3">العمولة</th>
            <th className="px-4 py-3">مكافآت</th>
            <th className="px-4 py-3">خصومات</th>
            <th className="px-4 py-3">سلف</th>
            <th className="px-4 py-3">الصافي</th>
            <th className="px-4 py-3">إجراءات</th>
          </tr>
        </thead>
        <tbody>
          {payslips.map((slip) => {
            const installments = slip.breakdown?.advance_details ?? [];
            return (
              <tr key={slip.id} className="border-t border-slate-800/70">
                <td className="px-4 py-3 text-slate-100">
                  {slip.provider_name ?? '—'}
                  {installments.length > 0 && (
                    <span className="block text-xs text-slate-500">
                      {installments
                        .map((line) => `قسط ${line.installment_number}/${line.installments}: ${n(line.amount).toFixed(2)}`)
                        .join(' · ')}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-300">{n(slip.base_amount).toFixed(2)}</td>
                <td className="px-4 py-3 text-slate-300">{n(slip.commission_amount).toFixed(2)}</td>
                <td className="px-4 py-3 text-emerald-300">{n(slip.bonuses_amount).toFixed(2)}</td>
                <td className="px-4 py-3 text-rose-300">{n(slip.deductions_amount).toFixed(2)}</td>
                <td className="px-4 py-3 text-amber-300">{n(slip.advances_amount).toFixed(2)}</td>
                <td className="px-4 py-3 font-semibold text-slate-100">
                  {n(slip.net_amount).toFixed(2)} {slip.currency ?? currency}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onPrint(slip)}
                      className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-200 hover:border-cyan-500/50"
                    >
                      تحميل PDF
                    </button>
                    {canAdjust && onAdjust && (
                      <button
                        type="button"
                        onClick={() => onAdjust(slip)}
                        className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-200 hover:border-amber-500/50"
                      >
                        مكافأة / خصم
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
