'use client';

// #43 — per-member permission toggles. Base comes from the member's role
// (ROLE_DEFAULTS or their custom role); toggles create per-user overrides
// that the API validates against the PERMISSIONS registry.

import { useEffect, useMemo, useState } from 'react';
import { PERMISSIONS, ROLE_DEFAULTS, type PermissionKey } from '@/lib/auth/permissions';

interface Props {
  userId: string;
  clinicId: string;
  role: string;
  userName: string;
  authHeaders: () => Promise<Record<string, string>>;
  onSaved?: () => void;
}

type Overrides = Record<string, boolean>;

const GROUPS: Array<[string, PermissionKey[]]> = [
  ['عام', ['view_overview']],
  ['المواعيد', ['view_appointments', 'manage_appointments']],
  ['المرضى', ['view_patients', 'manage_patients', 'delete_patients']],
  ['الملفات الطبية', ['view_medical_files', 'manage_medical_files']],
  ['الرسائل', ['view_messages', 'send_messages', 'view_conversations']],
  ['التصوير', ['view_imaging_requests', 'manage_imaging_requests']],
  ['العملاء المحتملون', ['view_leads', 'manage_leads']],
  ['المالية', ['view_financial', 'manage_invoices', 'manage_payments', 'manage_expenses']],
  ['التحليلات', ['view_analytics', 'view_growth']],
  ['الإدارة', ['manage_team', 'manage_settings', 'manage_ads', 'manage_knowledge', 'manage_subscription']],
  ['الصفحة العامة', ['view_public_page', 'manage_public_page']],
];

export default function PermissionManager({ userId, clinicId, role, userName, authHeaders, onSaved }: Props) {
  const [overrides, setOverrides] = useState<Overrides>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const roleDefaults = useMemo(
    () => new Set<string>(ROLE_DEFAULTS[role] ?? []),
    [role]
  );

  const isEnabled = (key: PermissionKey): boolean => {
    if (key in overrides) return overrides[key];
    return roleDefaults.has(key);
  };

  const toggle = (key: PermissionKey) => {
    setOverrides((prev) => ({ ...prev, [key]: !isEnabled(key) }));
    setSaved(false);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/clinic/team/${userId}/permissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ clinic_id: clinicId, permissions: overrides }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? 'تعذر حفظ الصلاحيات');
      setSaved(true);
      onSaved?.();
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر حفظ الصلاحيات');
    } finally {
      setSaving(false);
    }
  };

  const changedCount = Object.keys(overrides).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-100">صلاحيات {userName}</h3>
          <p className="text-xs text-slate-500">الأساس: دور «{role}»{changedCount > 0 && ` · ${changedCount} تخصيص فردي`}</p>
        </div>
        <button
          onClick={save}
          disabled={saving || loading}
          className="rounded-full bg-cyan-500 px-5 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50"
        >
          {saving ? 'جارٍ الحفظ…' : saved ? '✓ تم الحفظ' : 'حفظ الصلاحيات'}
        </button>
      </div>

      {error && <p className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-sm text-rose-300">{error}</p>}
      {loading && <div className="h-40 animate-pulse rounded-2xl bg-slate-800/60" />}

      {!loading && GROUPS.map(([groupName, keys]) => (
        <div key={groupName} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
          <h4 className="mb-3 text-sm font-semibold text-cyan-300">{groupName}</h4>
          <div className="space-y-2">
            {keys.map((key) => {
              const enabled = isEnabled(key);
              const isOverride = key in overrides;
              return (
                <div key={key} className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-sm text-slate-200">
                    {PERMISSIONS[key]}
                    {isOverride && <span className="text-xs text-amber-400">(مخصص)</span>}
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={enabled}
                    aria-label={PERMISSIONS[key]}
                    onClick={() => toggle(key)}
                    className={`relative h-6 w-11 shrink-0 rounded-full transition ${enabled ? 'bg-emerald-500' : 'bg-slate-600'}`}
                  >
                    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${enabled ? 'left-5' : 'left-0.5'}`} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

