'use client';

import { useEffect, useMemo, useState } from 'react';
import { Users } from 'lucide-react';
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

type UserRow = {
  id: string;
  email: string | null;
  created_at: string | null;
  memberships: number;
  is_platform_admin: boolean;
};

const ROLE_OPTIONS = [
  { value: 'all', label: 'الكل' },
  { value: 'admin', label: 'مديرو المنصة' },
  { value: 'member', label: 'أعضاء المؤسسات' },
  { value: 'none', label: 'بدون عضوية' },
];

const SORT_OPTIONS = [
  { value: 'newest', label: 'الأحدث' },
  { value: 'email', label: 'البريد' },
  { value: 'memberships', label: 'العضويات' },
];

const dateFmt = new Intl.DateTimeFormat('ar-EG', { day: 'numeric', month: 'short', year: 'numeric' });

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [role, setRole] = useState('all');
  const [sort, setSort] = useState('newest');

  useEffect(() => {
    fetch('/api/admin/users')
      .then((r) => r.json())
      .then((b) => {
        if (!b.data) throw new Error(b.error ?? 'فشل التحميل');
        setUsers(b.data.users as UserRow[]);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'فشل التحميل'))
      .finally(() => setLoading(false));
  }, []);

  const view = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = users.filter((u) => {
      if (q && !(u.email ?? '').toLowerCase().includes(q)) return false;
      if (role === 'admin' && !u.is_platform_admin) return false;
      if (role === 'member' && (u.is_platform_admin || u.memberships === 0)) return false;
      if (role === 'none' && u.memberships > 0) return false;
      return true;
    });
    return filtered.sort((a, b) => {
      if (sort === 'email') return (a.email ?? '').localeCompare(b.email ?? '');
      if (sort === 'memberships') return b.memberships - a.memberships;
      return new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime();
    });
  }, [users, query, role, sort]);

  return (
    <div className="rounded-[2rem] border border-slate-800 bg-slate-900/50 p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
            <Users className="h-5 w-5 text-amber-300" />
            المستخدمون
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            {view.length} من {users.length} حساب على المنصة.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SearchInput value={query} onChange={setQuery} placeholder="ابحث بالبريد الإلكتروني…" />
          <FilterSelect label="النوع" value={role} onChange={setRole} options={ROLE_OPTIONS} />
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
            <Th>الحساب</Th>
            <Th>الدور</Th>
            <Th>العضويات</Th>
            <Th>الانضمام</Th>
          </tr>
        </thead>
        <tbody>
          {loading && <TableMessage colSpan={4}>جارٍ التحميل…</TableMessage>}
          {!loading && view.length === 0 && <TableMessage colSpan={4}>لا يوجد مستخدمون مطابقون.</TableMessage>}
          {!loading &&
            view.map((u) => (
              <tr key={u.id} className="transition hover:bg-slate-800/40">
                <Td>
                  <div className="flex items-center gap-3">
                    <Avatar label={u.email ?? '؟'} tone={u.is_platform_admin ? 'owner' : 'info'} />
                    <span className="truncate font-medium text-slate-100">{u.email ?? '—'}</span>
                  </div>
                </Td>
                <Td>
                  {u.is_platform_admin ? (
                    <Badge tone="owner">👑 مدير منصة</Badge>
                  ) : u.memberships > 0 ? (
                    <Badge tone="success">عضو مؤسسة</Badge>
                  ) : (
                    <Badge tone="neutral">بلا عضوية</Badge>
                  )}
                </Td>
                <Td>
                  <span className="font-semibold text-white">{u.memberships}</span>
                </Td>
                <Td className="whitespace-nowrap text-slate-400">
                  {u.created_at ? dateFmt.format(new Date(u.created_at)) : '—'}
                </Td>
              </tr>
            ))}
        </tbody>
      </DataTableShell>
    </div>
  );
}
