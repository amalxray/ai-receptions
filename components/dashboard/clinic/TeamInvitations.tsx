'use client';

// TEAM INVITATIONS PANEL (#38) — invite by email, copy the link, revoke.
// Wired to /api/clinic/invitations (POST/GET) and /api/clinic/invitations/{id}
// (DELETE). The token is returned ONCE by POST so an admin can share the link
// manually when email delivery is unavailable.

import { useCallback, useEffect, useState } from 'react';
import StatusPill from '@/components/dashboard/StatusPill';

const ROLES = ['manager', 'doctor', 'receptionist', 'staff'] as const;
const ROLE_AR: Record<string, string> = {
  manager: 'مدير',
  doctor: 'طبيب',
  receptionist: 'استقبال',
  staff: 'موظف',
};

type Invitation = {
  id: string;
  invited_email: string;
  role: string;
  status: string;
  expires_at: string;
  created_at: string;
  is_expired?: boolean;
};

type Props = {
  clinicId: string;
  authHeaders: () => Promise<Record<string, string>>;
};

async function parseJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

export default function TeamInvitations({ clinicId, authHeaders }: Props) {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ email: '', role: 'staff' });
  const [lastLink, setLastLink] = useState<{ url: string; email: string; emailSent: boolean } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    if (!clinicId) return;
    setLoading(true);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/clinic/invitations?clinic_id=${encodeURIComponent(clinicId)}`, { headers });
      const body = await parseJson(res);
      if (!res.ok) throw new Error(body?.error ?? 'تعذر تحميل الدعوات');
      setInvitations(body?.data ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل الدعوات');
    } finally {
      setLoading(false);
    }
  }, [clinicId, authHeaders]);

  useEffect(() => {
    void load();
  }, [load]);

  async function sendInvite(event: React.FormEvent) {
    event.preventDefault();
    if (!clinicId) return;
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/clinic/invitations?clinic_id=${encodeURIComponent(clinicId)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify({ email: form.email.trim(), role: form.role }),
      });
      const body = await parseJson(res);
      if (!res.ok) throw new Error(body?.error ?? 'تعذر إرسال الدعوة');

      setLastLink({
        url: body?.invite_url ?? '',
        email: body?.invitation?.invited_email ?? form.email.trim(),
        emailSent: Boolean(body?.email_sent),
      });
      setForm({ email: '', role: form.role });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر إرسال الدعوة');
    } finally {
      setBusy(false);
    }
  }

  async function revoke(invitation: Invitation) {
    if (!clinicId) return;
    if (!window.confirm(`إلغاء دعوة «${invitation.invited_email}»؟ لن يعمل الرابط بعد ذلك.`)) return;
    setBusy(true);
    setError(null);
    try {
      const headers = await authHeaders();
      const res = await fetch(
        `/api/clinic/invitations/${encodeURIComponent(invitation.id)}?clinic_id=${encodeURIComponent(clinicId)}`,
        { method: 'DELETE', headers }
      );
      const body = await parseJson(res);
      if (!res.ok) throw new Error(body?.error ?? 'تعذر إلغاء الدعوة');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر إلغاء الدعوة');
    } finally {
      setBusy(false);
    }
  }

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setError('تعذر النسخ تلقائيًا — انسخ الرابط يدويًا.');
    }
  }

  return (
    <div className="mb-6 rounded-[1.5rem] border border-slate-800 bg-slate-950/70 p-5">
      <h3 className="text-sm font-semibold text-slate-100">دعوة بالبريد</h3>
      <p className="mt-1 text-xs text-slate-400">
        أرسل دعوة لمن لا يملك حسابًا — يفتح الرابط، ينشئ كلمة المرور، وينضم فورًا بالدور المحدد.
      </p>

      {error && (
        <div role="alert" className="mt-3 rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {lastLink && (
        <div className="mt-3 rounded-2xl border border-cyan-500/40 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-200">
          <p>
            {lastLink.emailSent
              ? `أُرسلت الدعوة إلى ${lastLink.email}.`
              : `لم نتمكن من إرسال البريد — شارك الرابط مع ${lastLink.email} يدويًا.`}
          </p>
          {lastLink.url && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <code className="break-all text-[11px] text-cyan-300">{lastLink.url}</code>
              <button
                type="button"
                onClick={() => copyLink(lastLink.url)}
                className="rounded-full border border-cyan-500/40 px-3 py-1 text-xs text-cyan-200"
              >
                {copied ? 'تم النسخ' : 'نسخ الرابط'}
              </button>
            </div>
          )}
        </div>
      )}

      <form onSubmit={sendInvite} className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
        <input
          type="email"
          required
          value={form.email}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          placeholder="بريد المدعو (لا يحتاج حسابًا مسبقًا)"
          className="w-full rounded-2xl border border-slate-800 bg-slate-900 px-4 py-2.5 text-sm text-slate-100 outline-none focus:border-cyan-500"
        />
        <select
          value={form.role}
          onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
          className="rounded-2xl border border-slate-800 bg-slate-900 px-4 py-2.5 text-sm text-slate-100 outline-none focus:border-cyan-500"
        >
          {ROLES.map((r) => <option key={r} value={r}>{ROLE_AR[r]}</option>)}
        </select>
        <button
          type="submit"
          disabled={busy}
          className="rounded-full bg-cyan-500 px-5 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-50"
        >
          {busy ? '...' : 'إرسال دعوة'}
        </button>
      </form>

      <div className="mt-5">
        <h4 className="text-xs font-semibold text-slate-300">دعوات معلقة</h4>
        {loading ? (
          <p className="mt-2 text-xs text-slate-500">جارٍ التحميل…</p>
        ) : invitations.length === 0 ? (
          <p className="mt-2 text-xs text-slate-500">لا دعوات معلقة.</p>
        ) : (
          <div className="mt-2 space-y-2">
            {invitations.map((invitation) => (
              <div
                key={invitation.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm text-slate-100">{invitation.invited_email}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <StatusPill tone="neutral">{ROLE_AR[invitation.role] ?? invitation.role}</StatusPill>
                    <StatusPill tone={invitation.is_expired ? 'danger' : 'warning'}>
                      {invitation.is_expired ? 'منتهية' : 'بانتظار القبول'}
                    </StatusPill>
                    <span className="text-[11px] text-slate-500">
                      تنتهي {new Date(invitation.expires_at).toLocaleDateString('ar')}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => revoke(invitation)}
                  disabled={busy}
                  className="rounded-full border border-rose-500/40 px-3 py-1 text-xs text-rose-300 disabled:opacity-50"
                >
                  إلغاء
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
