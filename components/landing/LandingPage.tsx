'use client';

import { useLandingCopy } from '@/components/landing/LandingContent';
import WhySection from './WhySection';
import ResultsSection from './ResultsSection';
import ForDoctorsSection from './ForDoctorsSection';
import HowItWorksSection from './HowItWorksSection';
import { Imaging } from './Sections';
import PricingSection from './PricingSection';
import { ClinicAds } from './Sections';
import ComparisonSection from './ComparisonSection';
import TestimonialsSection from './TestimonialsSection';
import FinalCTASection from './FinalCTASection';
import FAQSection from './FAQSection';
import LeadForm from './LeadForm';
import Navbar from './Navbar';
import UrgencyBar from './UrgencyBar';
import Hero from './Hero';
import GalleryGrid from './GalleryGrid';
import SalesChatWidget from './SalesChatWidget';

type LandingPageProps = {
  galleryImages?: Array<{ id: string; title: string; image_url: string; category: string | null }>;
  galleryVideos?: Array<{ id: string; title: string; video_url: string; category: string | null }>;
  sectionOrder?: string[];
};

const DEFAULT_SECTION_ORDER = ['hero', 'features', 'for_doctors', 'how_it_works', 'compare', 'faq', 'pricing', 'testimonials', 'gallery', 'cta', 'results', 'imaging', 'clinic_ads', 'lead_form', 'footer'];

function SocialProof() {
  return (
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
  );
}

function LandingFooter() {
  const copy = useLandingCopy();
  return (
    <footer className="border-t border-[#E2E8F0] bg-slate-50 py-12 text-center text-slate-600">
      <div className="mx-auto flex flex-col items-center gap-4 px-4 sm:flex-row sm:justify-between sm:px-6 lg:px-8">
        <div className="flex items-center gap-2 font-heading text-lg font-bold text-slate-900">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-landing-indigo to-landing-violet text-sm font-black">A</span>
          {copy.brand.name}
        </div>
        <nav className="flex flex-wrap items-center gap-4" aria-label="روابط سريعة">
          <a href="/login" className="text-sm text-slate-600 transition hover:text-slate-900">تسجيل الدخول</a>
          <a href="/register" className="text-sm text-slate-600 transition hover:text-slate-900">إنشاء حساب</a>
          <a href="#faq" className="text-sm text-slate-600 transition hover:text-slate-900">الأسئلة الشائعة</a>
          <a href="/terms" className="text-sm text-slate-600 transition hover:text-slate-900">شروط الخدمة</a>
          <a href="/privacy" className="text-sm text-slate-600 transition hover:text-slate-900">الخصوصية</a>
          <a href="mailto:support@ai-receptions.com" className="text-sm text-slate-600 transition hover:text-slate-900">تواصل معنا</a>
        </nav>
        <p className="text-sm text-slate-500">{copy.footer.copyright}</p>
      </div>
    </footer>
  );
}

export default function LandingPage({ galleryImages = [], galleryVideos = [], sectionOrder = DEFAULT_SECTION_ORDER }: LandingPageProps) {
  const copy = useLandingCopy();
  const orderedSections = sectionOrder.length ? sectionOrder : DEFAULT_SECTION_ORDER;
  const hiddenSections = new Set<string>(Array.isArray(copy.__hiddenSections) ? copy.__hiddenSections : []);

  const sectionMap: Record<string, React.ReactNode> = {
    hero: <><Hero /><SocialProof /></>,
    features: <WhySection key="features" />,
    for_doctors: <ForDoctorsSection key="for_doctors" />,
    how_it_works: <HowItWorksSection key="how_it_works" />,
    compare: <ComparisonSection key="compare" />,
    faq: <FAQSection key="faq" />,
    pricing: <PricingSection key="pricing" />,
    testimonials: <TestimonialsSection key="testimonials" />,
    gallery: (
      <GalleryGrid
        images={galleryImages}
        videos={galleryVideos}
        display={(copy as any).gallery ?? {}}
      />
    ),
    cta: <FinalCTASection key="cta" />,
    results: <ResultsSection key="results" />,
    imaging: <Imaging key="imaging" />,
    clinic_ads: <ClinicAds key="clinic_ads" />,
    lead_form: <LeadForm key="lead_form" />,
    footer: <LandingFooter key="footer" />,
  };

  return (
    <>
      <Navbar />
      {!hiddenSections.has('urgency_bar') && <UrgencyBar />}
      <main className="bg-landing-bg text-landing-text">
        {orderedSections
          .filter((key) => key in sectionMap && !hiddenSections.has(key))
          .map((key) => (
            <div key={key}>{sectionMap[key]}</div>
          ))}
      </main>
      <SalesChatWidget />

      {/* Mobile-only sticky CTA bar */}
      <div className="fixed bottom-0 inset-x-0 z-40 border-t border-landing-indigo/10 bg-landing-bg-white/95 p-3 backdrop-blur-md sm:hidden">
        <a href="/register" className="block rounded-xl bg-gradient-to-l from-landing-indigo to-landing-violet px-4 py-3 text-center text-sm font-bold text-white">
          احجز مكانك بين أول 100 ←
        </a>
      </div>
    </>
  );
}
