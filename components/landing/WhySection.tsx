'use client';

import { BlurFade } from '@/components/ui/blur-fade';
import { BentoGrid, BentoCard } from '@/components/ui/bento-grid';
import { Particles } from '@/components/ui/particles';
import { Meteors } from '@/components/ui/meteors';

/** لماذا AI-Receptions — Bento Grid (6 cards, dark). */
export default function WhySection() {
  return (
    <section className="relative overflow-hidden bg-slate-950 py-24">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/4 top-0 h-96 w-96 rounded-full bg-violet-600/15 blur-3xl" />
        <div className="absolute bottom-0 right-1/4 h-96 w-96 rounded-full bg-cyan-500/10 blur-3xl" />
      </div>

      <div className="mx-auto max-w-6xl px-4">
        <BlurFade inView>
          <p className="mb-3 text-center text-sm font-bold uppercase tracking-[0.3em] text-cyan-400">لماذا نحن</p>
          <h2 className="text-center text-3xl font-black text-white md:text-5xl">
            كل ما تحتاجه عيادتك…{' '}
            <span className="bg-gradient-to-l from-emerald-400 via-cyan-400 to-violet-400 bg-clip-text text-transparent">
              بمكان واحد
            </span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-lg text-slate-400">
            موظفة استقبال رقمية لا تنام — تحجز، ترد، وتحلّل على مدار الساعة.
          </p>
        </BlurFade>

        <div className="mt-14">
          <BentoGrid>
            <BentoCard
              name="ردود فورية"
              description="موظفة الاستقبال ترد على مرضاك في ثوانٍ — بلغتهم ولهجتهم وبمزاجهم."
              icon="🕐"
              cta="اعرف أكثر"
              href="/register"
              className="lg:col-span-2"
              background={<Particles className="absolute inset-0 opacity-60" quantity={40} color="#34D399" />}
            />

            <BentoCard
              name="ذكاء اصطناعي حقيقي"
              description={'يفهم العربية والعامية: "طاحونتي بتوجعني" ← يسأل، يجمع المعلومات، ويرشّح بذكاء.'}
              icon="🤖"
              cta="جرّب الـ /ask"
              href="/ask"
              className="min-h-[220px]"
              background={<Meteors number={8} />}
            />

            <BentoCard
              name="حجز تلقائي 24/7"
              description="بلا تدخل يدوي — الموعد يُثبَّت فوراً في جدولك بلحظة طلب المريض."
              icon="📅"
              href="/register"
              className="min-h-[220px]"
            />

            <BentoCard
              name="تحليلات حية"
              description="اعرف من أين يأتي مرضاك، كم محادثة، كم حجز، وكم ملغى — تقارير واضحة تبنى عليها قراراتك."
              icon="📊"
              cta="استكشف اللوحة"
              href="/register"
              className="lg:col-span-2"
              background={<Particles className="absolute inset-0 opacity-50" quantity={36} color="#38BDF8" />}
            />

            <BentoCard
              name="يعمل على الجوال"
              description="تطبيق PWA + واتساب — المرضى يستخدمونه من جيبهم بكل سهولة."
              icon="📱"
              href="/ask"
              hoverColor="hover:border-emerald-500/60"
            />

            <BentoCard
              name="آمن 100%"
              description="تشفير كامل + عزل بين العيادات (multi-tenant) — بياناتك وبيانات مرضاك محمية."
              icon="🔒"
              href="/ask/privacy"
              hoverColor="hover:border-violet-500/60"
            />
          </BentoGrid>
        </div>
      </div>
    </section>
  );
}