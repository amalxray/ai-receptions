'use client';

// #43 — الأدوار والصلاحيات: create/delete clinic custom roles.
// Assignment happens on the Team page (تغيير الدور → custom role name).

import { useCallback, useEffect, useState } from 'react';
import DashboardSection from '@/components/dashboard/DashboardSection';
import EmptyState from '@/components/dashboard/EmptyState';
import Skeleton from '@/components/ui/Skeleton';
import CustomRoleManager, { type CustomRole } from '@/components/dashboard/team/CustomRoleManager';
import { useClinicContext } from '@/lib/useClinicContext';
import { isPermissionKey, type PermissionKey } from '@/lib/auth/permissions';
import type { EntitlementResource } from '@/lib/subscription/entitlements';
import UpgradeCta from '@/components/dashboard/subscription/UpgradeCta';

export default function TeamRolesPage() {
  const { clinicId, role: myRole, authHeaders, loading: clinicLoading, error: clinicError } = useClinicContext();
  const [roles, setRoles] = useState<CustomRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blockedResource, setBlockedResource] = useState<EntitlementResource | null>(null);

  const isAdmin = myRole === 'owner' || myRole === 'manager';

  const load = useCallback(async () => {
    if (!clinicId) return;
    setLoading(true);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/clinic/roles?clinic_id=${encodeURIComponent(clinicId)}`, { headers });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? 'تعذر تحميل الأدوار');
      setRoles(body?.roles ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل الأدوار');
    } finally {
      setLoading(false);
    }
  }, [clinicId, authHeaders]);

  useEffect(() => {
    if (clinicLoading) { setLoading(true); return; }
    if (!clinicId) { setLoading(false); return; }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinicLoading, clinicId]);

  const onCreate = async (payload: { name: string; description: string; color: string; permissions: PermissionKey[] }) => {
    if (!clinicId) return false;
    setError(null);
    try {
      const headers = await authHeaders();
      const res = await fetch('/api/clinic/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          clinic_id: clinicId,
          name: payload.name.trim(),
          description: payload.description || null,
          color: payload.color,
          permissions: payload.permissions.filter(isPermissionKey),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? 'تعذر إنشاء الدور');
      await load();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر إنشاء الدور');
      return false;
    }
  };

  const onDelete = async (role: CustomRole) => {
    if (!clinicId) return;
    if (!window.confirm(`حذف الدور «${role.name}»؟`)) return;
    setError(null);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/clinic/roles/${role.id}?clinic_id=${encodeURIComponent(clinicId)}`, {
        method: 'DELETE',
        headers,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? 'تعذر حذف الدور');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر حذف الدور');
    }
  };

  if (clinicLoading) return <Skeleton className="h-60" />;
  if (clinicError) return <EmptyState title="تعذر تحميل الأدوار" description={clinicError} />;
  if (!clinicId) return <EmptyState title="لا توجد عيادة" description="سجّل الدخول لإدارة الأدوار." />;
  if (!isAdmin) {
    return <EmptyState title="غير مصرّح" description="إدارة الأدوار متاحة للمالك والمدير فقط." />;
  }

  return (
    <DashboardSection title="الأدوار والصلاحيات" subtitle="أنشئ أدوارًا مخصصة بصلاحيات دقيقة، ثم أسندها للأعضاء من صفحة الفريق.">
      {blockedResource && <div className="mb-4"><UpgradeCta resource={blockedResource} /></div>}
      {error && (
        <div role="alert" className="mb-4 rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      )}
      {loading ? (
        <Skeleton className="h-60" />
      ) : (
        <CustomRoleManager
          roles={roles}
          creating={creating}
          setCreating={setCreating}
          onCreate={onCreate}
          onDelete={onDelete}
        />
      )}
      <p className="mt-6 text-xs text-slate-500">
        لا يمكن حذف دور ما دام عضوًا نشطًا يحمله — غيّر دور العضو أولًا. المالك يملك كل الصلاحيات دائمًا ولا يخضع للتقييد.
      </p>
    </DashboardSection>
  );
}
