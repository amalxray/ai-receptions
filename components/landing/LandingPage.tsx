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
  sectionOrder?: string[];
};

const DEFAULT_SECTION_ORDER = ['features', 'for_doctors', 'how_it_works', 'compare', 'faq', 'testimonials'];

export default function LandingPage({ galleryImages = [], sectionOrder = DEFAULT_SECTION_ORDER }: LandingPageProps) {
  const copy = useLandingCopy();
  const orderedSections = sectionOrder.length ? sectionOrder : DEFAULT_SECTION_ORDER;

  const sectionMap: Record<string, React.ReactNode> = {
    features: <WhySection key="features" />,
    for_doctors: <ForDoctorsSection key="for_doctors" />,
    how_it_works: <HowItWorksSection key="how_it_works" />,
    compare: <ComparisonSection key="compare" />,
    faq: <FAQ key="faq" />,
    testimonials: <TestimonialsSection key="testimonials" />,
  };

  return (
    <>
      <Navbar />
      <UrgencyBar />
      <main className="bg-landing-bg text-landing-text">
        <Hero />

        <section className="relative overflow-hidden bg-slate-950 py-16 text-white">
          <div className="mx-auto max-w-6xl px-4">
            <div className="flex flex-col gap-6 rounded-[2rem] border border-white/10 bg-white/5 p-6 shadow-[0_30px_80px_-35px_rgba(15,23,42,0.9)] backdrop-blur-sm md:flex-row md:items-center md:justify-between md:p-8">
              <div>
                <p className="mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-teal-300">Real social proof</p>
                <h2 className="text-2xl font-black text-white md:text-3xl">مركز أمل لتصوير الأسنان والفكين يعمل فعلياً على المنصة.</h2>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300 md:text-base">
                  هذه ليست شهادة منشأة من الخارج، بل صفحة حقيقية ومباشرة من العيادة نفسها، تعكس تجربة العمل اليومي على المنصة مع واجهة احترافية ومحتوى منشور للعلاج والرسائل والتجربة العامة.
                </p>
              </div>

              <a
                href="https://amal-x-ray-center.dentairec.com"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-teal-400 to-emerald-400 px-5 py-3 text-sm font-bold text-slate-950 shadow-lg shadow-teal-500/25 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-teal-400/30"
              >
                معاينة الصفحة العامة ←
              </a>
            </div>
          </div>
        </section>

        {orderedSections
          .filter((key) => key in sectionMap)
          .map((key) => (
            <div key={key}>{sectionMap[key]}</div>
          ))}

        <RotatingMarquee variant="light" items={galleryImages.length ? galleryImages.map((image) => ({ id: image.id, title: image.title, subtitle: '', Badge: '', color: 'from-[#8B5CF6] to-[#0EA5E9]', accent: 'from-violet-500 to-cyan-400', chip: image.category ?? '', image: image.image_url, imageAlt: image.title })) : undefined} />
        <ResultsSection />
        <Imaging />
        <PricingSection />
        <ClinicAds />
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