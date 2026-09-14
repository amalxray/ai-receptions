'use client';

import { BlurFade } from '@/components/ui/blur-fade';
import { BorderBeam } from '@/components/ui/border-beam';

const WITHOUT = ['مكالمات ضايعة بعد الدوام', 'مرضى يبحثون عن عيادة أخرى', 'معلومات ناقصة قبل الموعد', 'تذكير يدوي يُنسى', 'تحليلات شبه معدومة'];
const WITH = ['رد 24/7 على كل مكالمة ورسالة', 'حجز فوري في جدولك', 'جمع كامل لمعلومات المريض', 'تذكير تلقائي يقلل الغياب', 'تقارير واضحة عن مصدر مرضاك'];

export default function ComparisonSection() {
  return (
    <section className="bg-slate-950 py-24">
      <BlurFade inView>
        <div className="mb-16 text-center">
          <span className="mb-4 inline-block rounded-full border border-cyan-400/30 bg-cyan-500/10 px-4 py-1 text-sm font-semibold text-cyan-300">🎯 الفرق</span>
          <h2 className="text-3xl font-black text-white md:text-5xl">لماذا التحول إلى AI-Receptions؟</h2>
        </div>
      </BlurFade>

      <div className="mx-auto grid max-w-4xl gap-8 px-4 md:grid-cols-2">
        <BlurFade delay={0.1} inView>
          <div className="h-full rounded-3xl border border-red-900/30 bg-red-950/20 p-8">
            <h3 className="mb-8 flex items-center gap-3 text-2xl font-bold text-red-400"><span className="text-3xl">😓</span> بدون AI-Receptions</h3>
            <ul className="space-y-4">
              {WITHOUT.map((item, i) => (
                <li key={i} className="flex items-start gap-3 text-slate-300"><span className="mt-1 shrink-0 text-xl text-red-400">✕</span><span className="text-lg">{item}</span></li>
              ))}
            </ul>
          </div>
        </BlurFade>

        <BlurFade delay={0.2} inView>
          <div className="relative h-full overflow-hidden rounded-3xl border border-emerald-900/30 bg-emerald-950/20 p-8">
            <BorderBeam size={140} duration={10} colorFrom="#10B981" colorTo="#0EA5E9" />
            <h3 className="mb-8 flex items-center gap-3 text-2xl font-bold text-emerald-400"><span className="text-3xl">✨</span> مع AI-Receptions</h3>
            <ul className="space-y-4">
              {WITH.map((item, i) => (
                <li key={i} className="flex items-start gap-3 text-slate-200"><span className="mt-1 shrink-0 text-xl text-emerald-400">✓</span><span className="text-lg">{item}</span></li>
              ))}
            </ul>
          </div>
        </BlurFade>
      </div>
    </section>
  );
}
