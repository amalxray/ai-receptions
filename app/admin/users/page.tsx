'use client';

import { useEffect, useState } from 'react';

type UserRow = {
  id: string;
  email: string | null;
  created_at: string | null;
  memberships: number;
  is_platform_admin: boolean;
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="rounded-[2rem] border border-slate-800 bg-slate-900/90 p-6">
      <h2 className="text-lg font-semibold text-white">👥 المستخدمون</h2>
      <p className="mt-1 text-sm text-slate-400">جميع حسابات المنصة.</p>
      {error && <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</div>}
      {loading ? (
        <p className="mt-5 text-sm text-slate-400">جارٍ التحميل...</p>
      ) : (
        <ul className="mt-5 divide-y divide-slate-800">
          {users.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
              <div>
                <p className="font-semibold text-slate-200">{u.email ?? '-'}</p>
                <p className="text-xs text-slate-500">{u.created_at?.slice(0, 10) ?? '—'} · مسجل منذ</p>
              </div>
              <div className="flex gap-2 text-xs">
                <span className="rounded-full bg-slate-800 px-3 py-1 text-slate-300">{u.memberships} عضويات</span>
                {u.is_platform_admin && <span className="rounded-full bg-amber-500/15 px-3 py-1 text-amber-200">👑 مدير منصة</span>}
              </div>
            </li>
          ))}
          {users.length === 0 && <li className="py-3 text-sm text-slate-500">لا يوجد مستخدمون.</li>}
        </ul>
      )}
    </div>
  );
}