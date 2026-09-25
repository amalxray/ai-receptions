'use client';

import { FormEvent, useEffect, useState } from 'react';
import PasswordInput from '@/components/ui/PasswordInput';
import { supabase } from '@/lib/supabase';
import { useClinicContext } from '@/lib/useClinicContext';

/**
 * PHASE K — Profile page (canonical tenant route).
 * Account identity + password change via Supabase Auth. The [clinicSlug]
 * server layout guard guarantees an authenticated member before rendering.
 */
export default function ProfilePage() {
  const { clinicName, role } = useClinicContext();
  const [email, setEmail] = useState<string | null>(null);
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  function humanizeError(message: string): string {
    if (message.includes('Invalid login credentials'))
      return 'كلمة المرور الحالية خاطئة.';
    if (message.includes('different from the old password'))
      return 'كلمة المرور الجديدة يجب أن تختلف عن الحالية.';
    if (message.toLowerCase().includes('at least 6'))
      return 'كلمة المرور قصيرة جدًا (6 أحرف على الأقل).';
    if (message.includes('Auth session missing'))
      return 'انتهت الجلسة. سجّل الدخول من جديد ثم أعد المحاولة.';
    return message;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    if (password.length < 8) {
      setError('كلمة المرور يجب أن تكون 8 أحرف على الأقل.');
      return;
    }
    if (password !== confirm) {
      setError('كلمتا المرور غير متطابقتين.');
      return;
    }
    if (!email) {
      setError('انتهت الجلسة. سجّل الدخول من جديد ثم أعد المحاولة.');
      return;
    }
    setBusy(true);
    try {
      // #29 — إثبات الهوية: لا تغيير لكلمة المرور دون التحقق من الحالية.
      // signInWithPassword يثبت الحالية وينشئ جلسة جديدة (يحل أيضاً "Auth session missing").
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: current,
      });
      if (signInError) {
        setError(humanizeError(signInError.message));
        return;
      }
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(humanizeError(updateError.message));
        return;
      }
      setSuccess('تم تحديث كلمة المرور بنجاح ✓ استخدمها في تسجيل الدخول القادم.');
      setCurrent('');
      setPassword('');
      setConfirm('');
    } catch {
      setError('تعذر الاتصال بخدمة المصادقة. تحقق من اتصالك ثم أعد المحاولة.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="animate-fade-in mx-auto max-w-xl rounded-[2rem] border border-slate-800 bg-slate-900/80 p-8 shadow-xl shadow-slate-950/30">
      <h1 className="text-2xl font-semibold text-white">👤 الملف الشخصي</h1>
      <p className="mt-2 text-sm text-slate-400">بيانات حسابك وإدارة كلمة المرور.</p>

      <div className="mt-6 space-y-3 rounded-3xl border border-slate-800 bg-slate-950/60 p-5 text-sm">
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-400">البريد الإلكتروني</span>
          <span className="font-medium text-slate-100" dir="ltr">
            {email ?? '...'}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-400">المؤسسة</span>
          <span className="font-medium text-slate-100">{clinicName ?? '—'}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-400">الدور</span>
          <span className="rounded-full bg-cyan-500/15 px-3 py-1 text-xs font-semibold text-cyan-200">
            {role ?? '—'}
          </span>
        </div>
      </div>

      <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
        <h2 className="text-sm font-bold text-slate-200">تغيير كلمة المرور</h2>
        <div>
          <label htmlFor="current-password" className="block text-xs font-medium text-slate-300">
            كلمة المرور الحالية
          </label>
          <PasswordInput
            id="current-password"
            name="current_password"
            value={current}
            onChange={(v) => setCurrent(v)}
            placeholder="••••••••"
            className="mt-2"
            autoComplete="current-password"
            ignorePasswordManagers
            required
          />
        </div>
        <div>
          <label htmlFor="new-password" className="block text-xs font-medium text-slate-300">
            كلمة المرور الجديدة
          </label>
          <PasswordInput
            id="new-password"
            name="new_password"
            value={password}
            onChange={(v) => setPassword(v)}
            placeholder="••••••••"
            className="mt-2"
            autoComplete="new-password"
            ignorePasswordManagers
            required
            minLength={8}
          />
        </div>
        <div>
          <label htmlFor="confirm-password" className="block text-xs font-medium text-slate-300">
            تأكيد كلمة المرور
          </label>
          <PasswordInput
            id="confirm-password"
            name="confirm_password"
            value={confirm}
            onChange={(v) => setConfirm(v)}
            placeholder="••••••••"
            className="mt-2"
            autoComplete="new-password"
            ignorePasswordManagers
            required
          />
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}
        {success && <p className="text-sm text-emerald-400">{success}</p>}

        <button
          type="submit"
          disabled={busy}
          className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? 'جارٍ التحديث...' : 'تحديث كلمة المرور'}
        </button>
      </form>
    </div>
  );
}
