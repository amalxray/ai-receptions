'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import PasswordInput from '@/components/ui/PasswordInput';
import Link from 'next/link';

function normalizeSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

export default function RegisterPage() {
  const router = useRouter();
  const [clinicName, setClinicName] = useState('');
  const [clinicSlug, setClinicSlug] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [activityType, setActivityType] = useState('clinic');

  const ACTIVITY_OPTIONS = [
    { id: 'clinic', icon: '🦷', label: 'عيادة أسنان' },
    { id: 'imaging_center', icon: '🩻', label: 'مركز تصوير' },
    { id: 'dental_lab', icon: '🦿', label: 'مختبر أسنان' },
  ];

  const entityLabel =
    activityType === 'imaging_center' ? 'مركز التصوير' : activityType === 'dental_lab' ? 'المختبر' : 'العيادة';
  const entitySlugHint =
    activityType === 'imaging_center' ? 'xray-center' : activityType === 'dental_lab' ? 'dental-lab' : 'clinic-name';

  function humanizeError(message: string): string {
    if (!message) return 'حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.';
    if (message.includes('already registered')) {
      return 'هذا البريد الإلكتروني مسجل بالفعل. يرجى تسجيل الدخول.';
    }
    if (message.includes('already taken')) {
      return 'عنوان URL هذا مستخدم بالفعل. يرجى اختيار عنوان آخر.';
    }
    if (message.includes('Password should be at least')) {
      return 'كلمة المرور يجب أن تكون 6 أحرف على الأقل.';
    }
    if (message.includes('fetch') || message.includes('Failed to fetch') || message.includes('Network')) {
      return 'تعذر الاتصال بخدمة التسجيل. تحقق من اتصالك بالإنترنت ثم أعد المحاولة.';
    }
    return message;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');
    setIsSubmitting(true);

    if (password !== confirmPassword) {
      setError('كلمتا المرور غير متطابقتين.');
      setIsSubmitting(false);
      return;
    }

    const slug = normalizeSlug(clinicSlug || clinicName);
    if (!slug) {
      setError('يرجى إدخال اسم عيادة صالح لإنشاء عنوان URL.');
      setIsSubmitting(false);
      return;
    }

    try {
      // Server-side registration creates the confirmed auth user, clinic,
      // and clinic_users owner membership atomically (with rollback).
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          clinic_name: clinicName,
          clinic_slug: slug,
          activity_type: activityType,
        }),
      });

      const result = await response.json();
      setIsSubmitting(false);

      if (!response.ok) {
        setError(humanizeError(result.error || 'حدث خطأ أثناء إنشاء العيادة.'));
        return;
      }

      setMessage('تم إنشاء العيادة والمستخدم بنجاح. سيتم تحويلك إلى صفحة تسجيل الدخول...');

      // Server created a confirmed auth user; redirect to login so the user
      // signs in with a fresh, real session.
      setTimeout(() => {
        router.replace('/login?registered=1');
      }, 1200);
    } catch (caught) {
      setError('تعذر الاتصال بخدمة التسجيل. تحقق من اتصالك بالإنترنت ثم أعد المحاولة.');
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-12 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-md rounded-[2rem] border border-slate-800 bg-slate-900/90 p-8 shadow-xl shadow-slate-950/30">
        <h1 className="text-3xl font-semibold text-white">
          إنشاء حساب {entityLabel === 'العيادة' ? 'عيادة جديدة' : `${entityLabel} جديد`}
        </h1>
        <p className="mt-3 text-slate-400">اختر نوع النشاط واملأ البيانات لبدء استخدام لوحة تحكم موظفة الاستقبال الذكية.</p>

        <fieldset className="mt-6 space-y-2">
          <legend className="text-sm font-medium text-slate-300">نوع النشاط</legend>
          <div className="grid grid-cols-3 gap-2">
            {ACTIVITY_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setActivityType(option.id)}
                aria-pressed={activityType === option.id}
                className={`rounded-2xl border px-2 py-3 text-xs font-semibold transition ${
                  activityType === option.id
                    ? 'border-cyan-500 bg-cyan-500/15 text-cyan-100'
                    : 'border-slate-800 bg-slate-950/60 text-slate-300 hover:border-slate-600'
                }`}
              >
                <span className="block text-lg">{option.icon}</span>
                <span className="mt-1 block">{option.label}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <form className="mt-6 space-y-6" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="clinicName" className="block text-sm font-medium text-slate-200">
              اسم {entityLabel}
            </label>
            <input
              id="clinicName"
              value={clinicName}
              onChange={(event) => setClinicName(event.target.value)}
              className="mt-2 w-full rounded-3xl border border-slate-800 bg-slate-950 px-4 py-3 text-slate-100 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
              placeholder={entityLabel === 'العيادة' ? 'عيادة الأسنان المتميزة' : `${entityLabel} المتميز`}
              required
            />
          </div>

          <div>
            <label htmlFor="clinicSlug" className="block text-sm font-medium text-slate-200">
              عنوان URL قصير لـ{entityLabel} (اختياري)
            </label>
            <input
              id="clinicSlug"
              value={clinicSlug}
              onChange={(event) => setClinicSlug(event.target.value)}
              className="mt-2 w-full rounded-3xl border border-slate-800 bg-slate-950 px-4 py-3 text-slate-100 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
              placeholder={entitySlugHint}
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-200">
              البريد الإلكتروني
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
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
              ignorePasswordManagers
              required
              minLength={ 6 }
            />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-200">
              تأكيد كلمة المرور
            </label>
            <PasswordInput
              id="confirmPassword"
              name="confirm_password"
              value={confirmPassword}
              onChange={(v) => setConfirmPassword(v)}
              placeholder="••••••••"
              className="mt-2"
              autoComplete="new-password"
              ignorePasswordManagers
              required
              minLength={ 6 }
            />
          </div>

          {error ? <p className="text-sm text-red-400">{error}</p> : null}
          {message ? <p className="text-sm text-emerald-400">{message}</p> : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-3xl bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? 'جارٍ الإنشاء...' : `إنشاء حساب ${entityLabel}`}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-slate-500">
          <p>لديك حساب بالفعل؟</p>
          <Link href="/login" className="text-cyan-300 hover:text-cyan-200">
            تسجيل دخول
          </Link>
        </div>
      </div>
    </main>
  );
}