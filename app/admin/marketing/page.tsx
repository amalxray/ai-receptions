'use client';

import { useState, type FormEvent } from 'react';
import { Check, Copy, Loader2, Mail, Sparkles } from 'lucide-react';

type MarketingResponse = {
  data?: { content?: unknown };
  error?: unknown;
};

export default function PlatformMarketingPage() {
  const [clinicName, setClinicName] = useState('');
  const [doctorName, setDoctorName] = useState('');
  const [note, setNote] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  async function handleGenerate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');
    setResult('');
    setCopied(false);

    try {
      const response = await fetch('/api/admin/marketing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinicName, doctorName, note }),
      });
      const payload: MarketingResponse = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof payload.error === 'string' ? payload.error : 'تعذّر توليد رسالة المبيعات.',
        );
      }
      if (typeof payload.data?.content !== 'string' || !payload.data.content.trim()) {
        throw new Error('لم يُرجع المولد محتوى صالحاً.');
      }

      setResult(payload.data.content);
    } catch (generationError) {
      setError(
        generationError instanceof Error
          ? generationError.message
          : 'حدث خطأ غير متوقع أثناء توليد الرسالة.',
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(result);
      setCopied(true);
    } catch {
      setError('تعذّر نسخ الرسالة. تحقق من صلاحية الحافظة في المتصفح.');
    }
  }

  return (
    <div dir="rtl" className="space-y-6">
      <section className="rounded-[2rem] border border-amber-500/20 bg-slate-900/60 p-6 shadow-xl shadow-amber-950/10 sm:p-8">
        <div className="mb-6 flex items-start gap-4">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-amber-500/10 text-amber-300">
            <Sparkles className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">تسويق المنصة</h2>
            <p className="mt-1 text-sm leading-6 text-slate-400">
              أنشئ رسالة مبيعات مخصصة للتواصل مع العيادات المهتمة بـ Dentairec.
            </p>
          </div>
        </div>

        <form onSubmit={handleGenerate} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2 text-sm text-slate-300">
              <span>اسم العيادة</span>
              <input
                required
                maxLength={1000}
                value={clinicName}
                onChange={(event) => setClinicName(event.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-amber-400"
                placeholder="مثال: عيادة الابتسامة"
              />
            </label>
            <label className="space-y-2 text-sm text-slate-300">
              <span>اسم الطبيب</span>
              <input
                required
                maxLength={1000}
                value={doctorName}
                onChange={(event) => setDoctorName(event.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-amber-400"
                placeholder="مثال: د. أحمد"
              />
            </label>
          </div>

          <label className="block space-y-2 text-sm text-slate-300">
            <span>ملاحظة للتخصيص</span>
            <textarea
              required
              maxLength={1000}
              rows={4}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className="w-full resize-y rounded-xl border border-slate-700 bg-slate-950/70 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-amber-400"
              placeholder="مثال: تقييمهم على Google هو 4.2 وهناك شكاوى من عدم الرد على المكالمات."
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl bg-amber-400 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
            {loading ? 'جارٍ التوليد…' : 'توليد إيميل مبيعات'}
          </button>
        </form>
      </section>

      {error && (
        <div role="alert" className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
          {error}
        </div>
      )}

      {result && (
        <section className="rounded-[2rem] border border-slate-800 bg-slate-900/60 p-6 sm:p-8">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="font-bold text-white">الرسالة المقترحة</h3>
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-slate-700 px-3 py-2 text-sm text-slate-200 transition hover:border-amber-400/60 hover:text-white"
            >
              {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
              {copied ? 'تم النسخ' : 'نسخ'}
            </button>
          </div>
          <pre className="whitespace-pre-wrap break-words rounded-2xl border border-slate-800 bg-slate-950/70 p-5 font-sans text-sm leading-7 text-slate-200">
            {result}
          </pre>
        </section>
      )}
    </div>
  );
}
