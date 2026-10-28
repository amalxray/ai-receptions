'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

type GoogleSignInButtonProps = {
  className?: string;
  label?: string;
  onVisible?: () => void;
};

export default function GoogleSignInButton({
  className = '',
  label = 'التسجيل عبر Google',
  onVisible,
}: GoogleSignInButtonProps) {
  const [sessionStatus, setSessionStatus] = useState<'checking' | 'signed-in' | 'signed-out'>('checking');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    let receivedAuthEvent = false;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      receivedAuthEvent = true;
      if (!mounted) return;

      setSessionStatus(session?.user ? 'signed-in' : 'signed-out');
      setLoading(false);
    });

    void supabase.auth.getSession().then(({ data: { session }, error: sessionError }) => {
      if (!mounted || receivedAuthEvent) return;

      setSessionStatus(!sessionError && session?.user ? 'signed-in' : 'signed-out');
    }).catch(() => {
      if (mounted && !receivedAuthEvent) setSessionStatus('signed-out');
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (sessionStatus === 'signed-out') onVisible?.();
  }, [onVisible, sessionStatus]);

  const signIn = async () => {
    setLoading(true);
    setError(null);
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : 'https://dentairec.com';
      const { error: signInError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${origin}/auth/callback` },
      });
      if (signInError) throw signInError;
    } catch {
      setError('تعذر بدء التسجيل عبر Google. حاول مرة أخرى.');
      setLoading(false);
    }
  };

  if (sessionStatus !== 'signed-out') return null;

  return (
    <div className={className}>
      <button
        type="button"
        onClick={signIn}
        disabled={loading}
        aria-label={label}
        aria-busy={loading}
        className="inline-flex min-h-[54px] w-full items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white px-6 py-3.5 text-base font-bold text-slate-800 shadow-md shadow-slate-900/10 transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50 hover:shadow-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/20 disabled:cursor-wait disabled:opacity-70"
      >
        <svg aria-hidden="true" viewBox="0 0 48 48" className="h-6 w-6 shrink-0">
          <path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11c-.5 2.5-2 4.6-4.3 6v5h7c4.1-3.8 5.9-9.3 5.9-14.7z" />
          <path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-4.8l-7-5c-1.9 1.3-4.3 2.1-6.5 2.1-5 0-9.2-3.4-10.7-8H6v5.2C9.4 39.8 16.2 44 24 44z" />
          <path fill="#FBBC05" d="M13.3 28.3a12 12 0 0 1 0-8.6v-5.2H6a20 20 0 0 0 0 19l7.3-5.2z" />
          <path fill="#EA4335" d="M24 11.8c3 0 5.7 1 7.8 3.1l5.8-5.8C34.1 5.8 29.5 4 24 4 16.2 4 9.4 8.2 6 14.5l7.3 5.2c1.5-4.5 5.7-7.9 10.7-7.9z" />
        </svg>
        <span>{loading ? 'جارٍ التوجيه إلى Google...' : label}</span>
      </button>
      {error && <p role="alert" className="mt-2 text-sm font-medium text-red-600">{error}</p>}
    </div>
  );
}
