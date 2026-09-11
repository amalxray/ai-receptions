'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useLandingCopy } from '@/components/landing/LandingContent';
import { supabase } from '@/lib/supabase';

export default function Navbar() {
  const copy = useLandingCopy();
  const [scrolled, setScrolled] = useState(false);
  const [dashboardUrl, setDashboardUrl] = useState<string | null>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Signed-in users see a direct "لوحة التحكم" entry instead of auth buttons.
  useEffect(() => {
    const checkSession = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) return;
        // Platform owner → عمدة لوحة المالك (مدخل منفصل تماماً عن العيادات).
        const { data: platform } = await supabase
          .from('platform_admins')
          .select('user_id')
          .eq('user_id', session.user.id)
          .maybeSingle();
        if (platform) {
          setDashboardUrl('/admin');
          return;
        }
        const { data } = await supabase
          .from('clinic_users')
          .select('clinic:clinics(slug)')
          .eq('user_id', session.user.id)
          .is('deleted_at', null)
          .limit(1)
          .maybeSingle();
        const membership = Array.isArray(data?.clinic) ? data?.clinic[0] : data?.clinic;
        const slug = membership?.slug;
        if (slug) setDashboardUrl(`/dashboard/${encodeURIComponent(slug)}/overview`);
      } catch {
        /* no session — fall through to auth CTA */
      }
    };
    void checkSession();
  }, []);

  return (
    <motion.header
      initial={{ y: -64, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'border-b border-landing-indigo/10 bg-landing-bg/80 backdrop-blur-md'
          : 'border-b border-transparent'
      }`}
    >
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-3">
          <span className="relative flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-landing-indigo to-landing-violet shadow-landing-btn">
            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-landing-cyan animate-pulse" />
            <span className="text-lg font-black text-white">A</span>
          </span>
          <span className="font-heading text-lg font-extrabold tracking-tight text-landing-text">
            AI-Receptions
          </span>
        </Link>

        {/* Desktop links */}
        <div className="hidden items-center gap-8 lg:flex">
          {copy.nav.links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-landing-text/70 transition hover:text-landing-indigo"
            >
              {link.label}
            </a>
          ))}
        </div>

        {/* Auth CTA — dashboard entry for signed-in users */}
        <div className="flex items-center gap-3">
          {dashboardUrl ? (
            <Link
              href={dashboardUrl}
              className="rounded-full bg-gradient-to-r from-landing-indigo to-landing-violet px-5 py-2 text-sm font-bold text-white shadow-landing-btn transition hover:opacity-90"
            >
              لوحة التحكم
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-full border border-landing-indigo/20 px-4 py-2 text-sm font-semibold text-landing-text transition hover:border-landing-indigo hover:text-landing-indigo"
              >
                تسجيل الدخول
              </Link>
              <Link
                href="/register"
                className="rounded-full bg-gradient-to-r from-landing-cyan to-landing-emerald px-5 py-2 text-sm font-bold text-white shadow-landing-btn transition hover:opacity-90"
              >
                ابدأ مجاناً
              </Link>
            </>
          )}
        </div>
      </nav>
    </motion.header>
  );
}