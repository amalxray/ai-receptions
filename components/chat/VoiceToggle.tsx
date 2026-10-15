'use client';

type Props = {
  enabled: boolean;
  isSpeaking?: boolean;
  supported: boolean;
  onToggle: () => void;
};

/**
 * مفتاح قراءة الردود بصوت (TTS) — افتراضي OFF (التفضيل محفوظ في
 * localStorage عبر useTtsPreference)، aria-pressed لحالة الصوت.
 */
export default function VoiceToggle({ enabled, isSpeaking = false, supported, onToggle }: Props) {
  const label = !supported
    ? 'القراءة الصوتية غير مدعومة في هذا المتصفح'
    : enabled
      ? 'إيقاف الصوت'
      : 'تشغيل الصوت';

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={!supported}
      aria-label={label}
      aria-pressed={enabled}
      title={supported ? label : 'المتصفح لا يدعم القراءة الصوتية. استخدم Chrome أو Edge.'}
      className={`shrink-0 rounded-full border px-3.5 py-2 text-xs font-bold transition focus:outline-none focus-visible:ring-4 focus-visible:ring-teal-500/40 disabled:cursor-not-allowed disabled:opacity-50 ${
        enabled
          ? 'border-teal-400 bg-teal-600 text-white hover:bg-teal-500'
          : 'border-slate-200 bg-white text-slate-600 hover:border-teal-300 hover:text-teal-700'
      }`}
    >
      <span aria-hidden="true">{enabled ? '🔊' : '🔇'}</span>
      <span className="mr-1.5">{enabled ? 'الصوت مفعّل' : 'الصوت'}</span>
      {enabled && isSpeaking && (
        <span role="status" className="sr-only">
          جارٍ قراءة الرد
        </span>
      )}
    </button>
  );
}