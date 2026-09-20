'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { getFeatureInfo, type FeatureKey } from '@/lib/subscription/featureGate';
import { getPlan } from '@/lib/subscription/plans';

/**
 * /dashboard/upgrade/[feature] — plan-gate landing page.
 *
 * Rendered when a clinic member opens a dashboard module their plan does not
 * include (Sidebar 🔒 links here) . Shows the required plan, its features and
 * the checkout path (subscription page highlights the plan via ?plan=).
 */

const FEATURE_KEYS: FeatureKey[] = [
  'invoices',
  'payments',
  'expenses',
  'reports',
  'whatsapp',
  'team',
  'before-after',
  'badges',
  'analytics',
];

function isFeatureKey(value: string): value is FeatureKey {
  return (FEATURE_KEYS as string[]).includes(value);
}

const FEATURE_LABEL_AR: Record<FeatureKey, string> = {
  invoices: 'الفواتير',
  payments: 'المدفوعات الإلكترونية',
  expenses: 'المصروفات والمحاسبة',
  reports: 'التقارير المالية',
  whatsapp: 'واتساب',
  team: 'إدارة الفريق',
  'before-after': 'قبل/بعد Gallery',
  badges: 'شارات وإنجازات',
  analytics: 'التحليلات المتقدمة',
};

function formatPrice(minor: number, currency: string): string {
  const amount = minor / 100;
  const symbol = currency === 'usd' ? '$' : `${currency.toUpperCase()} `;
  return `${symbol}${amount % 1 === 0 ? amount.toFixed(0) : amount.toFixed(2)}`;
}

export default function UpgradeFeaturePage() {
  const params = useParams<{ feature: string }>();
  const feature = typeof params?.feature === 'string' ? params.feature : '';

  if (!isFeatureKey(feature)) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-slate-900">ميزة غير معروفة</h1>
        <p className="mt-2 text-slate-500">الميزة المطلوبة غير موجودة.</p>
        <Link href="/dashboard" className="mt-6 inline-block rounded-xl bg-slate-900 px-6 py-3 font-semibold text-white">
          العودة للوحة التحكم
        </Link>
      </main>
    );
  }

  const info = getFeatureInfo(feature);
  const plan = getPlan(info.requiredPlan);
  const isYearly = info.requiredPlan.endsWith('_yearly');

  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 text-center">
          <span className="mb-4 inline-block rounded-full bg-amber-100 px-4 py-1 text-sm font-semibold text-amber-700">
            🔒 ميزة غير متاحة في باقتك الحالية
          </span>
          <h1 className="text-3xl font-black text-slate-900">
            «{FEATURE_LABEL_AR[feature]}» متاحة مع باقة {plan?.name ?? info.requiredPlan}
          </h1>
          <p className="mt-3 text-slate-500">
            رقّ عيادتك لتفعيل هذه الميزة وكل ما يشملها الاشتراك.
          </p>
        </div>

        <div className="mb-6 rounded-2xl bg-slate-50 p-6 text-center">
          <div className="flex items-baseline justify-center gap-1">
            <span className="text-5xl font-black text-slate-900">
              {plan ? formatPrice(plan.pricePerMonth, plan.currency) : '—'}
            </span>
            <span className="text-slate-500">/{isYearly ? 'سنة' : 'شهر'}</span>
          </div>
          {isYearly && plan && (
            <p className="mt-1 text-sm text-emerald-600">شهران مجاناً مع الدفع السنوي</p>
          )}
        </div>

        <ul className="mb-8 space-y-3">
          {(plan?.features ?? info.features).map((f) => (
            <li key={f} className="flex items-start gap-3 text-slate-700">
              <span className="text-emerald-500">✓</span>
              <span>{f}</span>
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href={`/dashboard/subscription?plan=${info.requiredPlan}`}
            className="flex-1 rounded-xl bg-slate-900 px-6 py-4 text-center text-lg font-bold text-white transition hover:bg-slate-800"
          >
            ترقية الآن 🚀
          </Link>
          <Link
            href="/dashboard"
            className="flex-1 rounded-xl border border-slate-300 px-6 py-4 text-center font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            ليس الآن
          </Link>
        </div>
      </div>
    </main>
  );
}
