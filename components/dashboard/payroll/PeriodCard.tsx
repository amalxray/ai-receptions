'use client';

import Link from 'next/link';
import StatusBadge from './StatusBadge';

export type PayrollPeriodRow = {
  id: string;
  period_month: string;
  status: string;
  total_base: number | string;
  total_commission: number | string;
  total_bonuses: number | string;
  total_deductions: number | string;
  total_advances: number | string;
  total_net: number | string;
  currency: string | null;
  approved_at: string | null;
  paid_at: string | null;
  unlock_count?: number | null;
};

const n = (value: number | string | null | undefined) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** Arabic month label from the canonical 'YYYY-MM' key. */
export function periodMonthLabel(periodMonth: string): string {
  const [year, month] = periodMonth.split('-');
  const names = [
    'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
  ];
  const idx = Number(month) - 1;
  if (!year || idx < 0 || idx > 11) return periodMonth;
  return `${names[idx]} ${year}`;
}

export default function PeriodCard({
  period,
  href,
}: {
  period: PayrollPeriodRow;
  href: string;
}) {
  const currency = period.currency ?? 'ILS';
  return (
    <Link
      href={href}
      className="block rounded-2xl border border-slate-800 bg-slate-900/70 p-5 transition hover:border-cyan-500/40 hover:bg-slate-900"
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-slate-100">{periodMonthLabel(period.period_month)}</h3>
        <StatusBadge status={period.status} />
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-slate-500">الأساسي</dt>
          <dd className="text-slate-200">{n(period.total_base).toFixed(2)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">العمولة</dt>
          <dd className="text-slate-200">{n(period.total_commission).toFixed(2)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">السلف</dt>
          <dd className="text-slate-200">{n(period.total_advances).toFixed(2)}</dd>
        </div>
      </dl>

      <p className="mt-4 text-sm text-slate-400">
        الصافي: <span className="font-semibold text-emerald-300">{n(period.total_net).toFixed(2)} {currency}</span>
      </p>
      {(period.unlock_count ?? 0) > 0 && (
        <p className="mt-1 text-xs text-amber-400">أُعيد فتحها {period.unlock_count} مرة</p>
      )}
    </Link>
  );
}
