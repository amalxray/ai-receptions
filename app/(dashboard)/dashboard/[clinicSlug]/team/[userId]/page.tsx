'use client';

// #43 — member profile + per-user permission overrides.
// Admins can edit non-owner members; everyone can VIEW their own profile.
// Owner is untouchable by design (server enforces; UI mirrors).

import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import DashboardSection from '@/components/dashboard/DashboardSection';
import EmptyState from '@/components/dashboard/EmptyState';
import Skeleton from '@/components/ui/Skeleton';
import StatusPill from '@/components/dashboard/StatusPill';
import PermissionManager from '@/components/dashboard/team/PermissionManager';
import { useClinicContext } from '@/lib/useClinicContext';
import { supabase } from '@/lib/supabase';

const ROLE_AR: Record<string, string> = {
  owner: 'مالك',
  manager: 'مدير',
  doctor: 'طبيب',
  receptionist: 'استقبال',
  staff: 'موظف',
};

type Member = { id: string; user_id: string; role: string; is_active: boolean; email?: string | null };

export default function MemberProfilePage() {
  const params = useParams<{ clinicSlug: string; userId: string }>();
  const userId = params?.userId ?? '';
  const { clinicId, role: myRole, authHeaders, loading: clinicLoading, error: clinicError } = useClinicContext();

  const [member, setMember] = useState<Member | null>(null);
  const [ownEmail, setOwnEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = myRole === 'owner' || myRole === 'manager';

  const load = useCallback(async () => {
    if (!clinicId || !userId) return;
    setLoading(true);
    try {
      const headers = await authHeaders();
      if (isAdmin) {
        const res = await fetch(`/api/clinic/members?clinic_id=${encodeURIComponent(clinicId)}`, { headers });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body?.error ?? 'تعذر تحميل بيانات العضو');
        const found = (body?.data ?? []).find((m: Member) => m.user_id === userId) ?? null;
        setMember(found);
        if (!found) setError('العضو غير موجود في هذه العيادة');
      } else {
        // Non-admin: can only view their own profile.
        const { data: userData } = await supabase.auth.getUser();
        if (userData?.user?.id !== userId) {
          setError('غير مصرّح بعرض هذا الملف');
        } else {
          setOwnEmail(userData.user.email ?? null);
          setMember({ id: userId, user_id: userId, role: myRole ?? 'staff', is_active: true });
        }
      }
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل بيانات العضو');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinicId, userId, isAdmin, myRole]);

  useEffect(() => {
    if (clinicLoading) { setLoading(true); return; }
    if (!clinicId) { setLoading(false); return; }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinicLoading, clinicId]);

  if (clinicLoading) return <Skeleton className="h-60" />;
  if (clinicError) return <EmptyState title="تعذر التحميل" description={clinicError} />;
  if (!clinicId) return <EmptyState title="لا توجد عيادة" description="سجّل الدخول لعرض الملف." />;

  const canEdit = isAdmin && member && member.role !== 'owner' &&
    !(myRole === 'manager' && member.role === 'manager');

  return (
    <DashboardSection title="ملف العضو" subtitle="الملف الشخصي للعضو وصلاحياته الفردية داخل هذه العيادة.">
      {loading && <Skeleton className="h-40" />}

      {!loading && error && (
        <EmptyState title="تعذر العرض" description={error} />
      )}

      {!loading && member && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
            <h2 className="text-xl font-semibold text-slate-100">{member.email ?? ownEmail ?? member.user_id}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusPill tone={member.role === 'owner' ? 'success' : 'neutral'}>
                {ROLE_AR[member.role] ?? member.role}
              </StatusPill>
              {isAdmin && (
                <StatusPill tone={member.is_active ? 'success' : 'neutral'}>
                  {member.is_active ? 'نشط' : 'معطَّل'}
                </StatusPill>
              )}
            </div>
          </div>

          {canEdit && (
            <PermissionManager
              userId={member.user_id}
              clinicId={clinicId}
              role={member.role}
              userName={member.email ?? member.user_id}
              authHeaders={authHeaders}
              onSaved={load}
            />
          )}

          {member.role === 'owner' && (
            <p className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
              المالك له كل الصلاحيات دائمًا ولا يمكن تقييده.
            </p>
          )}

          {!isAdmin && !error && (
            <p className="text-xs text-slate-500">هذه صفحتك الشخصية — تعديل الصلاحيات متاح للمالك/المدير فقط.</p>
          )}
        </div>
      )}
    </DashboardSection>
  );
}
