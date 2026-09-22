'use client';

// STEP 15G-A — Usage & Plan Visibility.
// STEP 15G-B — Upgrade flow & monetization readiness:
//   * reads ?upgrade=1&resource=<r>&plan=<p>  → highlights the suggested upgrade
//   * reads ?session_id=<id>                  → shows a Pending Activation notice
//     (never claims the subscription is active before the webhook confirms it)
//   * keeps the plan picker + checkout flow untouched.

import { useEffect, useState } from 'react';
import DashboardSection from '@/components/dashboard/DashboardSection';
import EmptyState from '@/components/dashboard/EmptyState';
import { formatMoney } from '@/lib/clinic/formatting';
import Skeleton from '@/components/ui/Skeleton';
import StatusPill from '@/components/dashboard/StatusPill';
import UsageMeter, { type UsageMeterItem } from '@/components/dashboard/subscription/UsageMeter';
import { useClinicContext } from '@/lib/useClinicContext';
import { SUBSCRIPTION_PLANS } from '@/lib/subscription/plans';
import {
  RESOURCE_LABEL_AR,
  suggestedPlanFor,
} from '@/lib/subscription/upgradeCta';
import { resolvePendingSelectedPlan } from '@/lib/subscription/pendingPlan';
import type { EntitlementResource } from '@/lib/subscription/entitlements';

type SubscriptionPublic = {
  plan_id: string;
  status: string | null;
  billing_status: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  trial_end: string | null;
  cancel_at_period_end: boolean;
};

type AccessData = {
  subscription: SubscriptionPublic | null;
  plan?: {
    id: string;
    name: string;
    pricePerMonth: number;
    currency: string;
    interval: string;
    trialDays: number | null;
  };
  entitlements: {
    planId: string;
    status: string | null;
    degraded: boolean;
    periodStart: string;
  };
  usage: UsageMeterItem[];
  billingPeriodLabel: string;
};

const STATUS_AR: Record<string, string> = {
  active: 'نشط',
  trialing: 'نسخة تجريبية',
  past_due: 'متأخر الدفع',
  canceled: 'ملغى',
  unpaid: 'غير مدفوع',
};

// v2 catalog (USD) + the legacy ids still present on historical subscriptions
// (starter/growth/pro/founding rows are mapped to their successors server-side).
const PLAN_NAME_AR: Record<string, string> = {
  free_trial: 'تجريبي',
  limited: 'محدودة',
  basic: 'أساسية',
  advanced: 'متقدمة',
  center: 'مركز',
  basic_yearly: 'أساسية سنوي',
  advanced_yearly: 'متقدمة سنوي',
  center_yearly: 'مركز سنوي',
  // legacy
  starter: 'محدودة (سابقة)',
  growth: 'متقدمة (سابقة)',
  pro: 'مركز (سابقة)',
  founding: 'التأسيس (مدى الحياة)',
};

function statusTone(status: string | null, degraded: boolean): 'success' | 'warning' | 'danger' | 'neutral' {
  if (degraded) return 'warning';
  if (status === 'active' || status === 'trialing') return 'success';
  if (status === 'past_due' || status === 'unpaid' || status === 'canceled') return 'danger';
  return 'neutral';
}

function readQuery(): {
  upgrade: boolean;
  resource: string | null;
  plan: string | null;
  sessionId: string | null;
  status: string | null;
  payment: string | null;
} {
  if (typeof window === 'undefined') {
    return { upgrade: false, resource: null, plan: null, sessionId: null, status: null, payment: null };
  }
  const params = new URLSearchParams(window.location.search);
  return {
    upgrade: params.get('upgrade') === '1',
    resource: params.get('resource'),
    plan: params.get('plan'),
    sessionId: params.get('session_id'),
    // Lahza callback outcome flags (?status=success|failed|pending, ?payment=…)
    status: params.get('status'),
    payment: params.get('payment'),
  };
}

export default function SubscriptionPage() {
  const { clinicId, authHeaders, loading, error: clinicError } = useClinicContext();
  const [data, setData] = useState<AccessData | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState(readQuery);
  // Billing period toggle — one control drives the whole pricing grid.
  const [period, setPeriod] = useState<'monthly' | 'yearly'>('monthly');
  // Payment gateway toggle — Lahza (Palestine/local cards) or Stripe (international).
  const [gateway, setGateway] = useState<'lahza' | 'stripe'>('lahza');

  async function load() {
    if (!clinicId) return null;
    const headers = await authHeaders();
    const res = await fetch(`/api/clinic/subscription?clinic_id=${encodeURIComponent(clinicId)}`, { headers });
    if (res.ok) {
      const body = await res.json();
      const incoming = body?.data as AccessData | undefined;
      setData(incoming ?? null);
      setErr(null);
      return incoming?.subscription?.status ?? null;
    }
    // PHASE F — surface the REAL failure instead of a silent null that renders
    // a generic empty view. 401 (expired/missing session) gets a clear CTA.
    const body = await res.json().catch(() => ({} as Record<string, unknown>));
    if (res.status === 401) {
      setLoadError('انتهت الجلسة أو لم تُسجَّل الدخول. اضغط «إعادة تسجيل الدخول» للمتابعة.');
    } else if (res.status === 403) {
      setLoadError('لا تملك صلاحية عرض الاشتراك لهذه العيادة (403).');
    } else if (res.status === 500) {
      setLoadError('حدث خطأ في الخادم، حاول مرة أخرى');
    } else {
      const detail = (body as { error?: string; message?: string });
      setLoadError(`تعذر تحميل الاشتراك (${res.status}). ${detail?.message ?? detail?.error ?? ''}`.trim());
    }
    setData(null);
    return null;
  }

  useEffect(() => {
    if (loading) return;
    if (!clinicId) return;
    const q = readQuery();
    setQuery(q);
    void load();

    // Webhook race: the user can return from Checkout BEFORE the Stripe webhook
    // reaches the server. Poll the real API (no cache) until the subscription
    // becomes active or the poll budget is spent — never a permanent Starter.
    if (q.sessionId) {
      let attempts = 0;
      const timer = window.setInterval(async () => {
        attempts += 1;
        const status = await load();
        if (status === 'active' || attempts >= 6) {
          window.clearInterval(timer);
        }
      }, 4000);
      return () => window.clearInterval(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, clinicId]);


  async function choose(planId: string, provider: 'lahza' | 'stripe' = gateway) {
    if (!clinicId) return;
    setBusy(true); setErr(null);
    try {
      const headers = await authHeaders();
      const plan = SUBSCRIPTION_PLANS.find((p) => p.id === planId);
      const paid = !!plan && plan.pricePerMonth > 0;
      // Paid plans go through a gateway (Lahza for local cards, Stripe for
      // international); free/trial plans resolve directly to a records row.
      const endpoint = paid
        ? (provider === 'lahza' ? '/api/payments/lahza/checkout' : '/api/payments/checkout')
        : '/api/clinic/subscription';
      const res = await fetch(`${endpoint}?clinic_id=${encodeURIComponent(clinicId)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify({ plan_id: planId }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        if (b?.error === 'PAYMENT_NOT_CONFIGURED') {
          setErr(
            provider === 'lahza'
              ? 'الدفع المحلي غير مفعّل بعد: لم تُهيّأ مفاتيح Lahza.'
              : 'الدفع غير مفعّل بعد: لم تُهيّأ مفاتيح Stripe الاختبارية.'
          );
        } else if (b?.error === 'PAYMENT_SCHEMA_MISSING') {
          setErr(b?.message || 'طبّق ترحيل بوابة الدفع أولاً (db/migrations/20261013_lahza_gateway.sql).');
        } else if (b?.error === 'PAYMENT_AMOUNT_UNSUPPORTED' || b?.error === 'PAYMENT_EMAIL_REQUIRED') {
          setErr(b?.message || 'تعذر بدء الدفع.');
        } else if (b?.error === 'FOUNDING_UNAVAILABLE') {
          setErr(b?.message || 'باقة التأسيس غير متاحة لهذه العيادة (المقاعد التأسيسية مكتملة).');
        } else {
          setErr(b?.message || b?.error || 'تعذر إتمام العملية');
        }
        return;
      }
      const body = await res.json();
      if (body?.url) {
        window.location.assign(body.url); // Stripe Checkout; activation is confirmed by the webhook, not the redirect
        return;
      }
      // Free/trial plans resolve directly to a records row — reload the access view.
      void load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'حدث خطأ');
    } finally {
      setBusy(false);
    }
  }

  function formatPrice(plan: { pricePerMonth: number; interval: string; currency: string }) {
    if (plan.pricePerMonth === 0) return 'مجاناً';
    // Centralized formatting (D-L4) — platform currency display stays single-currency.
    const major = formatMoney(plan.pricePerMonth / 100, plan.currency, 'ar');
    const per = plan.interval === 'year' ? '/سنة' : '/شهر';
    return `${major}${per}`;
  }

  if (loading) return <Skeleton className="h-60" />;
  if (clinicError) return <EmptyState title="تعذر تحميل الاشتراك" description={clinicError} />;
  if (!clinicId) return <EmptyState title="لا توجد عيادة" description="سجّل الدخول لرؤية الاشتراك." />;

  // STEP 15G-A — the APPLIED plan is entitlements.planId (never the raw plan_id).
  const appliedPlanId = data?.entitlements?.planId ?? 'free_trial';
  const appliedStatus = data?.subscription?.status ?? null;
  const degraded = data?.entitlements?.degraded ?? false;
  const appliedPlanName = PLAN_NAME_AR[appliedPlanId] ?? appliedPlanId;
  const periodLabel = data?.billingPeriodLabel ?? '';
  const periodEnd = data?.subscription?.current_period_end ?? null;

  // STEP 15G-C — selected plan awaiting payment (subscription row keeps the
  // chosen plan_id while status=unpaid; entitlements stay degraded at starter).
  const pendingPlanId = resolvePendingSelectedPlan(data?.subscription ?? null);
  const pendingPlanName = pendingPlanId ? PLAN_NAME_AR[pendingPlanId] ?? pendingPlanId : null;

  // STEP 15G-B — contextual upgrade params.
  const upgradeResource = query.resource && query.resource in RESOURCE_LABEL_AR
    ? (query.resource as EntitlementResource)
    : null;
  const upgradePlan = query.plan && SUBSCRIPTION_PLANS.some((p) => p.id === query.plan)
    ? query.plan
    : null;
  const suggestedPlan = upgradeResource ? (upgradePlan ?? suggestedPlanFor(upgradeResource)) : null;

  // Trial is a standalone card (no toggle applies to it); the three paid tiers
  // are driven by the monthly/yearly toggle only.
  const trialPlan = SUBSCRIPTION_PLANS.find((p) => p.interval === 'trial') ?? null;
  const tierPlans = SUBSCRIPTION_PLANS.filter((p) =>
    period === 'yearly' ? p.interval === 'year' : p.interval === 'month' && p.pricePerMonth > 0
  );
  const upgradeUsage = upgradeResource
    ? (data?.usage?.find((u) => u.resource === upgradeResource) ?? null)
    : null;


  return (
    <DashboardSection title="الاشتراك" subtitle="اختر باقة تناسب عيادتك؛ تُحفظ في ملف العيادة وتُطبَّق على الحجز والاستخدام.">

      {/* Lahza callback outcome — the money answer, before the generic notice. */}
      {query.status === 'success' ? (
        <div className="mb-5 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-4">
          <p className="text-sm font-semibold text-emerald-200">تم تأكيد الدفع وتفعيل الاشتراك</p>
          <p className="mt-1 text-xs text-emerald-200/70">
            تحقّقنا من العملية مباشرةً لدى مزوّد الدفع وفعّلنا باقتك على هذه العيادة.
          </p>
        </div>
      ) : null}
      {query.status === 'failed' ? (
        <div className="mb-5 rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-4">
          <p className="text-sm font-semibold text-rose-200">لم تكتمل عملية الدفع</p>
          <p className="mt-1 text-xs text-rose-200/70">
            لم يُفعَّل أي تغيير على باقتك. يمكنك إعادة المحاولة بأمان — لن تُخصم أي مبالغ مكررة.
          </p>
        </div>
      ) : null}
      {query.status === 'pending' ? (
        <div className="mb-5 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-4">
          <p className="text-sm font-semibold text-amber-200">الدفع بانتظار التأكيد النهائي</p>
          <p className="mt-1 text-xs text-amber-200/70">
            لم نتمكّن من تأكيد العملية الآن. سيُفعَّل اشتراكك تلقائيًا فور وصول تأكيد مزوّد الدفع.
          </p>
        </div>
      ) : null}
      {query.payment ? (
        <div className="mb-5 rounded-2xl border border-slate-700 bg-slate-900/70 px-4 py-4">
          <p className="text-sm font-semibold text-slate-200">تعذر ربط عملية الدفع بالعيادة</p>
          <p className="mt-1 text-xs text-slate-400">
            {query.payment === 'schema_missing'
              ? 'ترحيل بوابة الدفع غير مطبَّق على قاعدة البيانات — راجع مسؤول النظام.'
              : 'افتح الاشتراك من حساب العيادة نفسه وأعد المحاولة.'}
          </p>
        </div>
      ) : null}

      {/* STEP 15G-B — Pending activation after returning from Checkout. */}
      {query.sessionId ? (
        <div className="mb-5 rounded-2xl border border-cyan-500/40 bg-cyan-500/10 px-4 py-4">
          <p className="text-sm font-semibold text-cyan-200">الدفع قيد التأكيد</p>
          <p className="mt-1 text-xs text-cyan-200/70">
            استلمنا جلسة الدفع (رقمها ينتهي بـ …{query.sessionId.slice(-8)}). سيُفعَّل اشتراكك
            تلقائيًا بعد تأكيد مزوّد الدفع وفحصه — عادةً خلال دقائق. لم يُفعَّل أي تغيير على خطتك الحالية قبل هذا التأكيد.
          </p>
        </div>
      ) : null}

      {/* STEP 15G-C — selected plan awaiting payment: show the CHOSEN plan
          clearly instead of silently displaying the degraded Starter plan. */}
      {pendingPlanId && pendingPlanName ? (
        <div className="mb-5 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-4">
          <p className="text-sm font-semibold text-amber-200">
            {pendingPlanName} — بانتظار إتمام الدفع
          </p>
          <p className="mt-1 text-xs text-amber-200/70">
            حفظنا اختيارك لباقة «{pendingPlanName}»، وستصبح خطتك الفعّالة فور تأكيد
            مزوّد الدفع. حتى ذلك الحين تعمل عيادتك بحدود الخطة الابتدائية.
          </p>
        </div>
      ) : null}

      {/* Plan + subscription status (15G-A) */}
      <div className="mb-6 rounded-[1.5rem] border border-slate-800 bg-slate-950/70 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-slate-400">الخطة الحالية</p>
            <p className="mt-2 text-2xl font-semibold text-white">{appliedPlanName}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {appliedStatus ? (
                <StatusPill tone={statusTone(appliedStatus, degraded)}>
                  {STATUS_AR[appliedStatus] ?? appliedStatus}
                </StatusPill>
              ) : (
                <StatusPill tone="neutral">بدون اشتراك مسجل</StatusPill>
              )}
              {degraded && <StatusPill tone="warning">بحدود الابتدائية مؤقتًا</StatusPill>}
            </div>
          </div>
          <div className="text-left sm:text-right">
            {periodLabel ? <p className="text-sm text-slate-300">فترة الاستخدام: {periodLabel}</p> : null}
            {periodEnd ? (
              <p className="mt-1 text-sm text-slate-400">تنتهي الدورة: {new Date(periodEnd).toLocaleDateString('ar')}</p>
            ) : null}
          </div>
        </div>
        {err && <p className="mt-3 text-sm text-red-400">{err}</p>}
      </div>

      {loadError ? (
        <div className="mb-5 rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-4">
          <p className="text-sm font-semibold text-rose-200">تعذر تحميل بيانات الاشتراك</p>
          <p className="mt-1 text-xs text-rose-200/80">{loadError}</p>
          {loadError.includes('401') || loadError.includes('الجلسة') ? (
            <a href="/login" className="mt-2 inline-block rounded-full bg-cyan-500 px-4 py-1.5 text-xs font-semibold text-slate-950 hover:bg-cyan-400">إعادة تسجيل الدخول</a>
          ) : (
            <button type="button" onClick={() => void load()} className="mt-2 inline-block rounded-full border border-rose-400/50 px-4 py-1.5 text-xs font-semibold text-rose-200 hover:bg-rose-500/10">إعادة المحاولة</button>
          )}
        </div>
      ) : null}

      {/* STEP 15G-B — contextual upgrade section when arriving from an entitlement limit. */}
      {upgradeResource && upgradeUsage ? (
        <div className="mb-6 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-4">
          <p className="text-sm font-semibold text-amber-200">
            وصلتَ إلى حد {RESOURCE_LABEL_AR[upgradeResource]} في هذه الفترة.
          </p>
          {!upgradeUsage.unlimited && upgradeUsage.limit != null ? (
            <p className="mt-1 text-xs text-amber-200/70">
              الاستهلاك الحالي: {upgradeUsage.used} من {upgradeUsage.limit}.
            </p>
          ) : null}
          {suggestedPlan ? (
            <p className="mt-1 text-xs text-amber-200/70">
              ننصح بالاطلاع على خطة «{PLAN_NAME_AR[suggestedPlan] ?? suggestedPlan}» لرفع هذا الحد.
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Usage meter (15G-A) */}
      <div className="mb-6">
        <h3 className="mb-3 text-base font-semibold text-white">استهلاك هذه الفترة</h3>
        <UsageMeter usage={data?.usage ?? []} />
      </div>

      {/* Billing period toggle — one control for the whole pricing grid. */}
      <div className="mb-6 flex items-center justify-center">
        <div className="inline-flex rounded-full border border-slate-700 bg-slate-950/70 p-1" role="group" aria-label="دورة الفوترة">
          {(['monthly', 'yearly'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setPeriod(mode)}
              className={`rounded-full px-6 py-2 text-sm font-semibold transition ${period === mode ? 'bg-cyan-500 text-slate-950' : 'text-slate-300 hover:text-white'}`}
            >
              {mode === 'monthly' ? 'شهري' : 'سنوي'}
            </button>
          ))}
        </div>
        {period === 'yearly' && <span className="ms-3 rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-300">وفّر شهرين</span>}
      </div>

      {/* Gateway picker — Lahza handles local (Palestinian) cards and Stripe
          handles international ones; the server resolves amounts for both. */}
      <div className="mb-6 flex flex-wrap items-center justify-center gap-3">
        <div className="inline-flex rounded-full border border-slate-700 bg-slate-950/70 p-1" role="group" aria-label="بوابة الدفع">
          {([
            { id: 'lahza' as const, label: 'دفع محلي (Lahza)' },
            { id: 'stripe' as const, label: 'دولي (Stripe)' },
          ]).map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setGateway(option.id)}
              className={`rounded-full px-5 py-2 text-sm font-semibold transition ${gateway === option.id ? 'bg-cyan-500 text-slate-950' : 'text-slate-300 hover:text-white'}`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-slate-500">الشهري والسنوي يحتفظان بنفس السعر في البوابتين.</span>
      </div>

      {/* Trial card — standalone: the monthly/yearly toggle never applies to it. */}
      {trialPlan ? (
        <article
          className={`mb-4 rounded-[1.5rem] border p-5 ${appliedPlanId === trialPlan.id ? 'border-cyan-500/70 bg-cyan-500/10' : 'border-slate-800 bg-slate-950/70'}`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-lg font-semibold text-white">{trialPlan.name}</p>
              <p className="mt-1 text-2xl font-semibold text-cyan-300">{formatPrice(trialPlan)}</p>
              {trialPlan.trialDays ? (
                <p className="mt-1 text-xs text-slate-400">تجربة {trialPlan.trialDays} يوماً — كل ميزات المتقدمة</p>
              ) : null}
            </div>
            <button
              type="button"
              disabled={busy || appliedPlanId === trialPlan.id}
              onClick={() => choose(trialPlan.id)}
              className="rounded-full bg-cyan-500 px-5 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50"
            >
              {appliedPlanId === trialPlan.id ? 'الباقة الحالية' : 'ابدأ التجربة'}
            </button>
          </div>
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-300">
            {trialPlan.features.map((f) => <li key={f}>• {f}</li>)}
          </ul>
        </article>
      ) : null}


      {/* Plan picker — trial card separate, then 3 tier cards driven by the toggle. */}
      <div className="grid gap-4 md:grid-cols-3">
        {tierPlans.map((plan) => {
          const active = plan.id === appliedPlanId;
          const suggested = query.upgrade && suggestedPlan && plan.id === suggestedPlan;
          return (
            <article
              key={plan.id}
              className={`rounded-[1.5rem] border p-5 ${active ? 'border-cyan-500/70 bg-cyan-500/10' : suggested ? 'border-amber-500/70 bg-amber-500/5' : 'border-slate-800 bg-slate-950/70'}`}
            >
              {suggested && !active ? (
                <span className="mb-2 inline-block rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-semibold text-amber-200">مقترحة للترقية</span>
              ) : null}
              <p className="text-lg font-semibold text-white">{plan.name}</p>
              <p className="mt-1 text-2xl font-semibold text-cyan-300">
                {formatPrice(plan)}
              </p>
              <ul className="mt-4 space-y-1 text-sm text-slate-300">
                {plan.features.map((f) => <li key={f}>• {f}</li>)}
              </ul>
              <button
                type="button"
                disabled={busy || active}
                onClick={() => choose(plan.id)}
                className="mt-4 w-full rounded-full bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50"
              >
                {active ? 'الباقة الحالية' : plan.pricePerMonth > 0 ? (gateway === 'lahza' ? 'الدفع عبر Lahza' : 'الدفع عبر Stripe') : 'اختيار مجاني'}
              </button>
            </article>
          );
        })}
      </div>
      <p className="mt-6 text-xs text-slate-500">
        ملاحظة: لا يُفعَّل الاشتراك إلا بعد تأكيد مزوّد الدفع (Lahza للدفع المحلي، Stripe للدفع الدولي)
        — التحقق يتم على الخادم ولا تُقبل أي عملية لم تُدفع فعلاً.
      </p>
    </DashboardSection>
  );
}
