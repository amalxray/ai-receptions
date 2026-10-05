'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';
import receptionistAvatar from '../../receptionist-avatar.png';

export type ChatPersonaKind = 'receptionist' | 'patient';

/**
 * Avatar portrait for the two-persona chat. The receptionist image can be
 * replaced later by passing imageSrc, without changing the conversation UI.
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
      aria-label={receptionist ? 'صورة موظفة الاستقبال' : 'صورة المريض الرمزية'}
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
        {receptionist ? (
          <Image
            src={imageSrc ?? receptionistAvatar}
            alt="موظفة الاستقبال"
            width={112}
            height={112}
            sizes={size === 'large' ? '(max-width: 640px) 88px, 112px' : '44px'}
            className="h-full w-full object-cover"
          />
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