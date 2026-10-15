'use client';

type Props = {
  isListening: boolean;
  hasNewTranscript?: boolean;
  supported: boolean;
  onToggle: () => void;
  disabled?: boolean;
};

const FALLBACK_TITLE =
  'المتصفح لا يدعم الإدخال الصوتي. استخدم Chrome أو Edge للحصول على الميزة.';

/**
 * زر الميكروفون — aria-label مفصّل يتبدل مع الحالة، نبض بصري أثناء
 * التسجيل، ووميض عند وصول نص جديد (visual cue بديل الإرسال التلقائي).
 */
export default function VoiceButton({
  isListening,
  hasNewTranscript = false,
  supported,
  onToggle,
  disabled = false,
}: Props) {
  const label = !supported
    ? 'التسجيل الصوتي غير مدعوم في هذا المتصفح'
    : isListening
      ? 'إيقاف التسجيل الصوتي'
      : 'ابدأ التسجيل الصوتي';

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={!supported || disabled}
      aria-label={label}
      aria-pressed={isListening}
      title={supported ? label : FALLBACK_TITLE}
      className={`relative shrink-0 rounded-2xl px-4 py-3 text-sm font-bold shadow-lg transition focus:outline-none focus-visible:ring-4 focus-visible:ring-teal-500/40 disabled:cursor-not-allowed disabled:opacity-50 ${
        isListening
          ? 'bg-red-600 text-white shadow-red-700/25 hover:bg-red-500'
          : 'bg-slate-100 text-slate-700 hover:bg-teal-50 hover:text-teal-800'
      } ${hasNewTranscript && !isListening ? 'ring-2 ring-teal-500 animate-pulse' : ''}`}
    >
      <span aria-hidden="true" className="relative flex h-5 w-5 items-center justify-center text-base leading-none">
        🎤
        {isListening && (
          <span className="absolute -inset-1.5 -z-10 animate-ping rounded-full bg-red-400/40" aria-hidden="true" />
        )}
      </span>
      {isListening && (
        <span role="status" className="sr-only">
          جارٍ التسجيل... تحدث الآن
        </span>
      )}
    </button>
  );
}