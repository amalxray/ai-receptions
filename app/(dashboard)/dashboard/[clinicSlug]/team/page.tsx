'use client';

// STEP 15G-B — real Team management wired to /api/clinic/members.
// Lists members, toggles role/active (PATCH) and removes (DELETE). Membership
// is GAINED exclusively through email invitations (#38) — the legacy
// "add existing account" form was removed (it errored with "المستخدم غير
// موجود" for anyone who had not registered yet).
// Captures 402 ENTITLEMENT_LIMIT_REACHED and renders an Upgrade CTA pointing to
// /dashboard/subscription?upgrade=1&resource=users&plan=...

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import DashboardSection from '@/components/dashboard/DashboardSection';
import EmptyState from '@/components/dashboard/EmptyState';
import Skeleton from '@/components/ui/Skeleton';
import StatusPill from '@/components/dashboard/StatusPill';
import UpgradeCta from '@/components/dashboard/subscription/UpgradeCta';
import TeamInvitations from '@/components/dashboard/clinic/TeamInvitations';
import { useClinicContext } from '@/lib/useClinicContext';
import type { EntitlementResource } from '@/lib/subscription/entitlements';
import type { CustomRole } from '@/components/dashboard/team/CustomRoleManager';

const ROLES = ['owner', 'manager', 'doctor', 'receptionist', 'staff'] as const;
const ROLE_AR: Record<string, string> = {
  owner: 'مالك',
  manager: 'مدير',
  doctor: 'طبيب',
  receptionist: 'استقبال',
  staff: 'موظف',
};
const CANNOT_DEMOTE: Record<string, string> = {
  owner: 'مالك',
  manager: 'مدير',
};

function roleTone(role: string): 'success' | 'warning' | 'danger' | 'neutral' {
  if (role === 'owner') return 'success';
  if (role === 'manager') return 'warning';
  return 'neutral';
}

type Member = {
  id: string;
  user_id: string;
  role: string;
  is_active: boolean;
  created_at: string;
  email?: string | null;
};

async function parseJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

export default function TeamPage() {
  const { clinicId, clinicSlug, role: myRole, authHeaders, loading: clinicLoading, error: clinicError } = useClinicContext();
  const [members, setMembers] = useState<Member[]>([]);
  const [customRoles, setCustomRoles] = useState<CustomRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [blockedResource, setBlockedResource] = useState<EntitlementResource | null>(null);
  const [edit, setEdit] = useState<{ member: Member; role: string } | null>(null);

  const load = useCallback(async () => {
    if (!clinicId) return;
    setLoading(true);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/clinic/members?clinic_id=${encodeURIComponent(clinicId)}`, { headers });
      const body = await parseJson(res);
      if (!res.ok) throw new Error(body?.error ?? 'تعذر تحميل الفريق');
      setMembers(body?.data ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل الفريق');
    } finally {
      setLoading(false);
    }
  }, [clinicId, authHeaders]);

  // #43 — custom roles for the role picker (admin only; server enforces).
  useEffect(() => {
    if (!clinicId || !myRole || !['owner', 'manager'].includes(myRole)) return;
    let alive = true;
    (async () => {
      try {
        const headers = await authHeaders();
        const res = await fetch(`/api/clinic/roles?clinic_id=${encodeURIComponent(clinicId)}`, { headers });
        const body = await res.json().catch(() => ({}));
        if (res.ok && alive) setCustomRoles(body?.roles ?? []);
      } catch { /* non-fatal */ }
    })();
    return () => { alive = false; };
  }, [clinicId, myRole, authHeaders]);

  useEffect(() => {
    if (clinicLoading) { setLoading(true); return; }
    if (!clinicId) { setLoading(false); return; }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinicLoading, clinicId]);


  function startEdit(member: Member) {
    setEdit({ member, role: member.role });
  }

  async function saveEdit() {
    if (!clinicId || !edit) return;
    setBusy(true); setError(null); setBlockedResource(null);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/clinic/members?clinic_id=${encodeURIComponent(clinicId)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify({ user_id: edit.member.user_id, role: edit.role }),
      });
      const body = await parseJson(res);
      if (!res.ok) throw new Error(body?.error ?? 'تعذر تحديث العضو');
      setEdit(null);
      await load();
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : 'تعذر تحديث العضو');
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(member: Member) {
    if (!clinicId) return;
    setBusy(true); setError(null); setBlockedResource(null);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/clinic/members?clinic_id=${encodeURIComponent(clinicId)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify({ user_id: member.user_id, is_active: !member.is_active }),
      });
      const body = await parseJson(res);
      if (!res.ok) throw new Error(body?.error ?? 'تعذر تحديث حالة العضو');
      await load();
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : 'تعذر تحديث حالة العضو');
    } finally {
      setBusy(false);
    }
  }

  async function removeMember(member: Member) {
    if (!clinicId) return;
    if (!window.confirm(`إزالة «${member.email ?? member.user_id}» من الفريق؟ (لا يُحذف الحساب)`)) return;
    setBusy(true); setError(null); setBlockedResource(null);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/clinic/members?clinic_id=${encodeURIComponent(clinicId)}`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify({ user_id: member.user_id }),
      });
      const body = await parseJson(res);
      if (!res.ok) throw new Error(body?.error ?? 'تعذر إزالة العضو');
      await load();
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : 'تعذر إزالة العضو');
    } finally {
      setBusy(false);
    }
  }

  if (clinicLoading) return <Skeleton className="h-60" />;
  if (clinicError) return <EmptyState title="تعذر تحميل الفريق" description={clinicError} />;
  if (!clinicId) return <EmptyState title="لا توجد عيادة" description="سجّل الدخول لإدارة الفريق." />;

  return (
    <DashboardSection title="إدارة الفريق" subtitle="أضف أعضاء فريق العيادة وأدوارهم — تُطبَّق الحدود على الخادم (أعضاء الفريق).">
      {blockedResource && <div className="mb-4"><UpgradeCta resource={blockedResource} /></div>}
      {error && (
        <div role="alert" className="mb-4 rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* #43 — custom roles management */}
      {clinicSlug && ['owner', 'manager'].includes(myRole ?? '') && (
        <div className="mb-4 flex justify-end">
          <Link
            href={`/dashboard/${clinicSlug}/team/roles`}
            className="rounded-full border border-cyan-500/40 bg-cyan-500/10 px-4 py-1.5 text-xs font-semibold text-cyan-300"
          >
            الأدوار والصلاحيات
          </Link>
        </div>
      )}

      {/* #38 — invite by email (works for people without an account) */}
      <TeamInvitations clinicId={clinicId} authHeaders={authHeaders} />

      {/* Members list */}
      {loading ? (
        <Skeleton className="h-40" />
      ) : members.length === 0 ? (
        <EmptyState title="لا أعضاء بعد" description="أضف أول عضو عبر النموذج أعلاه." />
      ) : (
        <div className="space-y-3">
          {members.map((member) => (
            <div key={member.id} className="rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-100">{member.email ?? member.user_id}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <StatusPill tone={roleTone(member.role)}>{ROLE_AR[member.role] ?? member.role}</StatusPill>
                    <StatusPill tone={member.is_active ? 'success' : 'neutral'}>{member.is_active ? 'نشط' : 'معطَّل'}</StatusPill>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {edit?.member.id === member.id ? (
                    <>
                      <select
                        value={edit.role}
                        onChange={(e) => setEdit((cur) => cur ? { ...cur, role: e.target.value } : cur)}
                        className="rounded-xl border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100"
                      >
                        {CANNOT_DEMOTE[member.role]
                          ? <option value={member.role}>{ROLE_AR[member.role]}</option>
                          : (
                            <>
                              {ROLES.filter((r) => r !== 'owner').map((r) => <option key={r} value={r}>{ROLE_AR[r]}</option>)}
                              {customRoles.map((cr) => <option key={cr.id} value={cr.name}>{cr.name} (مخصص)</option>)}
                            </>
                          )}
                      </select>
                      <button type="button" onClick={saveEdit} disabled={busy} className="rounded-full bg-cyan-500 px-3 py-1 text-xs font-semibold text-slate-950 disabled:opacity-50">حفظ</button>
                      <button type="button" onClick={() => setEdit(null)} disabled={busy} className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300 disabled:opacity-50">إلغاء</button>
                    </>
                  ) : (
                    <button type="button" onClick={() => startEdit(member)} disabled={busy} className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300 disabled:opacity-50">تغيير الدور</button>
                  )}
                  {clinicSlug && (
                    <Link
                      href={`/dashboard/${clinicSlug}/team/${member.user_id}`}
                      className="rounded-full border border-cyan-500/40 px-3 py-1 text-xs text-cyan-300"
                    >
                      الملف والصلاحيات
                    </Link>
                  )}
                  <button type="button" onClick={() => toggleActive(member)} disabled={busy} className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300 disabled:opacity-50">
                    {member.is_active ? 'تعطيل' : 'تفعيل'}
                  </button>
                  <button type="button" onClick={() => removeMember(member)} disabled={busy} className="rounded-full border border-rose-500/40 px-3 py-1 text-xs text-rose-300 disabled:opacity-50">إزالة</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="mt-6 text-xs text-slate-500">
        يبقى حساب المالك/المديرين محميًا على الخادم (لا يمكن إزالة آخر مالك). إزالة عضو تُعطِّل وصوله للعيادة فقط ولا تحذف حسابه.
      </p>
    </DashboardSection>
  );
}
