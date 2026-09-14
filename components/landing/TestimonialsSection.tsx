'use client';

import { AvatarCircles } from '@/components/ui/avatar-circles';
import { BlurFade } from '@/components/ui/blur-fade';
import { Marquee } from '@/components/ui/marquee';

const TESTIMONIALS = [
  { content: 'زادت حجوزاتي 40% في أول شهر — المحادثة تلتقط المرضى اللي كنت أفوتهم.', doctor_name: 'د. أحمد', specialty: 'طب أسنان عام', color: 'from-cyan-400 to-blue-500' },
  { content: 'مرضاي سعداء بالرد الفوري بلغتهم. ما عدى في مكالمات ضايعة بعد الدوام.', doctor_name: 'د. سارة', specialty: 'تقويم', color: 'from-violet-400 to-purple-500' },
  { content: 'توفير الوقت = توفير فلوس. الجدول يتعبى لحاله وأنا أركز على العلاج.', doctor_name: 'د. محمد', specialty: 'جراحة', color: 'from-emerald-400 to-teal-500' },
  { content: 'من اليوم الأول ما فقدت مكالمة وحدة. النظام يلتقط كل شي.', doctor_name: 'د. ليان', specialty: 'أطفال', color: 'from-amber-400 to-orange-500' },
  { content: 'أفضل استثمار سويتو لعيادتي — استرجعت التكلفة بأسبوعين.', doctor_name: 'د. خالد', specialty: 'زراعة', color: 'from-pink-400 to-rose-500' },
];

export default function TestimonialsSection() {
  return (
    <section className="relative overflow-hidden bg-slate-950 py-24">
      <div className="mx-auto max-w-6xl px-4">
        <BlurFade inView>
          <div className="mb-10 text-center">
            <h2 className="text-3xl font-black text-white md:text-5xl">أطباء يثقون بنا</h2>
            <p className="mt-3 text-lg text-slate-400">انضم إلى نخبة الأطباء في فلسطين</p>
          </div>
        </BlurFade>
        <BlurFade delay={0.2} inView>
          <div className="mb-12 flex justify-center">
            <AvatarCircles numPeople={99} avatarUrls={['/icons/icon-192.png', '/icons/icon-512.png']} className="mb-0" />
          </div>
        </BlurFade>

        <div className="relative">
          <div className="absolute bottom-0 left-0 top-0 z-10 w-24 bg-gradient-to-l from-slate-950 to-transparent" />
          <div className="absolute bottom-0 right-0 top-0 z-10 w-24 bg-gradient-to-r from-slate-950 to-transparent" />
          <Marquee pauseOnHover className="[--duration:45s]">
            {TESTIMONIALS.map((t) => (
              <div key={t.doctor_name} className="mx-4 w-96 shrink-0 rounded-2xl border border-slate-800 bg-slate-900/50 p-6 backdrop-blur transition hover:border-cyan-500/50">
                <div className="mb-3 text-amber-400">{'⭐'.repeat(5)}</div>
                <p className="mb-4 text-lg leading-7 text-slate-200">“{t.content}”</p>
                <div className="flex items-center gap-3 border-t border-slate-800 pt-4">
                  <div className={`grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br ${t.color} font-bold text-white`}>{t.doctor_name.charAt(3)}</div>
                  <div>
                    <div className="font-bold text-white">{t.doctor_name}</div>
                    <div className="text-xs text-slate-400">{t.specialty}</div>
                  </div>
                </div>
              </div>
            ))}
          </Marquee>
        </div>
      </div>
    </section>
  );
}
