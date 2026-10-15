'use client';

import { motion, useReducedMotion } from 'framer-motion';

type Props = {
  enabled: boolean;
  isSpeaking?: boolean;
  supported: boolean;
  onToggle: () => void;
};

/**
 * مفتاح قراءة الردود بصوت (TTS) — افتراضي OFF. ON: أخضر + glow خفيف،
 * OFF: رمادي. framer-motion: hover scale+brightness / tap 0.95 مع احترام
 * prefers-reduced-motion. aria-pressed يحمل الحالة دائماً.
 */
export default function VoiceToggle({ enabled, isSpeaking = false, supported, onToggle }: Props) {
  const reduceMotion = useReducedMotion();
  const label = !supported
    ? 'القراءة الصوتية غير مدعومة في هذا المتصفح'
    : enabled
      ? 'إيقاف الصوت'
      : 'تشغيل الصوت';

  return (
    <motion.button
      type="button"
      onClick={onToggle}
      disabled={!supported}
      aria-label={label}
      aria-pressed={enabled}
      title={supported ? label : 'المتصفح لا يدعم القراءة الصوتية. استخدم Chrome أو Edge.'}
      whileHover={reduceMotion || !supported ? undefined : { scale: 1.05, filter: 'brightness(1.1)' }}
      whileTap={reduceMotion || !supported ? undefined : { scale: 0.95 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className={`voice-toggle shrink-0 rounded-full border px-3.5 py-2 text-xs font-bold transition-colors duration-300 focus:outline-none focus-visible:ring-4 focus-visible:ring-teal-500/40 disabled:cursor-not-allowed disabled:opacity-50 ${
        enabled
          ? 'border-emerald-400 bg-gradient-to-br from-emerald-500 to-green-600 text-white shadow-md shadow-emerald-500/40'
          : 'border-slate-200 bg-gradient-to-br from-slate-100 to-slate-200 text-slate-500 hover:border-teal-300 hover:text-teal-700'
      }`}
    >
      <span aria-hidden="true" className="transition-transform duration-300">
        {enabled ? '🔊' : '🔇'}
      </span>
      <span className="mr-1.5">{enabled ? 'الصوت مفعّل' : 'الصوت'}</span>
      {enabled && isSpeaking && (
        <span role="status" className="sr-only">
          جارٍ قراءة الرد
        </span>
      )}
    </motion.button>
  );
}