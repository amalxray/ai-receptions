'use client';

import { BlurFade } from '@/components/ui/blur-fade';
import { BorderBeam } from '@/components/ui/border-beam';
import { motion } from 'framer-motion';

const WITHOUT = ['مكالمات ضايعة بعد الدوام', 'مرضى يبحثون عن عيادة أخرى', 'معلومات ناقصة قبل الموعد', 'تذكير يدوي يُنسى', 'تحليلات شبه معدومة'];
const WITH = ['رد 24/7 على كل مكالمة ورسالة', 'حجز فوري في جدولك', 'جمع كامل لمعلومات المريض', 'تذكير تلقائي يقلل الغياب', 'تقارير واضحة عن مصدر مرضاك'];

export default function ComparisonSection() {
  return (
    <section className="bg-[#FAFBFC] py-24">
      <BlurFade inView>
        <div className="mb-16 text-center">
          <span className="mb-4 inline-block rounded-full border border-cyan-200 bg-cyan-50 px-4 py-1 text-sm font-semibold text-cyan-700">🎯 الفرق</span>
          <h2 className="text-3xl font-black text-slate-950 md:text-5xl">لماذا التحول إلى AI-Receptions؟</h2>
        </div>
      </BlurFade>

      <div className="mx-auto grid max-w-4xl gap-8 px-4 md:grid-cols-2">
        <BlurFade delay={0.1} inView>
          <motion.div initial={{ opacity: 0, x: -28 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }} className="h-full rounded-3xl border border-slate-200 bg-slate-100/80 p-8 transition hover:shadow-lg">
            <h3 className="mb-8 flex items-center gap-3 text-2xl font-bold text-slate-800"><span className="text-3xl">😓</span> بدون AI-Receptions</h3>
            <ul className="space-y-4">
              {WITHOUT.map((item, i) => (
                <motion.li initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.06 }} key={i} className="flex items-start gap-3 text-slate-700"><span className="mt-1 shrink-0 text-xl text-[#EF4444]">❌</span><span className="text-lg">{item}</span></motion.li>
              ))}
            </ul>
          </motion.div>
        </BlurFade>

        <BlurFade delay={0.2} inView>
          <motion.div initial={{ opacity: 0, x: 28 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }} className="relative h-full overflow-hidden rounded-3xl border border-violet-200 bg-gradient-to-br from-violet-50 to-cyan-50 p-8 shadow-[0_12px_40px_-24px_rgba(139,92,246,0.45)] transition hover:shadow-[0_18px_48px_-20px_rgba(34,211,238,0.5)]">
            <BorderBeam size={140} duration={10} colorFrom="#10B981" colorTo="#0EA5E9" />
            <h3 className="mb-8 flex items-center gap-3 text-2xl font-bold text-emerald-700"><span className="text-3xl">✨</span> مع AI-Receptions</h3>
            <ul className="space-y-4">
              {WITH.map((item, i) => (
                <motion.li initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.06 }} key={i} className="flex items-start gap-3 text-slate-800"><span className="mt-1 shrink-0 text-xl text-[#10B981]">✅</span><span className="text-lg">{item}</span></motion.li>
              ))}
            </ul>
          </motion.div>
        </BlurFade>
      </div>
    </section>
  );
}
