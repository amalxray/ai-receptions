'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import PasswordInput from '@/components/ui/PasswordInput';
import { supabase } from '@/lib/supabase';
import { isSafeDashboardPath, isSafeAdminPath, isSafeInvitePath } from '@/lib/services/dashboardPaths';
import { PRODUCTION_BASE_URL } from '@/lib/communications/links';
import { tenantSlugFromHostname } from '@/lib/vercel/domains';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  function humanizeError(message: string): string {
    if (!message) return 'تعذر تسجيل الدخول. يرجى المحاولة مرة أخرى.';
    if (message.includes('Invalid login credentials')) {
      return 'البريد الإلكتروني أو كلمة المرور غير صحيحة. إذا نسيت كلمة المرور استخدم "نسيت كلمة المرور؟" أدناه.';
    }
    if (message.includes('Email not confirmed')) {
      return 'لم يتم تأكيد البريد الإلكتروني بعد. يرجى التحقق من بريدك.';
    }
    if (message.includes('fetch') || message.includes('Failed to fetch') || message.includes('Network')) {
      return 'تعذر الاتصال بخدمة المصادقة. تحقق من اتصالك بالإنترنت ثم أعد المحاولة.';
    }
    if (message.includes('rate limit') || message.includes('Too many')) {
      return 'محاولات كثيرة. يرجى الانتظار قليلاً ثم إعادة المحاولة.';
    }
    return message;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError(humanizeError(signInError.message));
        setIsSubmitting(false);
        return;
      }

      // `?next=` is honored only for safe internal paths (open-redirect guard):
      // dashboard destinations AND team-invitation links (/invite/{token}).
      const requested = new URLSearchParams(window.location.search).get('next');
      const safeRequested =
        isSafeDashboardPath(requested) || isSafeInvitePath(requested) ? requested : null;

      const tenantSlug = tenantSlugFromHostname(window.location.hostname);

      // Platform owner takes priority over any clinic membership → the platform domain.
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;
      if (userId) {
        const { data: platformAdmin } = await supabase
          .from('platform_admins')
          .select('user_id')
          .eq('user_id', userId)
          .maybeSingle();
        if (platformAdmin) {
          const adminPath = isSafeAdminPath(requested) ? requested : '/admin';
          if (tenantSlug || window.location.hostname === 'dentairec.com') {
            window.location.replace(new URL(adminPath, PRODUCTION_BASE_URL).toString());
          } else {
            router.replace(adminPath);
          }
          return;
        }

        if (tenantSlug) {
          const { data: clinic, error: clinicError } = await supabase
            .from('clinics')
            .select('id')
            .eq('slug', tenantSlug)
            .is('deleted_at', null)
            .maybeSingle();

          if (clinicError) throw clinicError;

          const { data: membership, error: membershipError } = clinic
            ? await supabase
                .from('clinic_users')
                .select('clinic_id')
                .eq('user_id', userId)
                .eq('clinic_id', clinic.id)
                .is('deleted_at', null)
                .limit(1)
                .maybeSingle()
            : { data: null, error: null };

          if (membershipError) throw membershipError;

          if (!membership) {
            const { error: signOutError } = await supabase.auth.signOut();
            if (signOutError) throw signOutError;
            setError('هذا الحساب لا ينتمي إلى هذه العيادة');
            setIsSubmitting(false);
            return;
          }

          const requestedSlug = safeRequested?.split('/')[2];
          const destination =
            safeRequested && isSafeInvitePath(safeRequested)
              ? safeRequested
              : requestedSlug === tenantSlug
                ? safeRequested
                : `/dashboard/${encodeURIComponent(tenantSlug)}/overview`;
          router.replace(destination);
          return;
        }

        const { data: membership } = await supabase
          .from('clinic_users')
          .select('clinic:clinics(slug)')
          .eq('user_id', userId)
          .is('deleted_at', null)
          .limit(1)
          .maybeSingle();
        const clinic = Array.isArray(membership?.clinic) ? membership?.clinic[0] : membership?.clinic;
        if (clinic?.slug) {
          router.replace(safeRequested ?? `/dashboard/${encodeURIComponent(clinic.slug)}/overview`);
          return;
        }
      }

      router.replace(safeRequested ?? '/dashboard');
    } catch (caught) {
      setError('تعذر الاتصال بخدمة المصادقة. تحقق من اتصالك بالإنترنت ثم أعد المحاولة.');
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-12 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-md rounded-[2rem] border border-slate-800 bg-slate-900/90 p-8 shadow-xl shadow-slate-950/30">
        <h1 className="text-3xl font-semibold text-white">تسجيل دخول العيادة</h1>
        <p className="mt-3 text-slate-400">استخدم البريد الإلكتروني وكلمة المرور لفتح لوحة تحكم موظفة الاستقبال الذكية.</p>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-200">
              البريد الإلكتروني
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="off"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2 w-full rounded-3xl border border-slate-800 bg-slate-950 px-4 py-3 text-slate-100 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
              placeholder="clinic@example.com"
              required
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-200">
              كلمة المرور
            </label>
            <PasswordInput
              id="password"
              name="password"
              value={password}
              onChange={(v) => setPassword(v)}
              placeholder="••••••••"
              className="mt-2"
              autoComplete="new-password"
              required
            />
          </div>

          {error ? <p className="text-sm text-red-400">{error}</p> : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-3xl bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? 'جارٍ الدخول...' : 'تسجيل الدخول'}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-slate-500">
          <p>ليس لديك حساب؟</p>
          <Link href="/register" className="mt-1 inline-block font-medium text-cyan-300 hover:text-cyan-200">
            إنشاء حساب جديد
          </Link>
          <p className="mt-3">
            <Link href="/forgot-password" className="font-medium text-cyan-300 hover:text-cyan-200">
              نسيت كلمة المرور؟
            </Link>
          </p>
        </div>

        <div className="mt-8 text-center">
          <Link href="/" className="text-sm font-medium text-cyan-300 hover:text-cyan-200">
            العودة إلى الصفحة الرئيسية
          </Link>
        </div>
      </div>
    </main>
  );
}
