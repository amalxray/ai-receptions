'use client';
import { usePWA } from '@/lib/pwa/usePWA';
import { useEffect } from 'react';

/** Add-to-home-screen button (PWA) — registers the SW on mount, hides when
 *  already installed or when the browser doesn't expose the install prompt. */
export default function InstallButton() {
  const { isInstalled, installPrompt, install, register } = usePWA();

  useEffect(() => { register(); }, [register]);

  if (isInstalled || !installPrompt) return null;
  return (
    <button
      type="button"
      onClick={() => void install()}
      className="rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs text-slate-200 transition hover:border-emerald-400/40 hover:text-emerald-300"
    >
      📱 أضف للشاشة الرئيسية
    </button>
  );
}
