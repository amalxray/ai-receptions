'use client';

import { BlurFade } from '@/components/ui/blur-fade';
import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  TrendingUp,
  Smartphone,
  Megaphone,
  Network,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';

/**
 * FOR DOCTORS SECTION — premium dark glassmorphism grid for clinic owners.
 */
type Feature = {
  Icon: LucideIcon;
  title: string;
  description: string;
  iconStyle: string;
};

const FEATURES: Feature[] = [
  {
    Icon: LayoutDashboard,
    title: 'لوحة تحكم شاملة',
    description: 'كل شيء في مكان واحد — المواعيد، المرضى، المالية، التقارير.',
    iconStyle: 'bg-cyan-500/15 text-cyan-300',
  },
  {
    Icon: TrendingUp,
    title: 'تقارير مالية دقيقة',
    description: 'اعرف إيراداتك، مصروفاتك، وربحك الصافي في الوقت الفعلي.',
    iconStyle: 'bg-emerald-500/15 text-emerald-300',
  },
  {
    Icon: Smartphone,
    title: 'إدارة من أي مكان',
    description: 'عيادتك في جيبك — تحكم كامل من الجوال أو الحاسوب.',
    iconStyle: 'bg-violet-500/15 text-violet-300',
  },
  {
    Icon: Megaphone,
    title: 'تسويق تلقائي',
    description: 'اجذب مرضى جدد عبر الصفحة العامة والـ QR Code.',
    iconStyle: 'bg-amber-500/15 text-amber-300',
  },
  {
    Icon: Network,
    title: 'شبكة أطباء',
    description: 'تعاون مع مراكز التصوير والمختبرات — إحالات سهلة.',
    iconStyle: 'bg-cyan-500/15 text-cyan-300',
  },
  {
    Icon: ShieldCheck,
    title: 'أمان واحترافية',
    description: 'تشفير كامل، نسخ احتياطي يومي، وامتثال للمعايير.',
    iconStyle: 'bg-violet-500/15 text-violet-300',
  },
];

export default function ForDoctorsSection() {
  return (
    <section id="for-doctors" className="relative overflow-hidden bg-slate-950 py-24 text-white">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-0 h-96 w-96 rounded-full bg-violet-600/20 blur-[120px]" />
        <div className="absolute -right-24 bottom-0 h-96 w-96 rounded-full bg-cyan-500/15 blur-[120px]" />
      </div>
      <div className="relative mx-auto max-w-6xl px-4">
        <BlurFade inView>
          <div className="mb-16 text-center">
            <span className="mb-4 inline-block rounded-full border border-violet-400/30 bg-violet-500/10 px-4 py-1 text-sm font-semibold text-violet-300">
              للأطباء
            </span>
            <h2 className="mb-4 text-4xl font-bold text-white md:text-5xl">
              مصممة خصيصاً{' '}
              <span className="bg-gradient-to-r from-cyan-300 to-violet-400 bg-clip-text text-transparent">
                لأصحاب العيادات
              </span>
            </h2>
            <p className="mx-auto max-w-2xl text-lg text-slate-400">
              كل ما تحتاجه لإدارة عيادتك وتنميتها — في منصة واحدة
            </p>
          </div>
        </BlurFade>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature, idx) => (
            <BlurFade key={feature.title} delay={idx * 0.08} inView className="h-full">
              <motion.div
                whileHover={{ y: -5, scale: 1.02 }}
                whileTap={{ scale: 0.99 }}
                className="group relative h-full overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl transition-shadow duration-300 hover:border-cyan-500/50 hover:shadow-[0_0_30px_rgba(34,211,238,0.25)]"
              >
                <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-transparent to-violet-500/10 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                <div className="relative z-10">
                  <div className={`mb-4 grid h-14 w-14 place-items-center rounded-2xl ${feature.iconStyle}`}>
                    <feature.Icon className="h-7 w-7" aria-hidden="true" />
                  </div>
                  <h3 className="mb-2 text-lg font-bold text-white">{feature.title}</h3>
                  <p className="text-sm leading-relaxed text-slate-400">{feature.description}</p>
                </div>
              </motion.div>
            </BlurFade>
          ))}
        </div>
      </div>
    </section>
  );
}