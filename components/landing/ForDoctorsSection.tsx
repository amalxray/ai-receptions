'use client';

import { BlurFade } from '@/components/ui/blur-fade';

/**
 * FOR DOCTORS SECTION — B2B feature grid for clinic owners.
 * Replaces the numbered-points ForDoctors section with a scannable
 * 6-card grid (dashboard / finance / mobile / marketing / network / security).
 */
type Feature = {
  icon: string;
  title: string;
  description: string;
  gradient: string;
};

const FEATURES: Feature[] = [
  {
    icon: '📊',
    title: 'لوحة تحكم شاملة',
    description: 'كل شيء في مكان واحد — المواعيد، المرضى، المالية، التقارير.',
    gradient: 'from-cyan-500/20 to-blue-500/20',
  },
  {
    icon: '💰',
    title: 'تقارير مالية دقيقة',
    description: 'اعرف إيراداتك، مصروفاتك، وربحك الصافي في الوقت الفعلي.',
    gradient: 'from-emerald-500/20 to-green-500/20',
  },
  {
    icon: '📱',
    title: 'إدارة من أي مكان',
    description: 'عيادتك في جيبك — تحكم كامل من الجوال أو الحاسوب.',
    gradient: 'from-purple-500/20 to-pink-500/20',
  },
  {
    icon: '🎯',
    title: 'تسويق تلقائي',
    description: 'اجذب مرضى جدد عبر الصفحة العامة والـ QR Code.',
    gradient: 'from-amber-500/20 to-orange-500/20',
  },
  {
    icon: '🤝',
    title: 'شبكة أطباء',
    description: 'تعاون مع مراكز التصوير والمختبرات — إحالات سهلة.',
    gradient: 'from-indigo-500/20 to-violet-500/20',
  },
  {
    icon: '🔒',
    title: 'أمان واحترافية',
    description: 'تشفير كامل، نسخ احتياطي يومي، وامتثال للمعايير.',
    gradient: 'from-slate-500/20 to-gray-500/20',
  },
];

export default function ForDoctorsSection() {
  return (
    <section id="for-doctors" className="relative overflow-hidden bg-[#FAFBFC] py-24">
      <div aria-hidden="true" className="pointer-events-none absolute -left-16 top-8 h-72 w-72 rounded-full bg-violet-200/40 blur-[100px]" />
      <div aria-hidden="true" className="pointer-events-none absolute -right-16 bottom-0 h-72 w-72 rounded-full bg-cyan-200/40 blur-[100px]" />
      <div className="relative mx-auto max-w-6xl px-4">
        <BlurFade inView>
          <div className="mb-16 text-center">
            <span className="mb-4 inline-block rounded-full border border-purple-200 bg-purple-50 px-4 py-1 text-sm font-semibold text-purple-700">
              💼 للأطباء
            </span>
            <h2 className="mb-4 text-4xl font-bold text-slate-950 md:text-5xl">
              مصممة خصيصاً{' '}
              <span className="bg-gradient-to-r from-cyan-600 to-purple-600 bg-clip-text text-transparent">
                لأصحاب العيادات
              </span>
            </h2>
            <p className="mx-auto max-w-2xl text-lg text-slate-600">
              كل ما تحتاجه لإدارة عيادتك وتنميتها — في منصة واحدة
            </p>
          </div>
        </BlurFade>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature, idx) => (
            <BlurFade key={feature.title} delay={idx * 0.08} inView className="h-full">
              <div className={`group relative h-full overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-[0_16px_40px_-20px_rgba(59,130,246,0.35)]`}>
                <div
                  className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${feature.gradient} opacity-0 transition-opacity duration-500 group-hover:opacity-100`}
                />
                <div aria-hidden="true" className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full border-2 border-violet-300/60 opacity-0 transition duration-700 group-hover:scale-[1.8] group-hover:opacity-100" />
                <div className="relative z-10">
                  <div className="mb-4 text-5xl transition-transform duration-300 group-hover:scale-110">{feature.icon}</div>
                  <h3 className="mb-2 text-lg font-bold text-slate-900">{feature.title}</h3>
                  <p className="text-sm leading-relaxed text-slate-600">{feature.description}</p>
                </div>
              </div>
            </BlurFade>
          ))}
        </div>
      </div>
    </section>
  );
}