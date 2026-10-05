'use client';

import { motion } from 'framer-motion';

export type ChatPersonaKind = 'receptionist' | 'patient';

/**
 * Avatar placeholder for the two-persona chat. The receptionist portrait can
 * be replaced later by passing imageSrc, without changing the conversation UI.
 */
export function ChatPersonaAvatar({
  persona,
  active = false,
  imageSrc,
  size = 'large',
}: {
  persona: ChatPersonaKind;
  active?: boolean;
  imageSrc?: string;
  size?: 'large' | 'small';
}) {
  const receptionist = persona === 'receptionist';
  const dimensions = size === 'large' ? 'h-[5.5rem] w-[5.5rem] sm:h-28 sm:w-28' : 'h-11 w-11';

  return (
    <motion.div
      role="img"
      aria-label={receptionist ? 'صورة موظفة الاستقبال — صورة مؤقتة' : 'صورة المريض الرمزية'}
      className={`relative shrink-0 rounded-full p-[3px] transition-shadow duration-300 ${
        active
          ? 'bg-gradient-to-br from-teal-300 via-cyan-400 to-sky-500 shadow-[0_0_28px_rgba(34,211,238,0.42)]'
          : 'bg-slate-200'
      } ${dimensions}`}
      animate={active ? { scale: [1, 1.035, 1] } : { scale: 1 }}
      transition={active ? { duration: 2.2, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.2 }}
    >
      <span
        className={`grid h-full w-full place-items-center overflow-hidden rounded-full ${
          receptionist ? 'bg-gradient-to-br from-cyan-50 via-teal-100 to-violet-100' : 'bg-gradient-to-br from-slate-100 to-slate-200'
        }`}
      >
        {imageSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageSrc} alt="موظفة الاستقبال" className="h-full w-full object-cover" />
        ) : receptionist ? (
          <svg viewBox="0 0 96 96" className="h-[74%] w-[74%] text-teal-700" fill="none" aria-hidden="true">
            <circle cx="48" cy="35" r="17" fill="currentColor" opacity=".78" />
            <path d="M17 88c2-20 14-31 31-31s29 11 31 31" fill="currentColor" opacity=".66" />
            <path d="M31 23c2-12 10-18 20-16 8 1 13 7 15 16-5-4-11-6-17-6-7 0-13 2-18 6Z" fill="#475569" opacity=".72" />
            <path d="M41 43c2 2 4 3 7 3s5-1 7-3" stroke="#fff" strokeLinecap="round" strokeWidth="2" opacity=".8" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="h-6 w-6 text-slate-500" fill="none" aria-hidden="true">
            <circle cx="12" cy="8" r="3.4" fill="currentColor" opacity=".85" />
            <path d="M5.5 20c.4-3.6 2.8-5.7 6.5-5.7s6.1 2.1 6.5 5.7" fill="currentColor" opacity=".65" />
          </svg>
        )}
      </span>
      <span
        aria-hidden="true"
        className={`absolute bottom-1 right-1 h-3 w-3 rounded-full border-2 border-white ${active ? 'bg-teal-500' : 'bg-slate-300'}`}
      />
    </motion.div>
  );
}

export function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1" aria-label="موظفة الاستقبال تكتب">
      {[0, 1, 2].map((dot) => (
        <span
          key={dot}
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-teal-500"
          style={{ animationDelay: `${dot * 140}ms` }}
        />
      ))}
      <span className="sr-only">جارٍ كتابة الرد</span>
    </span>
  );
}