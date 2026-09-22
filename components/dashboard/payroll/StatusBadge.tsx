'use client';

// Payroll status pill — one place decides the Arabic wording + tone so the list,
// the detail page and the audit log never disagree about what "مسودة" means.

export type PayrollStatus = 'draft' | 'approved' | 'paid' | 'cancelled';

const LABELS: Record<PayrollStatus, string> = {
  draft: 'مسودة',
  approved: 'معتمدة',
  paid: 'مدفوعة',
  cancelled: 'ملغاة',
};

const TONES: Record<PayrollStatus, string> = {
  draft: 'border-slate-700 bg-slate-800 text-slate-300',
  approved: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
  paid: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  cancelled: 'border-rose-500/40 bg-rose-500/10 text-rose-300',
};

export default function StatusBadge({ status }: { status: string }) {
  const key = (['draft', 'approved', 'paid', 'cancelled'] as const).find((s) => s === status) ?? 'draft';
  return (
    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${TONES[key]}`}>
      {LABELS[key]}
    </span>
  );
}
