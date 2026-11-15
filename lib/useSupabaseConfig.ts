'use client';

import { createContext, createElement, useContext, useEffect, useState } from 'react';

export type SupabaseConfigState = {
  isConfigured: boolean;
  supabaseUrl: string;
  supabaseAnonKey: string;
  loading: boolean;
  checkFailed: boolean;
};

const INITIAL_CONFIG: SupabaseConfigState = {
  isConfigured: false,
  supabaseUrl: '',
  supabaseAnonKey: '',
  loading: true,
  checkFailed: false,
};

const SupabaseConfigContext = createContext<SupabaseConfigState | null>(null);

/**
 * One runtime health-check shared by every dashboard component.
 * The service-role key remains server-only; the route returns only public
 * configuration metadata and booleans.
 */
export function SupabaseConfigProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<SupabaseConfigState>(INITIAL_CONFIG);

  useEffect(() => {
    let active = true;

    async function check() {
      try {
        const res = await fetch('/api/supabase-config', { cache: 'no-store' });
        const body = await res.json();
        if (!active) return;
        setConfig({
          isConfigured: Boolean(body?.isConfigured),
          supabaseUrl: body?.supabaseUrl ?? '',
          supabaseAnonKey: '',
          loading: false,
          checkFailed: false,
        });
      } catch {
        if (active) setConfig((current) => ({ ...current, loading: false, checkFailed: true }));
      }
    }

    void check();
    return () => {
      active = false;
    };
  }, []);

  return createElement(SupabaseConfigContext.Provider, { value: config }, children);
}

export function useSupabaseConfig(): SupabaseConfigState {
  const config = useContext(SupabaseConfigContext);
  if (!config) {
    throw new Error('useSupabaseConfig must be used within SupabaseConfigProvider');
  }
  return config;
}
