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
    <section id="for-doctors" className="bg-slate-950 py-24">
      <div className="mx-auto max-w-6xl px-4">
        <BlurFade inView>
          <div className="mb-16 text-center">
            <span className="mb-4 inline-block rounded-full border border-purple-400/30 bg-purple-400/10 px-4 py-1 text-sm font-semibold text-purple-300">
              💼 للأطباء
            </span>
            <h2 className="mb-4 text-4xl font-bold text-white md:text-5xl">
              مصممة خصيصاً{' '}
              <span className="bg-gradient-to-r from-cyan-400 to-purple-500 bg-clip-text text-transparent">
                لأصحاب العيادات
              </span>
            </h2>
            <p className="mx-auto max-w-2xl text-lg text-slate-400">
              كل ما تحتاجه لإدارة عيادتك وتنميتها — في منصة واحدة
            </p>
          </div>
        </BlurFade>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature, idx) => (
            <BlurFade key={feature.title} delay={idx * 0.08} inView className="h-full">
              <div className="group relative h-full overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/50 p-6 transition hover:border-cyan-500/50">
                <div
                  className={`absolute inset-0 bg-gradient-to-br ${feature.gradient} rounded-2xl opacity-0 transition-opacity duration-500 group-hover:opacity-100`}
                />
                <div className="relative">
                  <div className="mb-4 text-5xl transition-transform duration-300 group-hover:scale-110">{feature.icon}</div>
                  <h3 className="mb-2 text-xl font-bold text-white">{feature.title}</h3>
                  <p className="leading-relaxed text-slate-400">{feature.description}</p>
                </div>
              </div>
            </BlurFade>
          ))}
        </div>
      </div>
    </section>
  );
}