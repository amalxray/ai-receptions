'use client';

import { useCallback, useEffect, useState } from 'react';
import DashboardSection from '@/components/dashboard/DashboardSection';
import StatusPill from '@/components/dashboard/StatusPill';
import EmptyState from '@/components/dashboard/EmptyState';
import Skeleton from '@/components/ui/Skeleton';
import { useClinicContext } from '@/lib/useClinicContext';

/**
 * Phase 4a — staff review inbox: stats header + filter tabs + search +
 * star filter + publish/reject/delete actions + pagination (20/page).
 */

type ReviewItem = {
  id: string;
  rating: number;
  author_name: string;
  comment: string | null;
  source: string;
  is_published: boolean;
  is_verified: boolean;
  flagged_medical: boolean;
  flag_reason: string | null;
  published_at: string | null;
  rejected_at: string | null;
  created_at: string;
};

type Stats = { total: number; published: number; pending: number; rejected: number; average: number };

const ZERO_STATS: Stats = { total: 0, published: 0, pending: 0, rejected: 0, average: 0 };

const TABS = [
  { key: 'all', label: 'الكل' },
  { key: 'pending', label: 'جديد' },
  { key: 'flagged', label: 'مُعلَّم' },
  { key: 'published', label: 'منشور' },
  { key: 'rejected', label: 'مرفوض' },
] as const;

type FilterKey = (typeof TABS)[number]['key'];

const PAGE_SIZE = 20;
const SOURCE_LABEL: Record<string, string> = { form: 'نموذج', chat: 'محادثة', cron: 'تذكير', public: 'عام' };

function Stars({ rating }: { rating: number }) {
  return (
    <span dir="ltr" className="inline-flex" aria-label={`${rating} من 5`}>
      {[1, 2, 3, 4, 5].map((s) => (
        <span key={s} className={s <= rating ? 'text-amber-400' : 'text-slate-300'}>★</span>
      ))}
    </span>
  );
}

function ReviewFilters({ filter, onFilter, search, onSearch, star, onStar }: {
  filter: FilterKey; onFilter: (f: FilterKey) => void;
  search: string; onSearch: (v: string) => void;
  star: number | null; onStar: (s: number | null) => void;
}) {
  return (
    <>
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="فلترة التقييمات">
        {TABS.map((t) => (
          <button
            key={t.key} role="tab" aria-selected={filter === t.key} onClick={() => onFilter(t.key)}
            className={`rounded-full px-4 py-2 text-sm font-semibold ${
              filter === t.key ? 'bg-slate-900 text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        <input
          type="search" value={search} onChange={(e) => onSearch(e.target.value)}
          placeholder="بحث بالاسم أو التعليق..." aria-label="بحث في التقييمات"
          className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-amber-400"
        />
        <select
          value={star ?? ''} onChange={(e) => onStar(e.target.value ? Number(e.target.value) : null)}
          aria-label="فلترة بالنجوم"
          className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm"
        >
          <option value="">كل النجوم</option>
          {[5, 4, 3, 2, 1].map((s) => (<option key={s} value={s}>{s} نجوم</option>))}
        </select>
      </div>
    </>
  );
}

function ReviewCard({ r, acting, onAct }: {
  r: ReviewItem; acting: string | null; onAct: (id: string, a: 'publish' | 'reject' | 'delete') => void;
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-800">{r.author_name}</span>
          {r.is_verified && <StatusPill tone="success">موثّق</StatusPill>}
          {r.flagged_medical && <StatusPill tone="warning">{r.flag_reason ?? 'مُعلَّم طبي'}</StatusPill>}
          {!r.is_published && !r.rejected_at && <StatusPill tone="warning">جديد</StatusPill>}
          {r.is_published && <StatusPill tone="success">منشور</StatusPill>}
          {r.rejected_at && <StatusPill tone="danger">مرفوض</StatusPill>}
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Stars rating={r.rating} />
          <span>{SOURCE_LABEL[r.source] ?? r.source}</span>
          <time dateTime={r.created_at} dir="ltr">{r.created_at.slice(0, 10)}</time>
        </div>
      </div>
      {r.comment && <p className="mt-2 text-sm leading-relaxed text-slate-700">{r.comment}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {!r.is_published && (
          <button
            onClick={() => onAct(r.id, 'publish')} disabled={acting === r.id}
            className="rounded-full bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            نشر
          </button>
        )}
        {!r.rejected_at && (
          <button
            onClick={() => onAct(r.id, 'reject')} disabled={acting === r.id}
            className="rounded-full border border-amber-300 px-4 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-50"
          >
            رفض
          </button>
        )}
        <button
          onClick={() => onAct(r.id, 'delete')} disabled={acting === r.id}
          className="rounded-full border border-red-300 px-4 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          حذف
        </button>
      </div>
    </article>
  );
}

function ReviewPager({ page, totalPages, onPage }: { page: number; totalPages: number; onPage: (p: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <nav aria-label="صفحات التقييمات" className="mt-4 flex items-center justify-center gap-2">
      <button onClick={() => onPage(Math.max(0, page - 1))} disabled={page === 0}
        className="rounded-full border border-slate-200 px-4 py-2 text-sm disabled:opacity-40">
        السابق
      </button>
      <span className="text-sm text-slate-500 tabular-nums" dir="ltr">{page + 1} / {totalPages}</span>
      <button onClick={() => onPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1}
        className="rounded-full border border-slate-200 px-4 py-2 text-sm disabled:opacity-40">
        التالي
      </button>
    </nav>
  );
}

export default function ReviewsInboxPage() {
  const { clinicId, authHeaders, loading: clinicLoading } = useClinicContext();
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<Stats>(ZERO_STATS);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [star, setStar] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async (id: string, f: FilterKey, q: string, s: number | null, p: number) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        clinic_id: id, filter: f, limit: String(PAGE_SIZE), offset: String(p * PAGE_SIZE),
      });
      if (q) params.set('search', q);
      if (s) params.set('rating', String(s));
      const res = await fetch(`/api/clinic/reviews?${params}`, { headers: authHeaders });
      if (!res.ok) throw new Error('فشل تحميل التقييمات');
      const body = await res.json();
      setItems(body.data?.items ?? []);
      setTotal(body.data?.total ?? 0);
      setStats(body.data?.stats ?? ZERO_STATS);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    if (clinicLoading || !clinicId) return;
    setPage(0);
    void load(clinicId, filter, debouncedSearch, star, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinicLoading, clinicId, filter, debouncedSearch, star]);

  useEffect(() => {
    if (!clinicId) return;
    void load(clinicId, filter, debouncedSearch, star, page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  async function act(id: string, action: 'publish' | 'reject' | 'delete') {
    if (!clinicId || acting) return;
    if (action === 'delete' && !window.confirm('حذف هذا التقييم نهائياً؟')) return;
    setActing(id);
    try {
      const url = action === 'delete' ? `/api/clinic/reviews/${id}` : `/api/clinic/reviews/${id}/${action}`;
      const res = await fetch(url, { method: action === 'delete' ? 'DELETE' : 'POST', headers: authHeaders });
      if (!res.ok) throw new Error('فشل الإجراء');
      await load(clinicId, filter, debouncedSearch, star, page);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'حدث خطأ');
    } finally {
      setActing(null);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const STAT_CARDS = [
    { value: `${stats.average.toFixed(1)} ⭐`, label: 'المتوسط', cls: 'border-slate-200 bg-white', lcls: 'text-slate-500' },
    { value: String(stats.total), label: 'الإجمالي', cls: 'border-slate-200 bg-white', lcls: 'text-slate-500' },
    { value: String(stats.pending), label: 'بانتظار المراجعة', cls: 'border-amber-200 bg-amber-50', lcls: 'text-amber-700' },
    { value: String(stats.published), label: 'منشور', cls: 'border-emerald-200 bg-emerald-50', lcls: 'text-emerald-700' },
    { value: String(stats.rejected), label: 'مرفوض', cls: 'border-red-200 bg-red-50', lcls: 'text-red-700' },
  ];

  return (
    <div dir="rtl" className="space-y-6">
      <DashboardSection title="التقييمات" subtitle="إدارة تقييمات المرضى: مراجعة، نشر، رفض">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {STAT_CARDS.map((c) => (
            <div key={c.label} className={`rounded-2xl border p-4 text-center ${c.cls}`}>
              <div className="text-2xl font-extrabold tabular-nums" dir="ltr">{c.value}</div>
              <div className={`mt-1 text-xs ${c.lcls}`}>{c.label}</div>
            </div>
          ))}
        </div>
      </DashboardSection>
      <DashboardSection title="القائمة">
        <ReviewFilters
          filter={filter} onFilter={(f) => { setFilter(f); setPage(0); }}
          search={search} onSearch={setSearch} star={star}
          onStar={(s) => { setStar(s); setPage(0); }}
        />
        {error && (
          <p role="alert" className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
        )}
        <div className="mt-4 space-y-3">
          {loading ? (
            <Skeleton />
          ) : items.length === 0 ? (
            <EmptyState title="لا توجد تقييمات" hint="لا توجد تقييمات مطابقة للفلتر الحالي." />
          ) : (
            items.map((r) => <ReviewCard key={r.id} r={r} acting={acting} onAct={act} />)
          )}
        </div>
        <ReviewPager page={page} totalPages={totalPages} onPage={setPage} />
      </DashboardSection>
    </div>
  );
}
