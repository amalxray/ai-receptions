'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

type Props = {
  isListening: boolean;
  hasNewTranscript?: boolean;
  supported: boolean;
  onToggle: () => void;
  disabled?: boolean;
  /** اختياري — نقاط متحركة أثناء معالجة الرسالة (لا يمرّره V2 بعد). */
  isProcessing?: boolean;
};

const FALLBACK_TITLE =
  'المتصفح لا يدعم الإدخال الصوتي. استخدم Chrome أو Edge للحصول على الميزة.';
const IOS_TOAST =
  'الإدخال الصوتي غير مدعوم على iPhone. يرجى الكتابة أو استخدام Android.';

/** iOS Safari لا يدعم Web Speech API — يُكتشف بعد mount فقط (لا window في SSR). */
function detectIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

/** أيقونة ميكروفون SVG — أوضح من الإيموجي وقابلة للتلوين. */
function MicIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3z" />
      <path d="M19 11a7 7 0 0 1-14 0" />
      <line x1="12" y1="18" x2="12" y2="21" />
    </svg>
  );
}

/**
 * زر الميكروفون — SVG محسّن + framer-motion (hover 1.05 / tap 0.95)،
 * نبض أحمر أثناء التسجيل، ووميض عند وصول نص جديد. على iOS يبقى ظاهراً
 * (باهت + شارة) ويعرض رسالة واضحة عند الضغط بدل تعطيل قبيح.
 */
export default function VoiceButton({
  isListening,
  hasNewTranscript = false,
  supported,
  onToggle,
  disabled = false,
  isProcessing = false,
}: Props) {
  const reduceMotion = useReducedMotion();
  const [isIOS, setIsIOS] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setIsIOS(detectIOS());
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  // iOS: زر ظاهر قابل للضغط → رسالة واضحة عند اللمس (لا تعطيل قبيح).
  const unavailableOnIOS = isIOS && !supported;
  const trulyDisabled = disabled || (!supported && !unavailableOnIOS);

  const label = unavailableOnIOS
    ? 'الإدخال الصوتي غير متاح على iPhone'
    : !supported
      ? 'التسجيل الصوتي غير مدعوم في هذا المتصفح'
      : isListening
        ? 'إيقاف التسجيل الصوتي'
        : 'ابدأ التسجيل الصوتي';

  function handleClick() {
    if (trulyDisabled) return;
    if (unavailableOnIOS) {
      setShowToast(true);
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setShowToast(false), 4000);
      return;
    }
    onToggle();
  }

  return (
    <>
      <motion.button
        type="button"
        onClick={handleClick}
        disabled={trulyDisabled}
        aria-label={label}
        aria-pressed={isListening}
        title={unavailableOnIOS ? IOS_TOAST : supported ? label : FALLBACK_TITLE}
        whileHover={reduceMotion || trulyDisabled ? undefined : { scale: 1.05 }}
        whileTap={reduceMotion || trulyDisabled ? undefined : { scale: 0.95 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className={`voice-mic relative shrink-0 rounded-2xl px-4 py-3 shadow-lg transition-colors duration-300 focus:outline-none focus-visible:ring-4 focus-visible:ring-teal-500/40 disabled:cursor-not-allowed disabled:opacity-50 ${
          isListening
            ? 'bg-gradient-to-br from-red-600 to-rose-500 text-white shadow-red-700/30'
            : unavailableOnIOS
              ? 'bg-gradient-to-br from-slate-100 to-slate-200 text-slate-400 opacity-70'
              : 'bg-gradient-to-br from-slate-100 to-slate-200 text-slate-600 hover:from-teal-50 hover:to-cyan-100 hover:text-teal-700 hover:shadow-teal-500/30'
        } ${hasNewTranscript && !isListening ? 'animate-pulse ring-2 ring-teal-500' : ''}`}
      >
        <span aria-hidden="true" className="relative flex h-5 w-5 items-center justify-center">
          <MicIcon className="h-5 w-5" />
          {isListening && (
            <span className="absolute -inset-1.5 -z-10 animate-ping rounded-full bg-red-400/40" aria-hidden="true" />
          )}
        </span>
        {isProcessing && (
          <span aria-hidden="true" className="mr-1.5 flex items-center gap-0.5">
            <span className="h-1 w-1 animate-bounce rounded-full bg-current [animation-delay:0ms]" />
            <span className="h-1 w-1 animate-bounce rounded-full bg-current [animation-delay:120ms]" />
            <span className="h-1 w-1 animate-bounce rounded-full bg-current [animation-delay:240ms]" />
          </span>
        )}
        {unavailableOnIOS && (
          <span
            aria-hidden="true"
            className="absolute -top-1.5 -left-1.5 rounded-full bg-slate-500 px-1.5 py-0.5 text-[9px] font-bold text-white"
          >
            غير متاح
          </span>
        )}
        {isListening && (
          <span role="status" className="sr-only">
            جارٍ التسجيل... تحدث الآن
          </span>
        )}
      </motion.button>
      {showToast && (
        <span
          role="status"
          className="pointer-events-none fixed bottom-24 left-1/2 z-50 w-64 -translate-x-1/2 rounded-2xl bg-slate-900 px-4 py-3 text-center text-xs font-semibold text-white shadow-2xl"
        >
          {IOS_TOAST}
        </span>
      )}
    </>
  );
}