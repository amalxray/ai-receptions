'use client';

import { motion } from 'framer-motion';
import { useLandingCopy } from '@/components/landing/LandingContent';
import WhySection from './WhySection';
import ResultsSection from './ResultsSection';
import ForDoctorsSection from './ForDoctorsSection';
import HowItWorksSection from './HowItWorksSection';
import { Imaging } from './Sections';
import PricingSection from './PricingSection';
import { ClinicAds } from './Sections';
import ComparisonSection from './ComparisonSection';
import { FAQ } from './Sections';
import TestimonialsSection from './TestimonialsSection';
import FinalCTASection from './FinalCTASection';
import LeadForm from './LeadForm';
import Navbar from './Navbar';
import UrgencyBar from './UrgencyBar';
import Hero from './Hero';
import RotatingMarquee from '@/components/ui/RotatingMarquee';

type LandingPageProps = {
  galleryImages?: Array<{ id: string; title: string; image_url: string; category: string | null }>;
};

export default function LandingPage({ galleryImages = [] }: LandingPageProps) {
  const copy = useLandingCopy();
  return (
    <>
      <Navbar />
      <UrgencyBar />
      <main className="bg-landing-bg text-landing-text">
        <Hero />
        <WhySection />
        <RotatingMarquee variant="light" items={galleryImages.length ? galleryImages.map((image) => ({ id: image.id, title: image.title, subtitle: '', Badge: '', color: 'from-[#8B5CF6] to-[#0EA5E9]', accent: 'from-violet-500 to-cyan-400', chip: image.category ?? '', image: image.image_url, imageAlt: image.title })) : undefined} />
        <ResultsSection />
        <ForDoctorsSection />
        <HowItWorksSection />
        <Imaging />
        <PricingSection />
        <ClinicAds />
        <TestimonialsSection />
        <ComparisonSection />
        <FAQ />
        <FinalCTASection />
        <LeadForm />
      </main>

      {/* Footer */}
      <footer className="border-t border-[#E2E8F0] bg-slate-50 py-12 text-center text-slate-600">
        <div className="mx-auto flex flex-col items-center gap-4 px-4 sm:flex-row sm:justify-between sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 font-heading text-lg font-bold text-slate-900">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-landing-indigo to-landing-violet text-sm font-black">
              A
            </span>
            {copy.brand.name}
          </div>
          {/* Quick links */}
          <nav className="flex flex-wrap items-center gap-4" aria-label="روابط سريعة">
            <a href="/login" className="text-sm text-slate-600 transition hover:text-slate-900">
              تسجيل الدخول
            </a>
            <a href="/register" className="text-sm text-slate-600 transition hover:text-slate-900">
              إنشاء حساب
            </a>
            <a href="#faq" className="text-sm text-slate-600 transition hover:text-slate-900">
              الأسئلة الشائعة
            </a>
            <a href="mailto:support@ai-receptions.com" className="text-sm text-slate-600 transition hover:text-slate-900">
              تواصل معنا
            </a>
          </nav>
          <p className="text-sm text-slate-500">{copy.footer.copyright}</p>
        </div>
      </footer>

      {/* Floating action button (FAB) — bottom-left in RTL */}
      <motion.a
        href="/chat"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 1.2, type: 'spring', stiffness: 260, damping: 20 }}
        className="group fixed bottom-6 left-6 z-50 flex items-center gap-2"
        aria-label={copy.footer.fabTooltip}
      >
        <span className="pointer-events-none hidden translate-x-2 rounded-lg border border-[#E2E8F0] bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 opacity-0 shadow-lg transition-all group-hover:translate-x-0 group-hover:opacity-100 sm:block">
          {copy.footer.fabTooltip}
        </span>
        <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-landing-indigo to-landing-violet text-white shadow-landing-btn">
          <span className="absolute inset-0 animate-ping rounded-full bg-landing-indigo/40" />
          <span className="relative text-2xl">💬</span>
        </span>
      </motion.a>

      {/* Mobile-only sticky CTA bar */}
      <div className="fixed bottom-0 inset-x-0 z-40 border-t border-landing-indigo/10 bg-landing-bg-white/95 p-3 backdrop-blur-md sm:hidden">
        <a href="#founding" className="block rounded-xl bg-gradient-to-l from-landing-indigo to-landing-violet px-4 py-3 text-center text-sm font-bold text-white">
          احجز مكانك بين أول 100 ←
        </a>
      </div>
    </>
  );
}