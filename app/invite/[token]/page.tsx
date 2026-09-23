'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

/**
 * TEAM INVITATION ACCEPTANCE PAGE (#38) — /invite/{token}
 *
 * One link, two paths:
 *   - the mailbox has NO account → the invitee sets a password here and joins
 *     immediately (account created confirmed, then auto sign-in);
 *   - the mailbox HAS an account → sign in, come back, single "انضم" click.
 *
 * The token is only ever sent to our API (never logged, never rendered).
 *
 * Timings (migration 20261017): the LINK is valid 24h, and merely opening it
 * starts a 30-minute SESSION in the database. The countdown below is UX only —
 * `open_invitation`/`accept_invitation` re-check the real clock on every call, so
 * a tampered client cannot outlive either window.
 */

type InvitationPreview = {
  clinic_name: string;
  clinic_slug: string | null;
  role: string;
  role_label: string;
  email_masked: string;
  status: 'pending' | 'accepted' | 'revoked' | 'expired' | string;
  expires_at: string;
  has_account: boolean;
  /** 30-minute opening session started by the GET preview. */
  session_valid_until: string | null;
  session_minutes: number;
  session_reopened: boolean;
};

/** mm:ss for the session countdown. */
function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export default function AcceptInvitationPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const token = useMemo(() => (typeof params?.token === 'string' ? params.token : ''), [params]);

  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [now, setNow] = useState(() => Date.now());
  // Guards the auto-reopen so an expired session triggers exactly one refresh.
  const sessionRenewedRef = useRef(false);

  const loadPreview = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!token) {
        setError('رابط الدعوة غير صالح.');
        setLoading(false);
        return;
      }
      // `silent` keeps the form on screen while the session is renewed in the
      // background (a full loading state would wipe what the invitee is typing).
      if (!options?.silent) setLoading(true);
      try {
        const res = await fetch(`/api/invitations/accept?token=${encodeURIComponent(token)}`);
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body?.error ?? 'تعذر تحميل الدعوة');
        setPreview(body.invitation as InvitationPreview);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'تعذر تحميل الدعوة');
      } finally {
        if (!options?.silent) setLoading(false);
      }
    },
    [token]
  );

  useEffect(() => {
    void loadPreview();
  }, [loadPreview]);

  // A 1s tick drives the mm:ss session countdown.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const sessionDeadline = preview?.session_valid_until ? new Date(preview.session_valid_until).getTime() : null;
  const sessionSecondsLeft =
    sessionDeadline === null ? null : Math.max(0, Math.ceil((sessionDeadline - now) / 1000));
  const sessionExpired = sessionSecondsLeft !== null && sessionSecondsLeft === 0;

  // A fresh deadline resets the guard, so the NEXT expiry can also auto-renew.
  useEffect(() => {
    if (preview?.session_valid_until) sessionRenewedRef.current = false;
  }, [preview?.session_valid_until]);

  // Session ran out with the page still open → renew it once, in the background.
  // The server decides: a link that has itself expired comes back as 'expired'
  // and the page switches to the blocked state.
  useEffect(() => {
    if (!sessionExpired || sessionRenewedRef.current) return;
    sessionRenewedRef.current = true;
    void loadPreview({ silent: true });
  }, [sessionExpired, loadPreview]);

  useEffect(() => {
    // Best-effort: who is currently signed in (drives the correct CTA).
    void (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        setSignedInEmail(data.session?.user?.email ?? null);
      } catch {
        setSignedInEmail(null);
      }
    })();
  }, []);

  async function acceptWithSession() {
    setBusy(true);
    setError(null);
    try {
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;
      const res = await fetch('/api/invitations/accept', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ token }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body?.error ?? 'تعذر قبول الدعوة');
        return;
      }
      const clinicSlug = body?.data?.clinic?.slug as string | null;
      setNotice('تم انضمامك إلى الفريق بنجاح. جارٍ التحويل إلى لوحة التحكم…');
      router.replace(clinicSlug ? `/dashboard/${encodeURIComponent(clinicSlug)}/overview` : '/dashboard');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر قبول الدعوة');
    } finally {
      setBusy(false);
    }
  }

  async function acceptWithPassword(event: React.FormEvent) {
    event.preventDefault();
    if (password !== confirmPassword) {
      setError('كلمتا المرور غير متطابقتين.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/invitations/accept', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body?.error ?? 'تعذر قبول الدعوة');
        return;
      }

      const clinicSlug = body?.data?.clinic?.slug as string | null;
      const invitedEmail = body?.data?.invited_email as string | undefined;
      const destination = clinicSlug ? `/dashboard/${encodeURIComponent(clinicSlug)}/overview` : '/dashboard';

      // The API returns the mailbox ONLY when it created the account in this
      // request, so signing in immediately is safe and needs no extra step.
      if (invitedEmail) {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email: invitedEmail, password });
        if (!signInError) {
          setNotice('تم إنشاء حسابك وانضمامك للفريق. جارٍ التحويل إلى لوحة التحكم…');
          router.replace(destination);
          return;
        }
      }

      setNotice('تم انضمامك. سجّل الدخول للمتابعة.');
      router.replace(`/login?next=${encodeURIComponent(destination)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر قبول الدعوة');
    } finally {
      setBusy(false);
    }
  }


  const statusBlocked = preview && preview.status !== 'pending';

  function statusMessage(status: string): string {
    if (status === 'accepted') return 'تم استخدام هذه الدعوة بالفعل. سجّل الدخول للوصول إلى لوحة التحكم.';
    if (status === 'revoked') return 'تم إلغاء هذه الدعوة من قبل إدارة العيادة.';
    if (status === 'expired') return 'انتهت صلاحية هذه الدعوة (تنتهي الروابط بعد 24 ساعة). اطلب من إدارة العيادة إرسال دعوة جديدة أو تمديدها.';
    return 'هذه الدعوة لم تعد صالحة.';
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-12 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-lg rounded-[2rem] border border-slate-800 bg-slate-900/90 p-8 shadow-xl shadow-slate-950/30">
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-cyan-400">دعوة فريق</p>

        {loading ? (
          <p className="text-sm text-slate-400">جارٍ تحميل الدعوة…</p>
        ) : !preview ? (
          <>
            <h1 className="text-2xl font-semibold text-white">تعذر فتح الدعوة</h1>
            <p role="alert" className="mt-3 text-sm text-red-300">{error ?? 'رابط الدعوة غير صالح.'}</p>
            <p className="mt-6 text-sm text-slate-400">
              <Link href="/login" className="text-cyan-400 hover:text-cyan-300">تسجيل الدخول</Link>
            </p>
          </>
        ) : statusBlocked ? (
          <>
            <h1 className="text-2xl font-semibold text-white">{statusMessage(preview.status)}</h1>
            <p className="mt-6 text-sm text-slate-400">
              <Link href="/login" className="text-cyan-400 hover:text-cyan-300">تسجيل الدخول إلى حسابك</Link>
            </p>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-semibold text-white">دعوة للانضمام إلى {preview.clinic_name}</h1>
            <p className="mt-3 text-sm text-slate-300">
              تمت دعوتك بصلاحية <span className="font-semibold text-cyan-300">{preview.role_label}</span>
            </p>
            <ul className="mt-4 space-y-1 text-xs text-slate-400">
              <li>البريد المدعو: <span className="text-slate-200">{preview.email_masked}</span></li>
              <li>
                تنتهي الدعوة: <span className="text-slate-200">{new Date(preview.expires_at).toLocaleString('ar')}</span>
                <span className="text-slate-500"> (روابط الدعوة صالحة 24 ساعة)</span>
              </li>
              {sessionSecondsLeft !== null && (
                <li>
                  جلسة الفتح:{' '}
                  <span
                    className={
                      sessionSecondsLeft === 0
                        ? 'text-amber-300'
                        : sessionSecondsLeft <= 120
                          ? 'text-amber-300'
                          : 'text-slate-200'
                    }
                  >
                    {sessionSecondsLeft === 0
                      ? 'انتهت — جارٍ تجديدها…'
                      : `${formatCountdown(sessionSecondsLeft)} متبقية من أصل ${preview.session_minutes} دقيقة`}
                  </span>
                </li>
              )}
            </ul>

            {notice && (
              <div className="mt-5 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
                {notice}
              </div>
            )}
            {error && (
              <div role="alert" className="mt-5 rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}

            {signedInEmail ? (
              <div className="mt-6">
                <p className="mb-3 text-xs text-slate-400">أنت مسجّل الدخول كـ {signedInEmail}</p>
                <button
                  type="button"
                  onClick={acceptWithSession}
                  disabled={busy}
                  className="w-full rounded-full bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 disabled:opacity-50"
                >
                  {busy ? '...' : 'انضم إلى الفريق الآن'}
                </button>
              </div>
            ) : preview.has_account ? (
              <div className="mt-6 space-y-3">
                <p className="text-sm text-slate-300">
                  لديك حساب بهذا البريد — سجّل الدخول ثم اضغط «انضم» من هذه الصفحة.
                </p>
                <Link
                  href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`}
                  className="block w-full rounded-full bg-cyan-500 px-5 py-3 text-center text-sm font-semibold text-slate-950"
                >
                  تسجيل الدخول لقبول الدعوة
                </Link>
              </div>
            ) : (
              <form onSubmit={acceptWithPassword} className="mt-6 space-y-3">
                <p className="text-sm text-slate-300">
                  أنشئ كلمة مرور لحسابك الجديد على هذا البريد — ستنضم مباشرة إلى فريق {preview.clinic_name}.
                </p>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="كلمة المرور (6 أحرف على الأقل)"
                  className="w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none focus:border-cyan-500"
                />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="تأكيد كلمة المرور"
                  className="w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none focus:border-cyan-500"
                />
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full rounded-full bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 disabled:opacity-50"
                >
                  {busy ? '...' : 'انضم إلى الفريق'}
                </button>
              </form>
            )}
          </>
        )}
      </div>
    </main>
  );
}
