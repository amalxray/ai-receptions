'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { BlurFade } from '@/components/ui/blur-fade';
import { Magnetic } from '@/components/ui/magnetic';
import { ShimmerButton } from '@/components/ui/shimmer-button';

const STEPS = [
  { n: '1', icon: 'CHAT', title: 'المريض يراسل', desc: 'عبر الموقع أو واتساب', color: 'from-cyan-400 to-blue-500' },
  { n: '2', icon: 'AI', title: 'AI يفهم ويرد', desc: 'يفهم المشكلة يسأل يقترح طبيب', color: 'from-purple-400 to-pink-500' },
  { n: '3', icon: 'OK', title: 'الحجز يتم', desc: 'تأكيد فوري في جدولك', color: 'from-emerald-400 to-green-500' },
];

export default function HowItWorksSection() {
  return (
    <section id="how-it-works" className="relative overflow-hidden bg-[#FAFBFC] py-24">
      <div className="relative z-10 mx-auto max-w-6xl px-4">
        <div className="relative mt-20 max-w-xl mx-auto space-y-16">
          {STEPS.map((s, i) => (
            <div key={s.n} className="relative">
              <motion.div className="relative rounded-3xl border border-[#E2E8F0] bg-white p-8 text-left shadow-sm transition-all duration-300">
                <h3 className="text-xl font-bold text-slate-900">{s.title}</h3>
                <p className="mt-2 leading-7 text-slate-600">{s.desc}</p>
              </motion.div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
