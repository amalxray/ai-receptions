'use client';

// #43 — per-member permission toggles.
//
// Regression note: this file previously shipped WITHOUT the load useEffect, so
// `loading` stayed true forever, every toggle was hidden behind
// `{!loading && …}` and the save button stayed disabled. The toggles now render
// IMMEDIATELY from the role base, and `loaded` only gates SAVING (so a
// replace-all overrides payload can never be sent before the existing overrides
// are known).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { PERMISSIONS, ALL_PERMISSION_KEYS, type PermissionKey } from '@/lib/auth/permissions';
import {
  PERMISSION_GROUPS,
  basePermissionsForRole,
  isCustomRoleName,
  resolvePermissionState,
  type CustomRoleLike,
} from '@/lib/auth/permissionGroups';

interface Props {
  userId: string;
  clinicId: string;
  role: string;
  userName: string;
  authHeaders: () => Promise<Record<string, string>>;
  onSaved?: () => void;
}

type Overrides = Record<string, boolean>;

export default function PermissionManager({ userId, clinicId, role, userName, authHeaders, onSaved }: Props) {
  const [overrides, setOverrides] = useState<Overrides>({});
  const [customRoles, setCustomRoles] = useState<CustomRoleLike[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const headersOf = useCallback(async () => {
    try {
      return typeof authHeaders === 'function' ? await authHeaders() : {};
    } catch {
      return {};
    }
  }, [authHeaders]);

  // Load the member's current overrides (and the custom-role base when the role
  // is clinic-defined) once per member/clinic.
  useEffect(() => {
    let alive = true;
    setLoaded(false);
    setError(null);

    (async () => {
      try {
        const headers = await headersOf();

        const res = await fetch(
          `/api/clinic/team/${encodeURIComponent(userId)}/permissions?clinic_id=${encodeURIComponent(clinicId)}`,
          { headers }
        );
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body?.error ?? 'تعذر تحميل صلاحيات العضو');
        if (!alive) return;

        const map: Overrides = {};
        for (const row of (body?.overrides ?? []) as Array<{ permission_key: string; enabled: boolean }>) {
          if ((ALL_PERMISSION_KEYS as readonly string[]).includes(row.permission_key)) {
            map[row.permission_key] = row.enabled === true;
          }
        }
        setOverrides(map);

        // A custom role's base lives in the DB, not in ROLE_DEFAULTS — without
        // this lookup every switch would wrongly read as "off".
        if (isCustomRoleName(role)) {
          const roleRes = await fetch(`/api/clinic/roles?clinic_id=${encodeURIComponent(clinicId)}`, { headers });
          if (roleRes.ok) {
            const roleBody = await roleRes.json().catch(() => ({}));
            if (alive) setCustomRoles((roleBody?.roles ?? []) as CustomRoleLike[]);
          }
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'تعذر تحميل صلاحيات العضو');
      } finally {
        if (alive) setLoaded(true);
      }
    })();

    return () => { alive = false; };
  }, [userId, clinicId, role, headersOf]);

  const base = useMemo(() => basePermissionsForRole(role, customRoles), [role, customRoles]);

  const toggle = (key: PermissionKey) => {
    setOverrides((prev) => {
      const current = resolvePermissionState(key, base, prev);
      const next: Overrides = { ...prev, [key]: !current.enabled };
      // A switch that ends up matching the role base is not an override at all —
      // drop it so the saved payload stays minimal and honest.
      if (next[key] === base.has(key)) delete next[key];
      return next;
    });
    setSaved(false);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const headers = await headersOf();
      const res = await fetch(`/api/clinic/team/${encodeURIComponent(userId)}/permissions`, {
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

  const enabledCount = ALL_PERMISSION_KEYS.filter(
    (key) => resolvePermissionState(key, base, overrides).enabled
  ).length;
  const changedCount = Object.keys(overrides).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-100">صلاحيات {userName}</h3>
          <p className="text-xs text-slate-500">
            الأساس: دور «{role}» · {enabledCount} من {ALL_PERMISSION_KEYS.length} صلاحية مفعّلة
            {changedCount > 0 && ` · ${changedCount} تخصيص فردي`}
          </p>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={saving || !loaded}
          title={!loaded ? 'جارٍ تحميل التخصيصات الحالية…' : undefined}
          className="rounded-full bg-cyan-500 px-5 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50"
        >
          {saving ? 'جارٍ الحفظ…' : saved ? '✓ تم الحفظ' : 'حفظ الصلاحيات'}
        </button>
      </div>

      {error && (
        <p className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-sm text-rose-300">
          {error}
        </p>
      )}
      {!loaded && !error && (
        <p className="text-xs text-slate-500">جارٍ تحميل التخصيصات الحالية… (يمكنك تصفح الصلاحيات أدناه)</p>
      )}

      {PERMISSION_GROUPS.map(([groupName, keys]) => (
        <div key={groupName} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
          <h4 className="mb-3 text-sm font-semibold text-cyan-300">{groupName}</h4>
          <div className="space-y-2">
            {keys.map((key) => {
              const { enabled, isOverride } = resolvePermissionState(key, base, overrides);
              return (
                <div key={key} className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-sm text-slate-200">
                    {PERMISSIONS[key]}
                    {isOverride && (
                      <span className="text-xs text-amber-400">
                        (مخصص {enabled ? '+' : '−'})
                      </span>
                    )}
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

      <p className="text-xs text-slate-500">
        الصلاحيات المضافة أو المسحوبة هنا تُطبَّق فوق صلاحيات الدور، وتُفحص على الخادم في كل طلب واجهة برمجية.
      </p>
    </div>
  );
}
