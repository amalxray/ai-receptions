'use client';

import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useSupabaseConfig } from '@/lib/useSupabaseConfig';
import { useTenantContext } from '@/lib/tenantContext';

export const CLINIC_CTX_NETWORK_ERROR_AR =
  'تعذّر الاتصال بالخادم — تحقّق من الإنترنت ثم أعد المحاولة';

export const CLINIC_CTX_NOT_CONFIGURED_ERROR_AR =
  'قاعدة البيانات غير مُهيّأة على هذا النشر — تعذّر تحميل بيانات العيادة';

export function configErrorMessage(checkFailed: boolean): string {
  return checkFailed ? CLINIC_CTX_NETWORK_ERROR_AR : CLINIC_CTX_NOT_CONFIGURED_ERROR_AR;
}

export type ClinicMembership = {
  clinic_id: string;
  role: string;
  clinic: { id: string; name: string; slug: string; activity_type: string | null } | null;
};

export type ClinicContext = {
  loading: boolean;
  error: string | null;
  clinicId: string | null;
  clinicSlug: string | null;
  clinicName: string | null;
  activityType: string | null;
  role: string | null;
  memberships: ClinicMembership[];
  authHeaders: () => Promise<Record<string, string>>;
  setActiveClinicId: (id: string) => Promise<void>;
};

const ClinicContextState = createContext<ClinicContext | null>(null);

/** Loads memberships once for all dashboard components. */
export function ClinicContextProvider({ children }: { children: React.ReactNode }) {
  const { isConfigured, loading: isConfigLoading, checkFailed } = useSupabaseConfig();
  const params = useParams();
  const routeClinicToken = typeof params?.clinicSlug === 'string' ? params.clinicSlug : null;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clinicId, setClinicId] = useState<string | null>(null);
  const [memberships, setMemberships] = useState<ClinicMembership[]>([]);

  const authHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const { data, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  useEffect(() => {
    if (isConfigLoading) return;

    if (!isConfigured) {
      setLoading(false);
      setError(configErrorMessage(checkFailed));
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    async function resolveMemberships() {
      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (!sessionData.session?.user) {
          if (active) {
            setMemberships([]);
            setClinicId(null);
            setError('Not authenticated');
            setLoading(false);
          }
          return;
        }

        const { data, error: membershipError } = await supabase
          .from('clinic_users')
          .select('clinic_id, role, clinic:clinics(id, name, slug, activity_type)')
          .eq('user_id', sessionData.session.user.id)
          .is('deleted_at', null);

        if (membershipError) throw membershipError;

        const rows: ClinicMembership[] = (data ?? [])
          .filter((row) => Boolean(row && row.clinic_id))
          .map((row) => ({
            clinic_id: row.clinic_id,
            role: row.role,
            clinic: Array.isArray(row.clinic) ? (row.clinic[0] ?? null) : (row.clinic ?? null),
          }));

        if (!active) return;
        setMemberships(rows);
        setClinicId((current) =>
          current && rows.some((membership) => membership.clinic_id === current)
            ? current
            : rows[0]?.clinic_id ?? null
        );
        setLoading(false);
      } catch (caughtError) {
        if (!active) return;
        setMemberships([]);
        setError(caughtError instanceof Error ? caughtError.message : 'تعذّر تحميل العيادات');
        setLoading(false);
      }
    }

    void resolveMemberships();
    return () => {
      active = false;
    };
  }, [isConfigured, isConfigLoading, checkFailed]);

  const routeMembership = useMemo(
    () =>
      memberships.find(
        (membership) =>
          membership.clinic?.slug === routeClinicToken || membership.clinic?.id === routeClinicToken
      ) ?? null,
    [memberships, routeClinicToken]
  );
  const activeMembership =
    routeMembership ?? memberships.find((membership) => membership.clinic_id === clinicId) ?? null;

  const setActiveClinicId = useCallback(
    async (id: string) => {
      const membership = memberships.find((item) => item.clinic_id === id);
      if (!membership) {
        setError('You are not a member of this clinic');
        return;
      }
      setClinicId(id);
      setError(null);
    },
    [memberships]
  );

  const value = useMemo<ClinicContext>(
    () => ({
      loading,
      error,
      clinicId: activeMembership?.clinic_id ?? clinicId,
      clinicSlug: activeMembership?.clinic?.slug ?? null,
      clinicName: activeMembership?.clinic?.name ?? null,
      activityType: activeMembership?.clinic?.activity_type ?? null,
      role: activeMembership?.role ?? null,
      memberships,
      authHeaders,
      setActiveClinicId,
    }),
    [loading, error, activeMembership, clinicId, memberships, authHeaders, setActiveClinicId]
  );

  return createElement(ClinicContextState.Provider, { value }, children);
}

/** The server-verified tenant takes precedence over client membership selection. */
export function useClinicContext(): ClinicContext {
  const sharedContext = useContext(ClinicContextState);
  const tenant = useTenantContext();

  if (!sharedContext) {
    throw new Error('useClinicContext must be used within ClinicContextProvider');
  }
  if (!tenant) return sharedContext;

  return {
    ...sharedContext,
    loading: false,
    error: null,
    clinicId: tenant.clinicId,
    clinicSlug: tenant.clinicSlug,
    clinicName: tenant.clinicName,
    activityType: tenant.activityType ?? sharedContext.activityType,
    role: tenant.role,
  };
}
