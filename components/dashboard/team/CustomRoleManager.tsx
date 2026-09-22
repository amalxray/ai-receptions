'use client';

// #43 — create/delete clinic-wide CUSTOM roles (owner/manager only).
// A custom role is assigned by setting a member's role to its name
// (Team page → تغيير الدور).

import { useState } from 'react';
import { PERMISSIONS, type PermissionKey } from '@/lib/auth/permissions';

export interface CustomRole {
  id: string;
  name: string;
  description: string | null;
  permissions: string[];
  color: string | null;
  is_system: boolean | null;
}

interface Props {
  roles: CustomRole[];
  creating: boolean;
  setCreating: (v: boolean) => void;
  onCreate: (payload: { name: string; description: string; color: string; permissions: PermissionKey[] }) => Promise<boolean>;
  onDelete: (role: CustomRole) => Promise<void>;
}

export default function CustomRoleManager({ roles, creating, setCreating, onCreate, onDelete }: Props) {
  const [newRole, setNewRole] = useState<{ name: string; description: string; color: string; permissions: PermissionKey[] }>({
    name: '',
    description: '',
    color: '#10b981',
    permissions: [],
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const saveNew = async () => {
    if (!newRole.name.trim()) { setError('اسم الدور مطلوب'); return; }
    setBusy(true);
    setError(null);
    const ok = await onCreate(newRole);
    setBusy(false);
    if (ok) {
      setNewRole({ name: '', description: '', color: '#10b981', permissions: [] });
      setCreating(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-100">الأدوار المخصصة</h3>
        {!creating && (
          <button
            onClick={() => setCreating(true)}
            className="rounded-full bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950"
          >
            + دور جديد
          </button>
        )}
      </div>

      {creating && (
        <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
          <input
            placeholder="اسم الدور (مثال: سكرتيرة متقدمة)"
            value={newRole.name}
            onChange={(e) => setNewRole({ ...newRole, name: e.target.value })}
            className="w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-2.5 text-sm text-slate-100 outline-none focus:border-cyan-500"
          />
          <textarea
            placeholder="الوصف (اختياري)"
            value={newRole.description}
            onChange={(e) => setNewRole({ ...newRole, description: e.target.value })}
            className="w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-2.5 text-sm text-slate-100 outline-none focus:border-cyan-500"
          />
          <div className="flex items-center gap-3 text-sm text-slate-300">
            <label>اللون:</label>
            <input
              type="color"
              value={newRole.color}
              onChange={(e) => setNewRole({ ...newRole, color: e.target.value })}
              className="h-8 w-14 cursor-pointer rounded-lg border border-slate-700 bg-transparent"
            />
          </div>
          <div className="max-h-72 space-y-2 overflow-y-auto rounded-2xl border border-slate-800 p-3">
            {Object.entries(PERMISSIONS).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-sm text-slate-200">
                <input
                  type="checkbox"
                  checked={newRole.permissions.includes(key as PermissionKey)}
                  onChange={(e) => {
                    const perms = e.target.checked
                      ? [...newRole.permissions, key as PermissionKey]
                      : newRole.permissions.filter((p) => p !== key);
                    setNewRole({ ...newRole, permissions: perms });
                  }}
                  className="h-4 w-4 accent-cyan-500"
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
          {error && <p className="text-sm text-rose-400">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={saveNew}
              disabled={busy}
              className="rounded-full bg-emerald-500 px-5 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50"
            >
              {busy ? 'جارٍ الحفظ…' : 'حفظ الدور'}
            </button>
            <button
              onClick={() => { setCreating(false); setError(null); }}
              className="rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-300"
            >
              إلغاء
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {roles.length === 0 && (
          <p className="rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-6 text-center text-sm text-slate-500">
            لا توجد أدوار مخصصة بعد. أنشئ دورًا وحدد صلاحياته بدقة.
          </p>
        )}
        {roles.map((role) => (
          <div key={role.id} className="rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full" style={{ background: role.color ?? '#10b981' }} />
              <h4 className="font-semibold text-slate-100">{role.name}</h4>
              <span className="text-xs text-slate-500">{role.permissions.length} صلاحية</span>
            </div>
            {role.description && <p className="mt-1 text-sm text-slate-400">{role.description}</p>}
            {!role.is_system && (
              <button
                onClick={() => onDelete(role)}
                className="mt-2 text-sm text-rose-400 hover:text-rose-300"
              >
                حذف
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
