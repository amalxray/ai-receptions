'use client';

import Link from 'next/link';
import { useClinicContext } from '@/lib/useClinicContext';

export default function AIAnalysisCard() {
  const { clinicSlug } = useClinicContext();
  return (
    <Link
      href={clinicSlug ? `/dashboard/${encodeURIComponent(clinicSlug)}/ai-analysis` : '/dashboard/ai-analysis'}
      className="group flex items-center justify-between rounded-3xl border border-cyan-500/30 bg-gradient-to-r from-cyan-500/15 to-sky-500/10 p-5 text-left transition hover:-translate-y-1 hover:border-cyan-400/60 hover:bg-cyan-500/20"
    >
      <div>
        <p className="text-sm font-semibold text-cyan-200">🩻 المختبر الذكي</p>
        <p className="mt-1 text-xs text-slate-400">تحليل صور طبية مفتوح المصدر</p>
      </div>
      <span className="text-2xl transition group-hover:scale-110">→</span>
    </Link>
  );
}
