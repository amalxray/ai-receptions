import type { Metadata } from 'next';
import { ArrowDown, Sparkles } from 'lucide-react';
import ButtonsShowcase from '@/components/ui-lab/ButtonsShowcase';
import CardsShowcase from '@/components/ui-lab/CardsShowcase';
import InputsShowcase from '@/components/ui-lab/InputsShowcase';
import TogglesShowcase from '@/components/ui-lab/TogglesShowcase';
import TabsShowcase from '@/components/ui-lab/TabsShowcase';
import AmbientShowcase from '@/components/ui-lab/AmbientShowcase';
import ImageMotionShowcase from '@/components/ui-lab/ImageMotionShowcase';

export const metadata: Metadata = {
  title: 'مختبر التصميم | AI-Receptions',
  description: 'معاينة تفاعلية لخيارات مكونات الواجهة قبل اعتماد أسلوب التصميم.',
  robots: { index: false, follow: false },
};

const sections = [
  { id: 'buttons', number: '01', title: 'الأزرار', subtitle: 'BUTTONS' },
  { id: 'cards', number: '02', title: 'البطاقات', subtitle: 'CARDS' },
  { id: 'inputs', number: '03', title: 'حقول الإدخال', subtitle: 'INPUTS' },
  { id: 'toggles', number: '04', title: 'المفاتيح', subtitle: 'TOGGLES' },
  { id: 'tabs', number: '05', title: 'التبويبات', subtitle: 'TABS' },
  { id: 'ambience', number: '06', title: 'أجواء هادئة', subtitle: 'AMBIENCE' },
  { id: 'images', number: '07', title: 'حركة الصور', subtitle: 'IMAGE MOTION' },
];

export default function UiLabPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-950 text-white">
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -right-40 -top-48 h-[34rem] w-[34rem] rounded-full bg-cyan-500/10 blur-[120px]" />
        <div className="absolute -left-48 top-[48rem] h-[36rem] w-[36rem] rounded-full bg-emerald-500/10 blur-[130px]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.035)_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />
      </div>

      <div className="relative mx-auto max-w-7xl px-5 pb-24 pt-8 sm:px-8 lg:px-12">
        <header className="flex items-center justify-between border-b border-white/10 pb-5">
          <a href="#top" className="flex items-center gap-3 text-sm font-semibold tracking-wide text-slate-200">
            <span className="grid h-9 w-9 place-items-center rounded-xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-200">
              <Sparkles size={17} />
            </span>
            AI-RECEPTIONS <span className="text-slate-500">/ DESIGN LAB</span>
          </a>
          <span className="hidden rounded-full border border-emerald-300/20 bg-emerald-300/5 px-3 py-1.5 text-xs text-emerald-200 sm:inline-flex">
            معاينة تفاعلية · 7 مجموعات
          </span>
        </header>

        <section id="top" className="grid gap-12 pb-16 pt-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-end lg:pt-24">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/[0.06] px-3 py-1.5 text-xs font-medium text-cyan-100">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300" />
              مساحة اختيار الستايل
            </div>
            <h1 className="max-w-3xl text-4xl font-black leading-[1.2] tracking-tight text-white sm:text-5xl lg:text-6xl">
              واجهة واحدة،<br />
              <span className="bg-gradient-to-l from-cyan-200 via-teal-200 to-emerald-300 bg-clip-text text-transparent">خيارات متعددة.</span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-8 text-slate-400 sm:text-lg">
              جرّب التفاصيل والتفاعلات بنفسك. اختر المظهر الأقرب للمنصة، ثم نطبّقه على الواجهات المناسبة.
            </p>
            <a href="#buttons" className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-cyan-200 transition hover:text-emerald-200">
              ابدأ الاستكشاف <ArrowDown size={16} />
            </a>
          </div>

          <nav aria-label="أقسام المختبر" className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {sections.map((section) => (
              <a key={section.id} href={`#${section.id}`} className="group rounded-2xl border border-white/[0.08] bg-white/[0.025] p-3 transition hover:border-cyan-300/25 hover:bg-white/[0.05]">
                <span className="block font-mono text-[10px] text-slate-600">{section.number}</span>
                <span className="mt-3 block text-sm font-bold text-slate-200 group-hover:text-white">{section.title}</span>
                <span className="mt-1 block font-mono text-[9px] tracking-[0.15em] text-slate-600">{section.subtitle}</span>
              </a>
            ))}
          </nav>
        </section>

        <div className="space-y-7">
          <ShowcaseSection id="buttons" number="01" title="الأزرار" subtitle="حالات تفاعلية، من الهادئ إلى المضيء." tags={['HOVER', 'GLOW']}>
            <ButtonsShowcase />
          </ShowcaseSection>
          <ShowcaseSection id="cards" number="02" title="البطاقات" subtitle="طبقات وعمق وحركة تستجيب للمؤشر." tags={['BENTO', 'MOTION']}>
            <CardsShowcase />
          </ShowcaseSection>
          <ShowcaseSection id="inputs" number="03" title="حقول الإدخال" subtitle="وضوح بصري وحالات تركيز سهلة الملاحظة." tags={['FOCUS', 'FORM']}>
            <InputsShowcase />
          </ShowcaseSection>
          <ShowcaseSection id="toggles" number="04" title="المفاتيح" subtitle="تبديل حالة بسيط مع استجابة ناعمة." tags={['SWITCH', 'SPRING']}>
            <TogglesShowcase />
          </ShowcaseSection>
          <ShowcaseSection id="tabs" number="05" title="التبويبات" subtitle="تنقل واضح بمؤشر متحرك بين الخيارات." tags={['LAYOUT ID', 'TABS']}>
            <TabsShowcase />
          </ShowcaseSection>
          <ShowcaseSection id="ambience" number="06" title="أجواء هادئة" subtitle="ألوان مريحة وحركة بطيئة تمنح الواجهة نفسًا أهدأ." tags={['AURORA', 'AMBIENT', 'CALM']}>
            <AmbientShowcase />
          </ShowcaseSection>
          <ShowcaseSection id="images" number="07" title="حركة الصور" subtitle="طرق تفاعلية متنوعة لعرض الصور ومحتوى العيادة." tags={['MASONRY', 'LIGHTBOX', 'DRAG']}>
            <ImageMotionShowcase />
          </ShowcaseSection>
        </div>

        <footer className="mt-10 flex flex-col gap-2 border-t border-white/10 pt-6 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between">
          <span>DESIGN EXPLORATION · AI-RECEPTIONS</span>
          <span>اختر المكونات التي تريد اعتمادها في المنصة.</span>
        </footer>
      </div>
    </main>
  );
}

function ShowcaseSection({
  id,
  number,
  title,
  subtitle,
  tags,
  children,
}: {
  id: string;
  number: string;
  title: string;
  subtitle: string;
  tags: string[];
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-6 rounded-[1.75rem] border border-white/[0.09] bg-slate-900/45 p-5 shadow-[0_24px_90px_-50px_rgba(0,0,0,0.9)] backdrop-blur-sm sm:p-8">
      <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <span className="mt-0.5 font-mono text-xs text-cyan-300/60">{number}</span>
          <div>
            <h2 className="text-2xl font-extrabold text-white">{title}</h2>
            <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {tags.map((tag) => <span key={tag} className="rounded-full border border-white/[0.08] px-2.5 py-1 font-mono text-[9px] tracking-wider text-slate-500">{tag}</span>)}
        </div>
      </div>
      {children}
    </section>
  );
}
