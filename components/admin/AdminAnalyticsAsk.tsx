'use client';

import { FormEvent, useState } from 'react';

export default function AdminAnalyticsAsk() {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submitQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAnswer(null);
    setError(null);
    setSubmitting(true);

    try {
      const response = await fetch('/api/admin/analytics/ask', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(
          body.message
          ?? (body.error === 'ENTITLEMENT_LIMIT_REACHED'
            ? 'وصلت إلى الحد الشهري لتشغيل الوكلاء.'
            : 'تعذّر إنشاء الإجابة. حاول مرة أخرى لاحقاً.'),
        );
        return;
      }
      setAnswer(body.data.answer);
    } catch {
      setError('تعذّر الاتصال بالخدمة. حاول مرة أخرى.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section
      aria-labelledby="admin-analytics-title"
      className="rounded-[2rem] border border-slate-800 bg-slate-900/50 p-5 sm:p-6"
      dir="rtl"
    >
      <h2 id="admin-analytics-title" className="text-lg font-bold text-white">
        اسأل محلل بيانات المنصة
      </h2>
      <p className="mt-2 text-sm leading-6 text-slate-400">
        يجيب اعتماداً على الإحصاءات الحالية فقط. إجمالي المدفوعات غير مفصّل حسب العيادة أو المعاملة؛
        لا تتوفر إيرادات عيادة محددة أو اتجاهات شهرية.
      </p>
      <form className="mt-4 space-y-3" onSubmit={submitQuestion}>
        <label htmlFor="admin-analytics-question" className="sr-only">
          اكتب سؤالك عن إحصاءات المنصة
        </label>
        <textarea
          id="admin-analytics-question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          maxLength={1000}
          required
          rows={3}
          placeholder="مثال: ما توزيع الاشتراكات حسب الحالة؟"
          className="w-full resize-y rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30"
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-slate-500">{question.length}/1000</span>
          <button
            type="submit"
            disabled={submitting || !question.trim()}
            className="rounded-xl bg-amber-400 px-4 py-2 text-sm font-bold text-slate-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'جارٍ التحليل…' : 'اسأل'}
          </button>
        </div>
      </form>
      {error && (
        <p role="alert" className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
          {error}
        </p>
      )}
      {answer && (
        <div aria-live="polite" className="mt-4 rounded-xl border border-slate-700 bg-slate-950/70 p-4">
          <h3 className="text-sm font-semibold text-amber-300">الإجابة</h3>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-200">{answer}</p>
        </div>
      )}
    </section>
  );
}
