'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Music } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import {
  getNotificationChimeType,
  NotificationChimeType,
  playNotificationChime,
  setChimeMuted,
  setNotificationChimeType,
} from '@/lib/audio/chime';
import NotificationBell from '@/components/notifications/NotificationBell';
import InstallPWA from '@/components/pwa/InstallPWA';

const CHIME_OPTIONS: { type: NotificationChimeType; label: string }[] = [
  { type: 'classic', label: 'كلاسيكية' },
  { type: 'soft', label: 'هادئة' },
  { type: 'alert', label: 'تنبيه' },
  { type: 'strong-ring', label: 'رنين قوي' },
  { type: 'extended-bell', label: 'جرس ممتد' },
  { type: 'repeating-alert', label: 'تنبيه متكرر' },
  { type: 'none', label: 'بدون صوت' },
];

export default function DashboardHeader() {
  const router = useRouter();
  const [email, setEmail] = useState<string>('');
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [chimeType, setChimeType] = useState<NotificationChimeType>('classic');
  const [isSoundMenuOpen, setIsSoundMenuOpen] = useState(false);
  const soundMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function loadSession() {
      if (!isSupabaseConfigured) {
        setEmail('shadisuad78@gmail.com');
        return;
      }

      const { data } = await supabase.auth.getSession();
      setEmail(data?.session?.user.email ?? '');
    }

    loadSession();
  }, []);

  useEffect(() => {
    const syncChimeType = () => setChimeType(getNotificationChimeType());
    syncChimeType();
    window.addEventListener('clinic-notification-chime-change', syncChimeType);
    window.addEventListener('storage', syncChimeType);
    return () => {
      window.removeEventListener('clinic-notification-chime-change', syncChimeType);
      window.removeEventListener('storage', syncChimeType);
    };
  }, []);

  useEffect(() => {
    if (!isSoundMenuOpen) return;
    function handleClickOutside(event: MouseEvent) {
      if (soundMenuRef.current && !soundMenuRef.current.contains(event.target as Node)) {
        setIsSoundMenuOpen(false);
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsSoundMenuOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isSoundMenuOpen]);

  function chooseChime(type: NotificationChimeType) {
    setNotificationChimeType(type);
    if (type !== 'none') {
      setChimeMuted(false);
      playNotificationChime(type);
    }
    setIsSoundMenuOpen(false);
  }

  async function handleSignOut() {
    setIsSigningOut(true);
    if (isSupabaseConfigured) {
      await supabase.auth.signOut();
    } else {
      localStorage.removeItem('dentalai_demo_session');
    }
    router.replace('/login');
  }

  return (
    <div className="flex flex-col gap-4 rounded-[2rem] border border-slate-800 bg-slate-950/80 p-5 text-right sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm uppercase tracking-[0.2em] text-cyan-300/80">المستخدم</p>
        <p className="mt-2 text-sm text-slate-300">{email || 'مرحباً بك'}</p>
      </div>
      <div className="flex items-center gap-3">
        {/* #35 — live in-app clinic notifications (badge + glass dropdown) */}
        <div className="flex items-center gap-2">
          <NotificationBell />
          <div className="relative" ref={soundMenuRef} dir="rtl">
            <button
              type="button"
              onClick={() => setIsSoundMenuOpen((open) => !open)}
              aria-label="اختيار نغمة الإشعارات"
              aria-haspopup="menu"
              aria-expanded={isSoundMenuOpen}
              title="اختيار نغمة الإشعارات"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-800 bg-slate-900 text-slate-300 transition-all hover:border-slate-700 hover:bg-slate-800/80 hover:text-white focus:outline-none"
            >
              <Music className="h-5 w-5" />
            </button>
            {isSoundMenuOpen && (
              <div
                role="menu"
                aria-label="نغمة الإشعارات"
                className="absolute left-0 z-50 mt-2 w-44 overflow-hidden rounded-xl border border-slate-800 bg-slate-950/95 p-1.5 text-right shadow-2xl backdrop-blur-xl"
              >
                {CHIME_OPTIONS.map((option) => (
                  <button
                    key={option.type}
                    type="button"
                    role="menuitemradio"
                    aria-checked={chimeType === option.type}
                    onClick={() => chooseChime(option.type)}
                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
                      chimeType === option.type
                        ? 'bg-cyan-500/10 text-cyan-300'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <span>{option.label}</span>
                    {chimeType === option.type && (
                      <span aria-hidden="true" className="text-xs">✓</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        {/* PWA - hides itself once the dashboard is installed. */}
        <InstallPWA />
        <button
          type="button"
          onClick={handleSignOut}
          disabled={isSigningOut}
          className="inline-flex items-center justify-center rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-500/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSigningOut ? 'جاري الخروج...' : 'تسجيل الخروج'}
        </button>
      </div>
    </div>
  );
}
