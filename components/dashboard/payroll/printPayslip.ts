// Payslip printing (client-side). Renders an Arabic RTL document and triggers the
// browser print dialog → "Save as PDF".
//
// WHY NOT a server PDF library: @react-pdf/renderer (and every minimal PDF
// writer) does NOT shape Arabic — letters come out disconnected and in visual
// (LTR) order, which is unreadable for a payslip. It would also add a heavy
// dependency to a build that must stay green on Vercel. Printing the real,
// bidi-correct HTML that the app already renders gives a correct Arabic PDF with
// zero dependencies, the same approach the invoice print uses.

export type PayslipPrintData = {
  id: string;
  period_month?: string | null;
  period_status?: string | null;
  provider_name?: string | null;
  provider_title?: string | null;
  currency?: string | null;
  base_amount?: number | string | null;
  commission_amount?: number | string | null;
  bonuses_amount?: number | string | null;
  deductions_amount?: number | string | null;
  advances_amount?: number | string | null;
  revenue_attributed?: number | string | null;
  net_amount?: number | string | null;
  breakdown?: {
    advance_details?: Array<{ advance_id: string; amount: number; installment_number: number; installments: number }>;
    bonus_lines?: Array<{ amount: number | string; reason?: string | null }>;
    deduction_lines?: Array<{ amount: number | string; reason?: string | null }>;
  } | null;
};

const n = (value: number | string | null | undefined) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const esc = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

function monthLabel(periodMonth: string | null | undefined): string {
  if (!periodMonth) return '—';
  const [year, month] = periodMonth.split('-');
  const idx = Number(month) - 1;
  return idx >= 0 && idx < 12 ? `${MONTHS[idx]} ${year}` : periodMonth;
}

const STATUS_AR: Record<string, string> = {
  draft: 'مسودة',
  approved: 'معتمدة',
  paid: 'مدفوعة',
  cancelled: 'ملغاة',
};

/** Opens a print window for one payslip (admin or self — the API authorizes). */
export function printPayslip(payslip: PayslipPrintData, clinicName?: string | null): void {
  const currency = payslip.currency ?? 'ILS';
  const advanceLines = payslip.breakdown?.advance_details ?? [];
  const bonusLines = payslip.breakdown?.bonus_lines ?? [];
  const deductionLines = payslip.breakdown?.deduction_lines ?? [];

  const rows: Array<[string, string, string]> = [
    ['الأساسي', n(payslip.base_amount).toFixed(2), 'الراتب الثابت المتفق عليه'],
    ['العمولة', n(payslip.commission_amount).toFixed(2), `إيراد مُنسب: ${n(payslip.revenue_attributed).toFixed(2)}`],
    ['مكافآت', n(payslip.bonuses_amount).toFixed(2), bonusLines.map((b) => `${esc(b.reason ?? '')} ${n(b.amount).toFixed(2)}`).join(' · ') || '—'],
    ['خصومات', `-${n(payslip.deductions_amount).toFixed(2)}`, deductionLines.map((d) => `${esc(d.reason ?? '')} ${n(d.amount).toFixed(2)}`).join(' · ') || '—'],
    [
      'سلف',
      `-${n(payslip.advances_amount).toFixed(2)}`,
      advanceLines.length > 0
        ? advanceLines.map((a) => `قسط ${a.installment_number}/${a.installments}: ${n(a.amount).toFixed(2)}`).join(' · ')
        : '—',
    ],
  ];

  const w = window.open('', '_blank', 'width=780,height=900');
  if (!w) return;

  const title = `قسيمة راتب ${monthLabel(payslip.period_month)}`;
  w.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  * { box-sizing: border-box; font-family: 'Segoe UI', Tahoma, Arial, sans-serif; }
  body { max-width: 660px; margin: 24px auto; padding: 32px; color: #111; background: #fff; }
  .brand { font-size: 20px; font-weight: 700; }
  .muted { color: #666; font-size: 12px; }
  .divider { border-top: 2px solid #111; margin: 14px 0; }
  table { width: 100%; border-collapse: collapse; margin-top: 10px; }
  th, td { border: 1px solid #333; padding: 8px 10px; font-size: 14px; text-align: right; }
  th { background: #f2f2f2; }
  .net td { font-weight: 700; background: #f0fdf4; font-size: 16px; }
  .note { margin-top: 22px; font-size: 12px; color: #555; }
</style></head><body>
  <div class="brand">${esc(clinicName ?? 'العيادة')}</div>
  <h1 style="font-size:18px;margin:2px 0 0">${esc(title)}</h1>
  <p class="muted">حالة الفترة: ${esc(STATUS_AR[payslip.period_status ?? ''] ?? '—')} · رقم القسيمة: ${esc(payslip.id.slice(0, 8))}</p>
  <div class="divider"></div>
  <table>
    <tr><th>الموظف</th><td>${esc(payslip.provider_name ?? '—')}${payslip.provider_title ? ` — ${esc(payslip.provider_title)}` : ''}</td></tr>
    <tr><th>الشهر</th><td>${esc(monthLabel(payslip.period_month))}</td></tr>
  </table>
  <table>
    <thead><tr><th>البند</th><th>المبلغ (${esc(currency)})</th><th>التفصيل</th></tr></thead>
    <tbody>
      ${rows.map(([label, value, note]) => `<tr><th>${label}</th><td>${value}</td><td class="muted">${note}</td></tr>`).join('')}
      <tr class="net"><th>الصافي المستحق</th><td>${n(payslip.net_amount).toFixed(2)}</td><td>${esc(currency)}</td></tr>
    </tbody>
  </table>
  <p class="note">
    هذه القسيمة صادرة إلكترونيًا من لوحة تحكم العيادة. الأرقام مأخوذة من محرك الرواتب
    (الإيراد المُنسب + عقد التعويضات + السلف المسجّلة) ويمكن حفظها PDF من نافذة الطباعة.
  </p>
  <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 350); };<\/script>
</body></html>`);
  w.document.close();
}
