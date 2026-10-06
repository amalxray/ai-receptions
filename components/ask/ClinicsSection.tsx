'use client';

import Link from 'next/link';
import { useState } from 'react';
import { BlurFade } from '@/components/ui/blur-fade';
import { displayAskClinicName } from '@/lib/services/askClinicPresentation';
import { DoctorCard, type PartnerClinic } from './DoctorCard';

export default function ClinicsSection({ clinics }: { clinics: PartnerClinic[] }) {
  const [selectedClinicId, setSelectedClinicId] = useState('');
  if (!clinics?.length) return null;
  const selectedClinic = clinics.find((clinic) => clinic.id === selectedClinicId) ?? null;
  return (
    <section className="py-20">
      <div className="mx-auto max-w-5xl px-4">
        <BlurFade inView>
          <h2 className="mb-3 text-center text-3xl font-black text-slate-900 md:text-4xl">🏥 اختر عيادتك أو مركزك الشريك</h2>
          <p className="mb-8 text-center text-slate-600">اختر المنشأة المناسبة للانتقال إلى صفحتها وبدء الحجز مباشرة.</p>
        </BlurFade>
        <div className="mx-auto mb-10 grid max-w-2xl gap-3 rounded-3xl border border-blue-100 bg-white p-4 shadow-sm sm:grid-cols-[1fr_auto] sm:p-5">
          <label className="block">
            <span className="mb-1.5 block text-sm font-bold text-slate-700">توجيه الحجز إلى المنشأة</span>
            <select
              value={selectedClinicId}
              onChange={(event) => setSelectedClinicId(event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10"
            >
              <option value="">اختر عيادة أو مركزاً…</option>
              {clinics.map((clinic) => (
                <option key={clinic.id} value={clinic.id}>
                  {displayAskClinicName(clinic.name, clinic.activity_type)}{clinic.city ? ` — ${clinic.city}` : ''}
                </option>
              ))}
            </select>
          </label>
          <Link
            href={selectedClinic?.booking_url ?? '#'}
            aria-disabled={!selectedClinic}
            onClick={(event) => { if (!selectedClinic) event.preventDefault(); }}
            className={`inline-flex items-center justify-center self-end rounded-xl px-6 py-3 text-sm font-bold text-white transition ${selectedClinic ? 'bg-blue-600 hover:bg-blue-700' : 'cursor-not-allowed bg-slate-300'}`}
          >
            الانتقال للحجز ←
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
          {clinics.slice(0, 6).map((c, i) => (
            <BlurFade key={c.id} delay={i * 0.1} inView>
              <DoctorCard clinic={c} />
            </BlurFade>
          ))}
        </div>
        <p className="mt-10 text-center text-sm">
          <Link href="/discover" className="font-semibold text-blue-700 hover:text-blue-800">اعثر على العيادة المناسبة ←</Link>
        </p>
      </div>
    </section>
  );
}
