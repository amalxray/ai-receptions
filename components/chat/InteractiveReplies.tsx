'use client';

/**
 * INTERACTIVE REPLIES — quick-reply chips + inline option cards for the
 * reception chat. Pure presentational: every option list is derived from
 * server-authoritative state (pending booking context), never invented
 * client-side, so tapping a chip always sends a real value the backend
 * already understands (service id, time, "yes", …).
 *
 * RTL-first, mobile responsive, keyboard accessible.
 */

export type QuickReply = { label: string; value: string };

export type OptionCard = {
  id: string;
  title: string;
  subtitle?: string;
  meta?: string;
  icon?: string;
  value: string;
  /** غير متاح (محجوز): يُعرض باهتاً بلا تفاعل — قيمة خادمية حصراً. */
  disabled?: boolean;
};

/** A chip row — short answers: نعم / لا / وقت محدد / خدمة. */
export function QuickReplyChips({
  replies,
  onSelect,
  disabled,
}: {
  replies: QuickReply[];
  onSelect: (value: string) => void;
  disabled?: boolean;
}) {
  if (replies.length === 0) return null;
  return (
    <div dir="rtl" className="mt-2 flex flex-wrap gap-2">
      {replies.map((r) => (
        <button
          key={`${r.value}-${r.label}`}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(r.value)}
          className="rounded-full border border-cyan-400/40 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-100 transition hover:-translate-y-0.5 hover:border-cyan-300 hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}

/** Grid of richer choices (services / providers / days / times). */
export function OptionCards({
  options,
  onSelect,
  disabled,
  columns = 2,
}: {
  options: OptionCard[];
  onSelect: (value: string) => void;
  disabled?: boolean;
  columns?: 1 | 2 | 3;
}) {
  if (options.length === 0) return null;
  const grid =
    columns === 1 ? 'grid-cols-1' : columns === 3 ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2';
  return (
    <div dir="rtl" className={`mt-3 grid gap-2 ${grid}`}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          disabled={disabled || o.disabled}
          onClick={() => onSelect(o.value)}
          className="flex items-start gap-3 rounded-2xl border border-slate-700 bg-slate-900/60 p-3 text-right transition hover:-translate-y-0.5 hover:border-cyan-400/60 hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {o.icon && <span aria-hidden className="text-2xl leading-none">{o.icon}</span>}
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-white">{o.title}</span>
            {o.subtitle && <span className="mt-0.5 block text-xs text-slate-300">{o.subtitle}</span>}
            {o.meta && <span className="mt-1 block text-xs font-semibold text-cyan-300">{o.meta}</span>}
          </span>
        </button>
      ))}
    </div>
  );
}

/** Booking progress — shown only while a booking is in flight. */
export type BookingProgressStep = { label: string; done: boolean };

export function BookingProgress({ steps }: { steps: BookingProgressStep[] }) {
  if (steps.length === 0) return null;
  return (
    <div dir="rtl" className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-slate-800 px-4 py-2 text-xs">
      {steps.map((s, i) => (
        <span key={s.label} className="flex items-center gap-2">
          {i > 0 && <span aria-hidden className="text-slate-600">›</span>}
          <span className={s.done ? 'font-bold text-cyan-300' : 'text-slate-400'}>
            {s.done ? '✓ ' : ''}
            {s.label}
          </span>
        </span>
      ))}
    </div>
  );
}

/**
 * SuggestedQuestions — activity-aware starter prompts.
 * Kept client-side constant table keyed by activity type: these are only
 * suggestions the patient may ignore, never authoritative data.
 */
const SUGGESTED: Record<string, string[]> = {
  clinic: ['ألم في الأسنان', 'فحص دوري', 'تنظيف الأسنان', 'تقويم', 'حالة طارئة'],
  imaging_center: ['تصوير بانوراما', 'تصوير CBCT', 'تصوير مقطعي', 'كم تستغرق الصورة؟', 'مواعيد العمل'],
  dental_lab: ['تركيبة أسنان', 'تاج أو جسر', 'طقم أسنان', 'مدة التسليم'],
};

export function suggestedQuestionsFor(activityType: string | undefined): string[] {
  return SUGGESTED[activityType ?? 'clinic'] ?? SUGGESTED.clinic;
}

export function SuggestedQuestions({
  activityType,
  onSelect,
  disabled,
}: {
  activityType?: string;
  onSelect: (value: string) => void;
  disabled?: boolean;
}) {
  const questions = suggestedQuestionsFor(activityType);
  return (
    <div dir="rtl" className="flex flex-wrap gap-2">
      {questions.map((q) => (
        <button
          key={q}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(q)}
          className="rounded-full border border-slate-600/70 bg-slate-800/60 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-cyan-400/60 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {q}
        </button>
      ))}
    </div>
  );
}