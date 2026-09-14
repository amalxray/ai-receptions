'use client';

import Link from 'next/link';
import { BlurFade } from '@/components/ui/blur-fade';
import { DoctorCard, type PartnerClinic } from './DoctorCard';

export default function ClinicsSection({ clinics }: { clinics: PartnerClinic[] }) {
  if (!clinics?.length) return null;
  return (
    <section className="py-20">
      <div className="mx-auto max-w-5xl px-4">
        <BlurFade inView>
          <h2 className="text-center text-3xl md:text-4xl font-black text-white mb-3">🏥 العيادات والمراكز الشريكة</h2>
          <p className="mb-12 text-center text-slate-400">أكثر من {clinics.length} عيادة ومركز جاهزة لاستقبالك</p>
        </BlurFade>
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
          {clinics.slice(0, 6).map((c, i) => (
            <BlurFade key={c.id} delay={i * 0.1} inView>
              <DoctorCard clinic={c} />
            </BlurFade>
          ))}
        </div>
        <p className="mt-10 text-center text-sm">
          <Link href="/discover" className="text-cyan-400 hover:text-cyan-300">تصفح كل العيادات ←</Link>
        </p>
      </div>
    </section>
  );
}
