'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { useClinicContext } from '@/lib/useClinicContext';

type SubscriptionBannerData = {
  subscription: {
    status: string | null;
    trial_end: string | null;
  } | null;
  plan?: { name?: string; id?: string };
};

const PLAN_NAMES_AR: Record<string, string> = {
  solo_39: 'طبيب',
  clinic_69: 'عيادة',
  center_119: 'مركز',
};

const UPGRADE_HREF = `mailto:support@ai-receptions.com?subject=${encodeURIComponent('ترقية الاشتراك')}`;
const SubscriptionExpiredContext = createContext<boolean | null>(null);

export function useSubscriptionExpired(): boolean | null {
  return useContext(SubscriptionExpiredContext);
}

export default function SubscriptionBanner({ children }: { children: React.ReactNode }) {
  const { clinicId, authHeaders, loading } = useClinicContext();
  const [data, setData] = useState<SubscriptionBannerData | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (loading || !clinicId) return;
    let cancelled = false;

    void (async () => {
      try {
        const headers = await authHeaders();
        const response = await fetch(`/api/clinic/subscription?clinic_id=${encodeURIComponent(clinicId)}`, {
          headers,
          cache: 'no-store',
        });
        if (!response.ok) return;
        const body = await response.json();
        if (!cancelled) setData(body?.data ?? null);
      } catch {
        // The banner is informative; a transient read failure must not affect
        // dashboard navigation or clinic operations.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authHeaders, clinicId, loading]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const subscription = data?.subscription;
  const status = subscription?.status;
  const trialEnd = subscription?.trial_end ? new Date(subscription.trial_end).getTime() : NaN;
  const expired = status === 'expired' || (status === 'trialing' && Number.isFinite(trialEnd) && trialEnd <= now);

  const planName = data?.plan?.name || PLAN_NAMES_AR[data?.plan?.id ?? ''] || 'الاشتراك الحالي';

  return (
    <SubscriptionExpiredContext.Provider value={expired}>
      {subscription && (expired || status === 'trialing' || status === 'active') && (
        <div className="mx-auto w-full max-w-7xl px-4 pt-4" dir="rtl">
          {expired ? (
            <div role="status" className="flex flex-col gap-3 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-red-900 sm:flex-row sm:items-center sm:justify-between">
              <p className="font-bold">⚠️ انتهت تجربتك — ارقّي الآن.</p>
              <a href={UPGRADE_HREF} className="inline-flex w-fit items-center justify-center rounded-full bg-red-700 px-5 py-2 text-sm font-bold text-white transition hover:bg-red-800">
                ارقّي الآن
              </a>
            </div>
          ) : status === 'trialing' ? (
            <div role="status" className="flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-emerald-950 sm:flex-row sm:items-center sm:justify-between">
              <p className="font-bold">
                🎁 تجربتك تنتهي في {Number.isFinite(trialEnd) ? Math.max(0, Math.ceil((trialEnd - now) / 86_400_000)) : '—'} يوم
              </p>
              <a href={UPGRADE_HREF} className="inline-flex w-fit items-center justify-center rounded-full bg-emerald-700 px-5 py-2 text-sm font-bold text-white transition hover:bg-emerald-800">
                ارقّي الآن
              </a>
            </div>
          ) : (
            <div role="status" className="rounded-2xl border border-sky-200 bg-sky-50 px-5 py-4 font-bold text-sky-950">
              ✓ مشترك في {planName}
            </div>
          )}
        </div>
      )}
      {children}
    </SubscriptionExpiredContext.Provider>
  );
}
