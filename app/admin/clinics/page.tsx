'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Building2, ExternalLink } from 'lucide-react';
import {
  Avatar,
  Badge,
  DataTableShell,
  FilterSelect,
  SearchInput,
  TableMessage,
  Td,
  Th,
} from '@/components/admin/AdminTableParts';

type ClinicRow = {
  id: string;
  name: string;
  slug: string;
  activity_type: string | null;
  created_at: string | null;
  deleted_at: string | null;
  members: number;
};

const ACTIVITY_NAMES: Record<string, string> = {
  clinic: 'عيادة أسنان',
  imaging_center: 'مركز تصوير',
  dental_lab: 'مختبر أسنان',
};

const TYPE_OPTIONS = [
  { value: 'all', label: 'كل الأنواع' },
  { value: 'clinic', label: 'عيادة أسنان' },
  { value: 'imaging_center', label: 'مركز تصوير' },
  { value: 'dental_lab', label: 'مختبر أسنان' },
];

const STATUS_OPTIONS = [
  { value: 'all', label: 'الكل' },
  { value: 'active', label: 'مفعّلة' },
  { value: 'disabled', label: 'معطّلة' },
];

const SORT_OPTIONS = [
  { value: 'newest', label: 'الأحدث' },
  { value: 'name', label: 'الاسم' },
  { value: 'members', label: 'الأعضاء' },
];

const dateFmt = new Intl.DateTimeFormat('ar-EG', { day: 'numeric', month: 'short', year: 'numeric' });

export default function AdminClinicsPage() {
  const [clinics, setClinics] = useState<ClinicRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [type, setType] = useState('all');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState('newest');

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/clinics');
      const b = await res.json();
      if (!res.ok || !b.data) throw new Error(b.error ?? 'فشل تحميل المؤسسات');
      setClinics(b.data.clinics as ClinicRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل التحميل');
    } finally {
      setLoading(false);
    }
  }

  async function toggle(clinic: ClinicRow) {
    setError(null);
    setBusy(clinic.id);
    try {
      const res = await fetch(`/api/admin/clinics/${clinic.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deleted: !clinic.deleted_at }),
      });
      const b = await res.json();
      if (!res.ok) throw new Error(b.error ?? 'فشل التحديث');
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل التحديث');
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const view = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = clinics.filter((c) => {
      if (q && !`${c.name} ${c.slug}`.toLowerCase().includes(q)) return false;
      if (type !== 'all' && (c.activity_type ?? '') !== type) return false;
      if (status === 'active' && c.deleted_at) return false;
      if (status === 'disabled' && !c.deleted_at) return false;
      return true;
    });
    return filtered.sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name, 'ar');
      if (sort === 'members') return b.members - a.members;
      return new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime();
    });
  }, [clinics, query, type, status, sort]);

  return (
    <div className="rounded-[2rem] border border-slate-800 bg-slate-900/50 p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
            <Building2 className="h-5 w-5 text-amber-300" />
            المؤسسات
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            {view.length} من {clinics.length} مؤسسة · تفعيل/تعطيل مباشر.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SearchInput value={query} onChange={setQuery} placeholder="ابحث بالاسم أو الرابط…" />
          <FilterSelect label="النوع" value={type} onChange={setType} options={TYPE_OPTIONS} />
          <FilterSelect label="الحالة" value={status} onChange={setStatus} options={STATUS_OPTIONS} />
          <FilterSelect label="ترتيب" value={sort} onChange={setSort} options={SORT_OPTIONS} />
        </div>
      </div>

      {error && (
        <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
          {error}
        </div>
      )}

      <DataTableShell>
        <thead>
          <tr>
            <Th>المؤسسة</Th>
            <Th>النوع</Th>
            <Th>الأعضاء</Th>
            <Th>الحالة</Th>
            <Th>الانضمام</Th>
            <Th>إجراءات</Th>
          </tr>
        </thead>
        <tbody>
          {loading && <TableMessage colSpan={6}>جارٍ التحميل…</TableMessage>}
          {!loading && view.length === 0 && <TableMessage colSpan={6}>لا توجد مؤسسات مطابقة.</TableMessage>}
          {!loading &&
            view.map((c) => (
              <tr key={c.id} className="transition hover:bg-slate-800/40">
                <Td>
                  <div className="flex items-center gap-3">
                    <Avatar label={c.name} tone="info" />
                    <div className="min-w-0">
                      <Link
                        href={`/admin/clinics/${c.id}`}
                        className="block truncate font-semibold text-white hover:text-amber-200"
                      >
                        {c.name}
                      </Link>
                      <span className="text-xs text-slate-500">/{c.slug}</span>
                    </div>
                  </div>
                </Td>
                <Td>
                  <Badge tone="neutral">{ACTIVITY_NAMES[c.activity_type ?? ''] ?? 'غير محدد'}</Badge>
                </Td>
                <Td>{c.members}</Td>
                <Td>
                  {c.deleted_at ? <Badge tone="danger">معطّلة</Badge> : <Badge tone="success">مفعّلة</Badge>}
                </Td>
                <Td className="whitespace-nowrap text-slate-400">
                  {c.created_at ? dateFmt.format(new Date(c.created_at)) : '—'}
                </Td>
                <Td>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void toggle(c)}
                      disabled={busy === c.id}
                      className={`rounded-full px-4 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
                        c.deleted_at
                          ? 'bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30'
                          : 'bg-rose-500/15 text-rose-200 hover:bg-rose-500/25'
                      }`}
                    >
                      {busy === c.id ? '…' : c.deleted_at ? 'تفعيل' : 'تعطيل'}
                    </button>
                    <Link
                      href={`/admin/clinics/${c.id}`}
                      className="inline-flex items-center gap-1 text-xs text-slate-400 transition hover:text-amber-200"
                    >
                      عرض <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </Td>
              </tr>
            ))}
        </tbody>
      </DataTableShell>
    </div>
  );
}
