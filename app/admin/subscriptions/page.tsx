'use client';

import { useEffect, useMemo, useState } from 'react';
import { CreditCard } from 'lucide-react';
import { BarList } from '@/components/admin/AdminCharts';
import {
  Badge,
  DataTableShell,
  FilterSelect,
  SearchInput,
  TableMessage,
  Td,
  Th,
} from '@/components/admin/AdminTableParts';

type SubscriptionRow = {
  id: string;
  clinic_id: string;
  clinic_name?: string;
  plan_id: string;
  status: string;
  current_period_end: string | null;
  created_at: string | null;
};

const STATUS_LABELS: Record<string, string> = {
  active: 'نشط',
  trialing: 'تجريبي',
  past_due: 'متأخر',
  canceled: 'ملغى',
  expired: 'منتهٍ',
};

const PALETTE: Record<string, string> = {
  active: '#34d399',
  trialing: '#38bdf8',
  past_due: '#f5a623',
  canceled: '#f472b6',
  expired: '#94a3b8',
};

const STATUS_OPTIONS = [
  { value: 'all', label: 'كل الحالات' },
  ...Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label })),
];

const SORT_OPTIONS = [
  { value: 'end', label: 'الأقرب انتهاءً' },
  { value: 'clinic', label: 'المؤسسة' },
  { value: 'created', label: 'الأحدث' },
];

const dateFmt = new Intl.DateTimeFormat('ar-EG', { day: 'numeric', month: 'short', year: 'numeric' });

function statusTone(status: string) {
  if (status === 'active') return 'success' as const;
  if (status === 'trialing') return 'info' as const;
  if (status === 'past_due') return 'warn' as const;
  if (status === 'canceled') return 'danger' as const;
  return 'neutral' as const;
}

export default function AdminSubscriptionsPage() {
  const [rows, setRows] = useState<SubscriptionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [extendId, setExtendId] = useState('');
  const [extendMonths, setExtendMonths] = useState('1');

  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState('end');

  useEffect(() => {
    fetch('/api/admin/subscriptions')
      .then((r) => r.json())
      .then((b) => {
        if (!b.data) throw new Error(b.error ?? 'فشل التحميل');
        setRows(b.data.subscriptions as SubscriptionRow[]);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'فشل التحميل'))
      .finally(() => setLoading(false));
  }, []);

  async function extend() {
    setError(null);
    setResult(null);
    if (!extendId) {
      setError('اختر الاشتراك أولاً');
      return;
    }
    try {
      const res = await fetch('/api/admin/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription_id: extendId, months: Number(extendMonths) }),
      });
      const b = await res.json();
      if (!res.ok) throw new Error(b.error ?? 'فشل التمديد');
      setResult(`تم تمديد الاشتراك حتى ${b.data?.current_period_end?.slice(0, 10) ?? ''}`);
      setExtendId('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل التمديد');
    }
  }

  const distribution = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) map.set(r.status, (map.get(r.status) ?? 0) + 1);
    return Array.from(map.entries()).map(([key, value]) => ({
      label: STATUS_LABELS[key] ?? key,
      value,
      color: PALETTE[key] ?? '#94a3b8',
    }));
  }, [rows]);

  const view = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = rows.filter((s) => {
      if (q && !`${s.clinic_name ?? ''} ${s.clinic_id}`.toLowerCase().includes(q)) return false;
      if (status !== 'all' && s.status !== status) return false;
      return true;
    });
    return filtered.sort((a, b) => {
      if (sort === 'clinic') return (a.clinic_name ?? a.clinic_id).localeCompare(b.clinic_name ?? b.clinic_id, 'ar');
      if (sort === 'created') return new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime();
      return new Date(a.current_period_end ?? 0).getTime() - new Date(b.current_period_end ?? 0).getTime();
    });
  }, [rows, query, status, sort]);

  const selected = rows.find((r) => r.id === extendId);

  return (
    <div className="space-y-6">
      <div className="rounded-[2rem] border border-slate-800 bg-slate-900/50 p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
              <CreditCard className="h-5 w-5 text-amber-300" />
              الاشتراكات
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              {view.length} من {rows.length} اشتراك · تمديدات يدوية متاحة.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <SearchInput value={query} onChange={setQuery} placeholder="ابحث بالمؤسسة…" />
            <FilterSelect label="الحالة" value={status} onChange={setStatus} options={STATUS_OPTIONS} />
            <FilterSelect label="ترتيب" value={sort} onChange={setSort} options={SORT_OPTIONS} />
          </div>
        </div>

        {error && (
          <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
            {error}
          </div>
        )}
        {result && (
          <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
            {result}
          </div>
        )}

        <DataTableShell>
          <thead>
            <tr>
              <Th>المؤسسة</Th>
              <Th>الباقة</Th>
              <Th>الحالة</Th>
              <Th>نهاية الفترة</Th>
              <Th>إجراء</Th>
            </tr>
          </thead>
          <tbody>
            {loading && <TableMessage colSpan={5}>جارٍ التحميل…</TableMessage>}
            {!loading && view.length === 0 && <TableMessage colSpan={5}>لا توجد اشتراكات مطابقة.</TableMessage>}
            {!loading &&
              view.map((s) => (
                <tr key={s.id} className="transition hover:bg-slate-800/40">
                  <Td className="font-medium text-slate-100">{s.clinic_name ?? s.clinic_id.slice(0, 8)}</Td>
                  <Td>
                    <Badge tone="neutral">{s.plan_id}</Badge>
                  </Td>
                  <Td>
                    <Badge tone={statusTone(s.status)}>{STATUS_LABELS[s.status] ?? s.status}</Badge>
                  </Td>
                  <Td className="whitespace-nowrap text-slate-400">
                    {s.current_period_end ? dateFmt.format(new Date(s.current_period_end)) : '—'}
                  </Td>
                  <Td>
                    <button
                      type="button"
                      onClick={() => setExtendId(s.id)}
                      className="rounded-full bg-slate-800 px-4 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-700"
                    >
                      تمديد
                    </button>
                  </Td>
                </tr>
              ))}
          </tbody>
        </DataTableShell>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-[2rem] border border-slate-800 bg-slate-900/50 p-6">
          <h3 className="mb-4 text-sm font-semibold text-white">توزيع الحالات</h3>
          <BarList items={distribution} />
        </div>

        <div className="rounded-[2rem] border border-slate-800 bg-slate-900/50 p-6">
          <h3 className="text-sm font-semibold text-white">تمديد اشتراك</h3>
          <p className="mt-1 text-xs text-slate-400">
            {selected
              ? `المؤسسة: ${selected.clinic_name ?? selected.clinic_id.slice(0, 8)} · الحالة: ${
                  STATUS_LABELS[selected.status] ?? selected.status
                }`
              : 'اختر اشتراكاً من الجدول لبدء التمديد.'}
          </p>
          {extendId && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <input
                type="number"
                min="1"
                max="36"
                value={extendMonths}
                onChange={(e) => setExtendMonths(e.target.value)}
                className="w-24 rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-amber-400/60"
              />
              <span className="text-xs text-slate-400">شهراً</span>
              <button
                type="button"
                onClick={() => void extend()}
                className="rounded-full bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 transition hover:bg-amber-400"
              >
                تأكيد التمديد
              </button>
              <button
                type="button"
                onClick={() => setExtendId('')}
                className="rounded-full bg-slate-800 px-4 py-2 text-xs text-slate-300 transition hover:bg-slate-700"
              >
                إلغاء
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
