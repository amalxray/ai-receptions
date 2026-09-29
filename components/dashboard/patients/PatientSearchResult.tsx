'use client';

import { motion } from 'framer-motion';
import { ChevronLeft, Phone } from 'lucide-react';
import {
  highlightSegments,
  patientInitials,
  patientStatusTone,
  type PatientSearchRecord,
} from '@/lib/services/patientSearch';
import { formatManualAgeAr, readManualAge } from '@/components/dashboard/patients/smartProfile';
import { usePressRipple } from '@/components/dashboard/patients/PatientSearchBar';

/**
 * N28 — one search hit: avatar (initials), name with the matched fragment
 * highlighted, phone, and the status chip. Hover lifts the row and lights its
 * leading edge; pressing it ripples (the hook lives in PatientSearchBar so the
 * interaction has exactly one implementation).
 */

type PatientSearchResultProps = {
  patient: PatientSearchRecord;
  /** The debounced query — drives the name highlight. */
  query: string;
  /** True for the row currently open in the panel underneath. */
  active?: boolean;
  onSelect: (patient: PatientSearchRecord) => void;
};

export default function PatientSearchResult({
  patient,
  query,
  active = false,
  onSelect,
}: PatientSearchResultProps) {
  const tone = patientStatusTone(patient.status);
  const { spawn, layer } = usePressRipple();
  const segments = highlightSegments(patient.name, query);
  const ageLabel = formatManualAgeAr(readManualAge(patient.metadata));

  return (
    <motion.button
      type="button"
      onClick={() => onSelect(patient)}
      onPointerDown={spawn}
      variants={{
        hidden: { opacity: 0, y: 16 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } },
      }}
      whileHover={{ y: -3, scale: 1.005 }}
      whileTap={{ scale: 0.985 }}
      transition={{ type: 'spring', stiffness: 320, damping: 26 }}
      aria-current={active ? 'true' : undefined}
      className={`relative w-full overflow-hidden rounded-[1.5rem] border p-4 text-right transition-colors ${
        active
          ? 'border-cyan-500/60 bg-cyan-500/10 shadow-[0_0_36px_-14px_rgba(34,211,238,0.75)]'
          : 'border-slate-800 bg-slate-950/70 hover:border-cyan-500/50 hover:shadow-[0_0_30px_-16px_rgba(34,211,238,0.6)]'
      }`}
    >
      {layer}

      {/* Leading accent: the status colour, doubled on hover. */}
      <motion.span
        aria-hidden
        className={`absolute inset-y-0 right-0 w-1 ${tone.dot}`}
        animate={{ opacity: active ? 1 : 0.55 }}
        transition={{ duration: 0.2 }}
      />

      <div className="relative flex items-center gap-3">
        <motion.span
          aria-hidden
          className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br ${tone.wash} text-sm font-bold text-slate-950`}
          animate={{ scale: active ? 1.05 : 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        >
          {patientInitials(patient.name)}
        </motion.span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold text-white">
            {segments.map((segment, index) =>
              segment.hit ? (
                <mark
                  key={index}
                  className="rounded-md bg-cyan-400/25 px-1 text-cyan-100 ring-1 ring-cyan-400/30"
                >
                  {segment.text}
                </mark>
              ) : (
                <span key={index}>{segment.text}</span>
              )
            )}
          </p>

          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
            {patient.phone ? (
              <span className="inline-flex items-center gap-1">
                <Phone className="h-3 w-3" />
                <span dir="ltr" className="font-medium text-slate-300">
                  {patient.phone}
                </span>
              </span>
            ) : (
              <span className="text-slate-500">بدون هاتف</span>
            )}
            {ageLabel !== 'غير محدد' ? <span>• 🎂 {ageLabel}</span> : null}
            {patient.source ? <span>• {patient.source}</span> : null}
          </div>
        </div>

        <span
          className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-bold ring-1 ${tone.chip}`}
          title={tone.label}
        >
          {tone.emoji} {tone.label}
        </span>

        <ChevronLeft
          aria-hidden
          className={`h-5 w-5 shrink-0 transition-colors ${
            active ? 'text-cyan-300' : 'text-slate-600'
          }`}
        />
      </div>
    </motion.button>
  );
}