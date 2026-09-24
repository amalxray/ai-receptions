'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import DashboardSection from '@/components/dashboard/DashboardSection';
import EmptyState from '@/components/dashboard/EmptyState';
import Skeleton from '@/components/ui/Skeleton';
import ExpenseDialog from '@/components/dashboard/ExpenseDialog';
import Sparkline from '@/components/dashboard/Sparkline';
import { BarChart, DonutChart, Panel } from '@/components/admin/AdminCharts';
import { useClinicContext } from '@/lib/useClinicContext';
import { tenantDashboardUrl } from '@/lib/services/dashboardPaths';

/**
 * PP-5 — Financial Intelligence (clinic-facing, read-only).
 *
 * Payroll integration (20261018): `kpis.expenses` now CONTAINS the net of every
 * PAID payroll period (`meta.payrollTotal` discloses the share, per month in
 * `pnlTrends[].payroll`). Nothing is executed from this UI — the only mutation
 * is the existing "+ مصروف" dialog (an explicit human action).
 *
 * Granularity (documented, not hidden): the P&L is month-granular because
 * `financial_period_summary` is; the day chips therefore drive the DAILY cash
 * register (real `daily_cash_positions` rows) and never the P&L.
 */

type Kpis = {
  revenue: number;
  collected: number;
  outstanding: number;
  refunds: number;
  expenses: number;
  badDebt: number;
  netPosition: number;
  netCash: number;
  collectionRate: number | null;
  netMargin: number | null;
  expenseRatio: number | null;
  refundRatio: number | null;
  overdue90Share: number | null;
};

type Anomaly = {
  kind: string;
  label: string;
  severity: 'high' | 'medium' | 'low';
  month: string | null;
  detail: string;
};

type Recommendation = {
  code: string;
  severity: 'high' | 'medium' | 'low';
  message: string;
};

type Bucket = { bucket: string; invoices: number; balance: number; shareOfOutstanding: number | null };
type MethodSplit = { method: string; inflows: number; shareOfCollected: number | null };

type TrendPoint = {
  month: string;
  revenue: number;
  expenses: number;
  net: number;
  /** Payroll share INSIDE `expenses` for that month (paid periods only). */
  payroll: number;
  revenueDeltaPct: number | null;
  netDeltaPct: number | null;
};

/** One real `daily_cash_positions` row (cash method only) — daily granularity. */
type CashRegisterPoint = { businessDate: string; cashIn: number; cashOut: number; netCash: number };

type Report = {
  kpis: Kpis;
  pnlTrends: TrendPoint[];
  receivables: { buckets: Bucket[]; paymentMethods: MethodSplit[] };
  cashRegister: CashRegisterPoint[];
  anomalies: Anomaly[];
  recommendations: Recommendation[];
  meta: {
    generatedAt: string;
    deterministic: boolean;
    source: string;
    /** True since 20261018: `kpis.expenses` already INCLUDES paid payroll. */
    includesPayroll: boolean;
    payrollTotal: number;
  };
};

/** Month windows the API can actually serve (`financial_period_summary` is monthly). */
const MONTH_PRESETS = [
  { key: 'm1', label: 'هذا الشهر', months: 1 },
  { key: 'm2', label: 'آخر شهرين', months: 2 },
  { key: 'm3', label: '٣ أشهر', months: 3 },
  { key: 'm6', label: '٦ أشهر', months: 6 },
  { key: 'm12', label: 'سنة', months: 12 },
  { key: 'custom', label: 'مخصص', months: null },
] as const;

/** Day windows — applied to the daily cash register only (real daily rows). */
const DAY_PRESETS = [
  { key: 'd1', label: 'اليوم', days: 1 },
  { key: 'd7', label: '٧ أيام', days: 7 },
  { key: 'd30', label: '٣٠ يومًا', days: 30 },
  { key: 'd90', label: '٩٠ يومًا', days: 90 },
] as const;

const TONES = {
  revenue: '#22d3ee',
  payroll: '#f5a623',
  expenses: '#fb7185',
  net: '#34d399',
  loss: '#f87171',
  other: '#64748b',
} as const;

type MonthRange = { fromMonth: string; toMonth: string };

const monthISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;

/** `months` clinic months ending with the current one. */
function monthRange(months: number): MonthRange {
  const to = new Date();
  const from = new Date(to.getFullYear(), to.getMonth() - (months - 1), 1);
  return { fromMonth: monthISO(from), toMonth: monthISO(to) };
}

/** The equally-long window immediately BEFORE `range` (period-over-period). */
function previousRange(range: MonthRange, months: number): MonthRange {
  const from = new Date(`${range.fromMonth}T00:00:00`);
  const to = new Date(`${range.toMonth}T00:00:00`);
  return {
    fromMonth: monthISO(new Date(from.getFullYear(), from.getMonth() - months, 1)),
    toMonth: monthISO(new Date(to.getFullYear(), to.getMonth() - months, 1)),
  };
}

/** Inclusive month count between two `YYYY-MM-01` values (never below 1). */
function countMonths(fromMonth: string, toMonth: string): number {
  const from = new Date(`${fromMonth}T00:00:00`);
  const to = new Date(`${toMonth}T00:00:00`);
  const months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth()) + 1;
  return months > 0 ? months : 1;
}

const shortMonth = (month: string) => month.slice(0, 7);

const fmtMoney = (n: number | null | undefined): string =>
  n == null ? '—' : new Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format(Number(n));
const fmtPct = (n: number | null | undefined): string => (n == null ? '—' : `${fmtMoney(n)}%`);

type Delta = { pct: number | null; direction: 'up' | 'down' | 'flat' };

/** Honest comparison: no previous window / zero baseline ⇒ `pct: null` (never a fake %). */
function computeDelta(current: number, previousValue: number | null | undefined): Delta {
  if (previousValue == null || previousValue === 0) {
    return { pct: null, direction: current === 0 ? 'flat' : current > 0 ? 'up' : 'down' };
  }
  const pct = ((current - previousValue) / Math.abs(previousValue)) * 100;
  const rounded = Math.round(pct * 10) / 10;
  return { pct: rounded, direction: rounded > 0.05 ? 'up' : rounded < -0.05 ? 'down' : 'flat' };
}

/** Count-up animation (no extra dependency): eases from the previous value. */
function useCountUp(target: number, duration = 700): number {
  const [value, setValue] = useState(0);
  const fromRef = useRef(0);
  useEffect(() => {
    const start = fromRef.current;
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const progress = Math.min(1, (t - t0) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(start + (target - start) * eased);
      if (progress < 1) raf = requestAnimationFrame(step);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

function CountUp({ value, className }: { value: number; className?: string }) {
  const animated = useCountUp(value);
  return <span className={className}>{fmtMoney(animated)}</span>;
}

const FADE_UP = { initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 } };

const severityTone: Record<string, string> = {
  high: 'border-red-500/50 bg-red-500/10 text-red-200',
  medium: 'border-amber-500/50 bg-amber-500/10 text-amber-200',
  low: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200',
};
const severityLabel: Record<string, string> = { high: 'عالية', medium: 'متوسطة', low: 'منخفضة' };

export default function FinancialIntelligencePage() {
  const { clinicId, clinicSlug, authHeaders } = useClinicContext();
  const router = useRouter();
  const [data, setData] = useState<Report | null>(null);
  const [previous, setPrevious] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [presetKey, setPresetKey] = useState<string>('m6');
  const [customFrom, setCustomFrom] = useState<string>(() => monthRange(3).fromMonth.slice(0, 7));
  const [customTo, setCustomTo] = useState<string>(() => monthISO(new Date()).slice(0, 7));
  const [cashDays, setCashDays] = useState<number>(7);
  const [activeSegment, setActiveSegment] = useState<string | null>(null);
  // G — "+ مصروف": إعادة تحميل المؤشرات بعد تسجيل مصروف جديد، وفتح النافذة.
  const [reloadKey, setReloadKey] = useState(0);
  const [expenseOpen, setExpenseOpen] = useState(false);

  // Custom months are normalised so a reversed pick can never invert the range.
  const range: MonthRange = useMemo(() => {
    const preset = MONTH_PRESETS.find((option) => option.key === presetKey) ?? MONTH_PRESETS[3];
    if (preset.months) return monthRange(preset.months);
    const from = `${customFrom}-01`;
    const to = `${customTo}-01`;
    return from <= to ? { fromMonth: from, toMonth: to } : { fromMonth: to, toMonth: from };
  }, [presetKey, customFrom, customTo]);

  const months = useMemo(() => countMonths(range.fromMonth, range.toMonth), [range]);

  useEffect(() => {
    if (!clinicId) {
      setLoading(false);
      return;
    }
    let isMounted = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const headers = await authHeaders();
        const fetchRange = async (window: MonthRange): Promise<Report | null> => {
          const url = `/api/clinic/financial-intelligence?clinic_id=${encodeURIComponent(clinicId as string)}&from_month=${window.fromMonth}&to_month=${window.toMonth}`;
          const response = await fetch(url, { headers });
          if (!response.ok) {
            if (response.status === 403) throw new Error('لا تملك صلاحية الوصول للمؤشرات المالية');
            throw new Error('خدمة الذكاء المالي غير متاحة');
          }
          const payload = await response.json();
          return (payload?.data as Report) ?? null;
        };

        const current = await fetchRange(range);
        // Period-over-period comparison: the equal-length window BEFORE `range`.
        // A failure there must never blank the main report — deltas degrade to "—".
        let prior: Report | null = null;
        try {
          prior = await fetchRange(previousRange(range, months));
        } catch {
          prior = null;
        }
        if (isMounted) {
          setData(current);
          setPrevious(prior);
        }
      } catch (caughtError) {
        if (isMounted) {
          setData(null);
          setPrevious(null);
          setError(caughtError instanceof Error ? caughtError.message : 'حدث خطأ غير معروف');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    void load();
    return () => {
      isMounted = false;
    };
  }, [clinicId, authHeaders, range, months, reloadKey]);

  const kpis = data?.kpis;
  const payrollTotal = data?.meta?.payrollTotal ?? 0;
  const operatingExpenses = Math.max(0, (kpis?.expenses ?? 0) - payrollTotal);
  const netProfit = kpis?.netPosition ?? 0;
  // D-R1 identity: net = revenue − refunds − expenses − bad_debt, therefore
  // whatever revenue does not reach net pay/operating expenses is refunds + bad debt.
  const refundsAndBadDebt = Math.max(0, (kpis?.revenue ?? 0) - netProfit - payrollTotal - operatingExpenses);

  const deltas = useMemo(() => {
    const priorKpis = previous?.kpis ?? null;
    const priorPayroll = previous ? previous.meta.payrollTotal : null;
    const priorOperating = previous ? Math.max(0, previous.kpis.expenses - previous.meta.payrollTotal) : null;
    return {
      revenue: computeDelta(kpis?.revenue ?? 0, priorKpis?.revenue),
      payroll: computeDelta(payrollTotal, priorPayroll),
      operating: computeDelta(operatingExpenses, priorOperating),
      net: computeDelta(netProfit, priorKpis?.netPosition),
    };
  }, [kpis, previous, payrollTotal, operatingExpenses, netProfit]);

  // Secondary strip — every figure the previous layout showed is still visible here.
  const ratioPills = useMemo(() => {
    if (!kpis) return [];
    return [
      { label: 'المحصَّل', value: fmtMoney(kpis.collected) },
      { label: 'المستحق', value: fmtMoney(kpis.outstanding) },
      { label: 'الاستردادات', value: fmtMoney(kpis.refunds) },
      { label: 'ديون معدومة', value: fmtMoney(kpis.badDebt) },
      { label: 'صافي النقد', value: fmtMoney(kpis.netCash) },
      { label: 'نسبة التحصيل', value: fmtPct(kpis.collectionRate) },
      { label: 'هامش الربح', value: fmtPct(kpis.netMargin) },
      { label: 'نسبة المصروفات', value: fmtPct(kpis.expenseRatio) },
      { label: 'نسبة الاستردادات', value: fmtPct(kpis.refundRatio) },
      { label: 'متأخرات 90+', value: fmtPct(kpis.overdue90Share) },
    ];
  }, [kpis]);

  // Daily cash = real daily rows only; the P&L itself stays monthly (documented).
  const cashRows = useMemo(() => {
    const rows = [...(data?.cashRegister ?? [])].sort((a, b) => a.businessDate.localeCompare(b.businessDate));
    return rows.slice(-cashDays);
  }, [data, cashDays]);

  const periodLabel = months === 1 ? 'شهر واحد' : `${months} أشهر`;
  const openPayroll = () => {
    if (clinicSlug) router.push(tenantDashboardUrl(clinicSlug, 'payroll'));
  };

  // P0-D — honest empty state: a clinic with zero invoices/payments/expenses
  // and no trends shows a clear message instead of a grid of misleading zeros.
  const isEmptyFinancial = useMemo(() => {
    if (!data || !kpis) return false;
    const allZero =
      kpis.revenue === 0 &&
      kpis.collected === 0 &&
      kpis.outstanding === 0 &&
      kpis.refunds === 0 &&
      kpis.expenses === 0 &&
      kpis.netPosition === 0 &&
      kpis.netCash === 0;
    return allZero && data.pnlTrends.length === 0 && data.receivables.buckets.every((b) => b.invoices === 0 && b.balance === 0);
  }, [data, kpis]);

  return (
    <div className="space-y-6">
      <DashboardSection
        title="الذكاء المالي"
        subtitle="مؤشرات واتجاهات وتحذيرات مالية مشتقة من سجلات العيادة (قراءة فقط — لا إجراءات تلقائية)."
        action={
          <div className="flex flex-wrap items-center gap-2">
            {clinicId ? (
              <button
                type="button"
                onClick={() => setExpenseOpen(true)}
                className="rounded-full bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-cyan-400"
              >
                + مصروف
              </button>
            ) : null}
            {MONTH_PRESETS.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setPresetKey(option.key)}
                aria-pressed={presetKey === option.key}
                className={`rounded-full border px-3 py-1 text-xs transition ${
                  presetKey === option.key
                    ? 'border-cyan-400/60 bg-cyan-400/10 text-cyan-200'
                    : 'border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
              >
                {option.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setReloadKey((key) => key + 1)}
              className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-400 transition hover:text-slate-200"
            >
              ⟳ تحديث
            </button>
          </div>
        }
      >
        {presetKey === 'custom' && (
          <motion.div
            {...FADE_UP}
            transition={{ duration: 0.25 }}
            className="mb-5 flex flex-wrap items-center gap-3 text-xs text-slate-400"
          >
            <label className="flex items-center gap-2">
              من
              <input
                type="month"
                value={customFrom}
                onChange={(event) => setCustomFrom(event.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-950/60 px-2 py-1 text-slate-200"
              />
            </label>
            <label className="flex items-center gap-2">
              إلى
              <input
                type="month"
                value={customTo}
                onChange={(event) => setCustomTo(event.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-950/60 px-2 py-1 text-slate-200"
              />
            </label>
            <span>
              الفترة المختارة: {periodLabel} ({shortMonth(range.fromMonth)} → {shortMonth(range.toMonth)})
            </span>
          </motion.div>
        )}
        {!clinicId ? (
          <EmptyState title="لا توجد عيادة محددة" description="اختر عيادة من القائمة لعرض مؤشراتها المالية." />
        ) : loading ? (
          <div className="space-y-4">
            <Skeleton className="h-32" />
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-28" />
              ))}
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <Skeleton className="h-64" />
              <Skeleton className="h-64" />
            </div>
          </div>
        ) : error ? (
          <EmptyState title="خدمة الذكاء المالي غير متاحة" description={error} />
        ) : data && kpis && isEmptyFinancial ? (
          <EmptyState
            title="لا توجد بيانات مالية بعد"
            description="ستظهر المؤشرات والاتجاهات هنا عند تسجيل أول فاتورة أو دفعة أو مصروف في عيادتك."
          />
        ) : data && kpis ? (
          <div className="space-y-6">
            <PnlHero net={netProfit} delta={deltas.net} months={months} spark={data.pnlTrends.map((t) => t.net)} />

            {/* الإيرادات → الرواتب → المصروفات التشغيلية → صافي الربح */}
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <FlowCard
                index={0}
                label="الإيرادات"
                value={kpis.revenue}
                hint={`مقابل ${periodLabel} سابقة`}
                delta={deltas.revenue}
                tone={TONES.revenue}
                href={clinicSlug ? tenantDashboardUrl(clinicSlug, 'analytics') : undefined}
              />
              <FlowCard
                index={1}
                label="رواتب مدفوعة"
                value={payrollTotal}
                hint="فترات معتمدة كمدفوعة فقط"
                delta={deltas.payroll}
                tone={TONES.payroll}
                invert
                href={clinicSlug ? tenantDashboardUrl(clinicSlug, 'payroll') : undefined}
              />
              <FlowCard
                index={2}
                label="مصروفات تشغيلية"
                value={operatingExpenses}
                hint="المصروفات − الرواتب"
                delta={deltas.operating}
                tone={TONES.expenses}
                invert
                onClick={() => {
                  setActiveSegment('مصروفات تشغيلية');
                  setExpenseOpen(true);
                }}
              />
              <FlowCard
                index={3}
                label="صافي الربح"
                value={netProfit}
                hint="الإيرادات − كل المصروفات"
                delta={deltas.net}
                tone={netProfit >= 0 ? TONES.net : TONES.loss}
              />
            </div>

            <RevenueStack
              revenue={kpis.revenue}
              net={netProfit}
              payroll={payrollTotal}
              operating={operatingExpenses}
              other={refundsAndBadDebt}
            />

            <div className="grid gap-4 lg:grid-cols-2">
              <motion.div {...FADE_UP} transition={{ duration: 0.35, delay: 0.2 }} className="h-full">
                <Panel
                  title="الاتجاه الشهري"
                  hint={`الإيرادات مقابل الرواتب المدفوعة وصافي الربح — ${periodLabel} (تجميع شهري).`}
                  className="h-full"
                >
                  <BarChart
                    data={data.pnlTrends.map((t) => ({
                      label: shortMonth(t.month),
                      values: [t.revenue, t.payroll, t.net],
                    }))}
                    series={[
                      { label: 'الإيرادات', color: TONES.revenue },
                      { label: 'رواتب مدفوعة', color: TONES.payroll },
                      { label: 'صافي الربح', color: TONES.net },
                    ]}
                    height={220}
                    formatValue={fmtMoney}
                    emptyLabel="لا توجد صفوف P&L في هذه الفترة."
                  />
                </Panel>
              </motion.div>
              <motion.div {...FADE_UP} transition={{ duration: 0.35, delay: 0.25 }} className="h-full">
                <Panel
                  title="توزيع المصروفات"
                  hint="اضغط أي شريحة للانتقال إلى مصدرها (الرواتب أو سجل المصروفات)."
                  className="h-full"
                >
                  <DonutChart
                    segments={[
                      { label: 'رواتب مدفوعة', value: payrollTotal, color: TONES.payroll },
                      { label: 'مصروفات تشغيلية', value: operatingExpenses, color: TONES.expenses },
                    ]}
                    centerLabel="إجمالي المصروفات"
                    centerValue={fmtMoney(kpis.expenses)}
                    activeLabel={activeSegment}
                    onSelect={(segment) => {
                      setActiveSegment(segment.label);
                      if (segment.label === 'رواتب مدفوعة') openPayroll();
                      else setExpenseOpen(true);
                    }}
                  />
                  <p className="mt-3 text-[11px] text-slate-500">
                    المجموع = مصروفات فترة P&amp;L ({fmtMoney(kpis.expenses)}) — الرواتب داخلها وليست بندًا إضافيًا.
                  </p>
                </Panel>
              </motion.div>
            </div>

            <DailyCashCard rows={cashRows} days={cashDays} onDaysChange={setCashDays} />

            {/* الإفصاح الصريح: المصروفات تشمل الرواتب المدفوعة */}
            <motion.p
              {...FADE_UP}
              transition={{ duration: 0.3, delay: 0.3 }}
              className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 text-[12px] leading-6 text-slate-300"
            >
              المصروفات تشمل رواتب مدفوعة بقيمة{' '}
              <span className="font-semibold text-amber-200">{fmtMoney(payrollTotal)}</span> داخل {periodLabel}
              {payrollTotal > 0
                ? ' (فترات معتمدة كمدفوعة فقط)'
                : ' — لا توجد فترة رواتب مدفوعة في هذه الفترة'}{' '}
              · المصدر: {data.meta.source} · تم التوليد: {new Date(data.meta.generatedAt).toLocaleString('en-GB')}
            </motion.p>

            {/* الشريط الثانوي — كل أرقام التصميم السابق ما زالت ظاهرة */}
            <div className="flex flex-wrap gap-2">
              {ratioPills.map((pill) => (
                <span
                  key={pill.label}
                  className="rounded-full border border-slate-800 bg-slate-900/60 px-3 py-1.5 text-[11px] text-slate-400"
                >
                  {pill.label}: <span className="font-semibold text-slate-200">{pill.value}</span>
                </span>
              ))}
            </div>

            <PP5InsightBlocks data={data} />
          </div>
        ) : null}
      </DashboardSection>

      {/* G — نافذة المصروفات: مركّبة هنا لأن هذا المكوّن صاحب الحالة (clinicId/expenseOpen/reloadKey). */}
      <ExpenseDialog
        clinicId={clinicId as string}
        authHeaders={authHeaders}
        open={expenseOpen}
        onClose={() => setExpenseOpen(false)}
        onSaved={() => setReloadKey((key) => key + 1)}
      />
    </div>
  );
}

function PP5InsightBlocks({ data }: { data: Report }) {
  return (
    <motion.div {...FADE_UP} transition={{ duration: 0.35, delay: 0.32 }} className="space-y-4">
      {/* Recommendations (informational) */}
      {data.recommendations.length > 0 && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
          <h3 className="mb-3 text-sm font-semibold text-white">توصيات مقترحة</h3>
          <ul className="space-y-2">
            {data.recommendations.map((r) => (
              <li key={r.code} className="flex items-start gap-2 text-sm text-slate-200">
                <span className={`mt-0.5 rounded-full border px-2 py-0.5 text-[10px] ${severityTone[r.severity]}`}>
                  {severityLabel[r.severity]}
                </span>
                <span>{r.message}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] text-slate-500">التوصيات إرشادية فقط — لا تُنفَّذ أي إجراء تلقائي.</p>
        </div>
      )}

      {/* Anomalies */}
      {data.anomalies.length > 0 && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
          <h3 className="mb-3 text-sm font-semibold text-white">تحذيرات (قواعد موثقة)</h3>
          <ul className="space-y-2">
            {data.anomalies.map((a, idx) => (
              <li key={`${a.kind}-${a.month ?? 'all'}-${idx}`} className="flex items-start gap-2 text-sm text-slate-200">
                <span className={`mt-0.5 rounded-full border px-2 py-0.5 text-[10px] ${severityTone[a.severity]}`}>
                  {severityLabel[a.severity]}
                </span>
                <span>
                  <span className="font-medium text-slate-100">{a.label}</span>
                  {a.month ? ` (${a.month})` : ''}
                  <span className="text-slate-400"> — {a.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <PP5Receivables data={data} />
    </motion.div>
  );
}

function PP5Receivables({ data }: { data: Report }) {
  return (
    <motion.div {...FADE_UP} transition={{ duration: 0.35, delay: 0.35 }}>
      <Panel title="توزيع المستحقات" hint="من aging summary — حِزم التقادم وطرق الدفع المحصَّلة.">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-2">
            {data.receivables.buckets.map((b) => (
              <div key={b.bucket} className="flex items-center justify-between text-sm">
                <span className="text-slate-300">
                  {b.bucket === 'current' ? 'حالي' : b.bucket} ({b.invoices} فاتورة)
                </span>
                <span className="text-slate-200">
                  {fmtMoney(b.balance)} · {fmtPct(b.shareOfOutstanding)}
                </span>
              </div>
            ))}
            {data.receivables.buckets.length === 0 && (
              <p className="text-sm text-slate-500">لا توجد فواتير مستحقة.</p>
            )}
          </div>

          <div>
            <h4 className="mb-3 text-xs font-semibold text-slate-400">توزيع طرق الدفع</h4>
            {data.receivables.paymentMethods.length === 0 ? (
              <p className="text-sm text-slate-500">لا توجد دفعات في هذه الفترة.</p>
            ) : (
              <div className="space-y-1">
                {data.receivables.paymentMethods.map((m) => (
                  <div key={m.method} className="flex items-center justify-between text-sm">
                    <span className="text-slate-300">{m.method}</span>
                    <span className="text-slate-200">
                      {fmtMoney(m.inflows)} · {fmtPct(m.shareOfCollected)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Panel>
    </motion.div>
  );
}

function DeltaChip({ delta, invert = false }: { delta: Delta; invert?: boolean }) {
  if (delta.pct == null) {
    return (
      <span className="rounded-full border border-slate-700 px-2 py-0.5 text-[11px] text-slate-500">— لا مقارنة</span>
    );
  }
  const up = delta.direction === 'up';
  const flat = delta.direction === 'flat';
  const good = invert ? !up : up;
  const tone = flat
    ? 'border-slate-600 text-slate-300'
    : good
      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
      : 'border-rose-500/40 bg-rose-500/10 text-rose-200';
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[11px] ${tone}`}>
      {flat ? '■' : up ? '▲' : '▼'} {fmtMoney(Math.abs(delta.pct))}%
    </span>
  );
}

/** One link in the الإيرادات → الرواتب → المصروفات → الصافي chain (drill-down aware). */
function FlowCard({
  index,
  label,
  value,
  hint,
  delta,
  tone,
  invert = false,
  href,
  onClick,
}: {
  index: number;
  label: string;
  value: number;
  hint?: string;
  delta: Delta;
  tone: string;
  invert?: boolean;
  href?: string;
  onClick?: () => void;
}) {
  const body = (
    <motion.div
      {...FADE_UP}
      transition={{ duration: 0.35, delay: 0.05 * (index + 1) }}
      whileHover={{ y: -3 }}
      className="group flex h-full flex-col justify-between rounded-2xl border border-slate-800 bg-slate-900/70 p-4 transition hover:border-slate-600 hover:bg-slate-900"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-slate-400">{label}</p>
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: tone }} />
      </div>
      <p className="mt-2 text-xl font-semibold" style={{ color: tone }}>
        <CountUp value={value} />
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <DeltaChip delta={delta} invert={invert} />
        {hint && <span className="text-[11px] text-slate-500">{hint}</span>}
      </div>
      {(href || onClick) && (
        <span className="mt-2 text-[11px] text-cyan-400 opacity-0 transition group-hover:opacity-100">
          عرض التفاصيل ←
        </span>
      )}
    </motion.div>
  );

  if (href) {
    return (
      <Link href={href} className="block h-full">
        {body}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="block h-full w-full text-start">
        {body}
      </button>
    );
  }
  return body;
}

/** Net-profit hero: count-up value + direction chip + zero-aware monthly sparkline. */
function PnlHero({ net, delta, months, spark }: { net: number; delta: Delta; months: number; spark: number[] }) {
  const loss = net < 0;
  return (
    <motion.div
      {...FADE_UP}
      transition={{ duration: 0.35 }}
      className="relative overflow-hidden rounded-[2rem] border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900/70 to-slate-950 p-6 transition hover:border-slate-700"
    >
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="space-y-2">
          <p className="text-sm text-slate-400">صافي الربح (بعد الرواتب المدفوعة)</p>
          <p className={`text-4xl font-bold ${loss ? 'text-rose-300' : 'text-emerald-300'}`}>
            <CountUp value={net} />
          </p>
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
            <DeltaChip delta={delta} />
            <span>مقارنة بـ{months === 1 ? 'شهر واحد' : `${months} أشهر`} سابقة</span>
          </div>
        </div>
        <div className="w-full max-w-sm">
          <Sparkline values={spark.length > 1 ? spark : [0, net]} baseline="zero" stroke={loss ? 'loss' : 'profit'} />
          <p className="mt-2 text-[11px] text-slate-500">صافي الربح شهريًا خلال الفترة المختارة.</p>
        </div>
      </div>
    </motion.div>
  );
}


/** Revenue → payroll → operating expenses → refunds/bad debt → unallocated. */
function RevenueStack({
  revenue,
  net,
  payroll,
  operating,
  other,
}: {
  revenue: number;
  net: number;
  payroll: number;
  operating: number;
  other: number;
}) {
  const segments = [
    { label: 'صافي الربح', value: Math.max(0, net), color: TONES.net },
    { label: 'رواتب مدفوعة', value: payroll, color: TONES.payroll },
    { label: 'مصروفات تشغيلية', value: operating, color: TONES.expenses },
    { label: 'استردادات وديون معدومة', value: other, color: TONES.other },
  ].filter((segment) => segment.value > 0.005);
  const allocated = segments.reduce((total, segment) => total + segment.value, 0);
  const scale = Math.max(revenue, allocated, 1);
  const unallocated = Math.max(0, revenue - allocated);
  const overflow = Math.max(0, allocated - revenue);
  const share = (value: number) => (revenue > 0 ? fmtPct(Math.round((value / revenue) * 1000) / 10) : '—');

  return (
    <motion.div {...FADE_UP} transition={{ duration: 0.35, delay: 0.15 }}>
      <Panel
        title="من الإيراد إلى صافي الربح"
        hint="نسب الإيرادات المُسجَّلة في الفترة — المصروفات تشمل الرواتب المدفوعة (وليست بندًا إضافيًا)."
      >
        <div className="flex h-8 w-full overflow-hidden rounded-full border border-slate-800 bg-slate-950/60" dir="ltr">
          {segments.map((segment, index) => (
            <motion.div
              key={segment.label}
              initial={{ width: 0 }}
              animate={{ width: `${(segment.value / scale) * 100}%` }}
              transition={{ duration: 0.7, delay: 0.08 * index, ease: 'easeOut' }}
              style={{ background: segment.color }}
              title={`${segment.label}: ${fmtMoney(segment.value)}`}
            />
          ))}
          {unallocated > 0.005 && (
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${(unallocated / scale) * 100}%` }}
              transition={{ duration: 0.7, delay: 0.35, ease: 'easeOut' }}
              className="bg-slate-700/60"
              title={`غير مُوزَّع: ${fmtMoney(unallocated)}`}
            />
          )}
        </div>

        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {segments.map((segment) => (
            <li key={segment.label} className="flex items-center justify-between gap-3 text-sm">
              <span className="flex items-center gap-2 text-slate-300">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: segment.color }} />
                {segment.label}
              </span>
              <span className="font-semibold text-white">
                {fmtMoney(segment.value)}{' '}
                <span className="text-[11px] font-normal text-slate-500">{share(segment.value)}</span>
              </span>
            </li>
          ))}
          {unallocated > 0.005 && (
            <li className="flex items-center justify-between gap-3 text-sm">
              <span className="flex items-center gap-2 text-slate-400">
                <span className="h-2.5 w-2.5 rounded-full bg-slate-700" />
                غير مُوزَّع (لم يُصرف بعد)
              </span>
              <span className="font-semibold text-slate-300">{fmtMoney(unallocated)}</span>
            </li>
          )}
        </ul>

        <p className="mt-3 text-[11px] leading-5 text-slate-500">
          الإيرادات {fmtMoney(revenue)} − مصروفات (رواتب {fmtMoney(payroll)} + تشغيلية {fmtMoney(operating)}) − استردادات
          وديون معدومة {fmtMoney(other)} = صافي {fmtMoney(net)}
          {overflow > 0 ? ` · المصروفات تتجاوز الإيرادات بمقدار ${fmtMoney(overflow)}` : ''}
        </p>
      </Panel>
    </motion.div>
  );
}


/** Daily cash register (real daily rows) — the only day-granular view on this page. */
function DailyCashCard({
  rows,
  days,
  onDaysChange,
}: {
  rows: CashRegisterPoint[];
  days: number;
  onDaysChange: (days: number) => void;
}) {
  const cashIn = rows.reduce((total, row) => total + row.cashIn, 0);
  const cashOut = rows.reduce((total, row) => total + row.cashOut, 0);
  const netCash = rows.reduce((total, row) => total + row.netCash, 0);

  return (
    <motion.div {...FADE_UP} transition={{ duration: 0.35, delay: 0.28 }}>
      <Panel
        title="الصندوق اليومي (نقدي)"
        hint="من daily_cash_positions — طريقة الدفع النقدية فقط؛ أما المؤشرات أعلاه فشهرية التجميع."
      >
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {DAY_PRESETS.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => onDaysChange(option.days)}
              aria-pressed={days === option.days}
              className={`rounded-full border px-3 py-1 text-xs transition ${
                days === option.days
                  ? 'border-cyan-400/60 bg-cyan-400/10 text-cyan-200'
                  : 'border-slate-700 text-slate-400 hover:text-slate-200'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          {[
            { label: 'داخل', value: cashIn, tone: TONES.net },
            { label: 'خارج', value: cashOut, tone: TONES.expenses },
            { label: 'صافي', value: netCash, tone: netCash >= 0 ? TONES.net : TONES.loss },
          ].map((item) => (
            <div key={item.label} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-3">
              <p className="text-[11px] text-slate-400">{item.label}</p>
              <p className="mt-1 text-lg font-semibold" style={{ color: item.tone }}>
                <CountUp value={item.value} />
              </p>
            </div>
          ))}
        </div>

        <BarChart
          data={rows.map((row) => ({ label: row.businessDate.slice(5), values: [row.cashIn, row.cashOut] }))}
          series={[
            { label: 'داخل', color: TONES.net },
            { label: 'خارج', color: TONES.expenses },
          ]}
          height={180}
          formatValue={fmtMoney}
          emptyLabel="لا توجد حركة نقدية مسجَّلة في هذه الأيام."
        />
        <p className="mt-3 text-[11px] text-slate-500">
          {rows.length} يوم عمل يحتوي حركة (حتى {days} يومًا) · حركات نقدية يومية فقط وليست بديلًا عن التحليل الشهري.
        </p>
      </Panel>
    </motion.div>
  );
}
