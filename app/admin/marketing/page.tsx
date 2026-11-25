'use client';

import { useState, type FormEvent } from 'react';
import { Check, Copy, Download, ExternalLink, Loader2, Mail, Sparkles } from 'lucide-react';

type MarketingType = 'email' | 'linkedin' | 'blog';

type MarketingResponse = {
  data?: { content?: unknown };
  error?: unknown;
};

const TABS: Array<{ type: MarketingType; label: string }> = [
  { type: 'email', label: 'إيميل مبيعات' },
  { type: 'linkedin', label: 'بوست LinkedIn' },
  { type: 'blog', label: 'مقال مدونة' },
];

const inputClassName =
  'w-full rounded-xl border border-slate-700 bg-slate-950/70 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-amber-400';

export default function PlatformMarketingPage() {
  const [activeTab, setActiveTab] = useState<MarketingType>('email');
  const [clinicName, setClinicName] = useState('');
  const [doctorName, setDoctorName] = useState('');
  const [note, setNote] = useState('');
  const [topic, setTopic] = useState('');
  const [audience, setAudience] = useState('clinics');
  const [blogTitle, setBlogTitle] = useState('');
  const [keywords, setKeywords] = useState('');
  const [blogLength, setBlogLength] = useState('500');
  const [result, setResult] = useState('');
  const [resultType, setResultType] = useState<MarketingType>('email');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  function selectTab(type: MarketingType) {
    setActiveTab(type);
    setError('');
    setResult('');
    setCopied(false);
  }

  async function handleGenerate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');
    setResult('');
    setCopied(false);

    const body = activeTab === 'email'
      ? { type: activeTab, clinicName, doctorName, note }
      : activeTab === 'linkedin'
        ? { type: activeTab, topic, audience }
        : { type: activeTab, title: blogTitle, keywords, wordCount: Number(blogLength) };

    try {
      const response = await fetch('/api/admin/marketing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload: MarketingResponse = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof payload.error === 'string' ? payload.error : 'تعذّر توليد المحتوى.',
        );
      }
      if (typeof payload.data?.content !== 'string' || !payload.data.content.trim()) {
        throw new Error('لم يُرجع المولد محتوى صالحاً.');
      }

      setResult(payload.data.content);
      setResultType(activeTab);
    } catch (generationError) {
      setError(
        generationError instanceof Error
          ? generationError.message
          : 'حدث خطأ غير متوقع أثناء توليد المحتوى.',
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
      setError('تعذّر نسخ المحتوى. تحقق من صلاحية الحافظة في المتصفح.');
    }
  }

  function handleDownload() {
    const blob = new Blob([result], { type: 'text/markdown;charset=utf-8' });
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    link.download = `${blogTitle.trim() || 'dentairec-article'}.md`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(href);
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
              أنشئ مسودات تسويقية مخصصة للتواصل مع العيادات والتعريف بـ Dentairec.
            </p>
          </div>
        </div>

        <div role="tablist" aria-label="نوع المحتوى" className="mb-6 flex flex-wrap gap-2">
          {TABS.map((tab) => (
            <button
              key={tab.type}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.type}
              onClick={() => selectTab(tab.type)}
              className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                activeTab === tab.type
                  ? 'border-amber-400 bg-amber-400/15 text-amber-200'
                  : 'border-slate-700 text-slate-300 hover:border-slate-500'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleGenerate} className="space-y-4">
          {activeTab === 'email' ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-2 text-sm text-slate-300">
                  <span>اسم العيادة</span>
                  <input
                    required
                    maxLength={1000}
                    value={clinicName}
                    onChange={(event) => setClinicName(event.target.value)}
                    className={inputClassName}
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
                    className={inputClassName}
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
                  className={`${inputClassName} resize-y`}
                  placeholder="مثال: يرغب الفريق في تحسين سرعة الرد على المكالمات."
                />
              </label>
            </>
          ) : activeTab === 'linkedin' ? (
            <>
              <label className="block space-y-2 text-sm text-slate-300">
                <span>موضوع المنشور</span>
                <input
                  required
                  maxLength={1000}
                  value={topic}
                  onChange={(event) => setTopic(event.target.value)}
                  className={inputClassName}
                  placeholder="مثال: كيف تحسّن العيادة تجربة المرضى؟"
                />
              </label>
              <label className="block space-y-2 text-sm text-slate-300">
                <span>الجمهور المستهدف</span>
                <select
                  value={audience}
                  onChange={(event) => setAudience(event.target.value)}
                  className={inputClassName}
                >
                  <option value="clinics">العيادات</option>
                  <option value="patients">المرضى</option>
                  <option value="general">جمهور عام</option>
                </select>
              </label>
            </>
          ) : (
            <>
              <label className="block space-y-2 text-sm text-slate-300">
                <span>عنوان المقال</span>
                <input
                  required
                  maxLength={1000}
                  value={blogTitle}
                  onChange={(event) => setBlogTitle(event.target.value)}
                  className={inputClassName}
                  placeholder="مثال: تحسين تجربة المريض في عيادات الأسنان"
                />
              </label>
              <label className="block space-y-2 text-sm text-slate-300">
                <span>الكلمات المفتاحية</span>
                <input
                  required
                  maxLength={1000}
                  value={keywords}
                  onChange={(event) => setKeywords(event.target.value)}
                  className={inputClassName}
                  placeholder="مثال: عيادة الأسنان، تجربة المريض، الحجز"
                />
              </label>
              <label className="block space-y-2 text-sm text-slate-300">
                <span>الطول المستهدف</span>
                <select
                  value={blogLength}
                  onChange={(event) => setBlogLength(event.target.value)}
                  className={inputClassName}
                >
                  <option value="500">500 كلمة</option>
                  <option value="1000">1000 كلمة</option>
                  <option value="1500">1500 كلمة</option>
                </select>
              </label>
            </>
          )}

          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl bg-amber-400 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
            {loading ? 'جارٍ التوليد…' : `توليد ${TABS.find((tab) => tab.type === activeTab)?.label}`}
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
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-bold text-white">
              {resultType === 'email' ? 'إيميل المبيعات' : resultType === 'linkedin' ? 'بوست LinkedIn' : 'مقال المدونة'}
            </h3>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-slate-700 px-3 py-2 text-sm text-slate-200 transition hover:border-amber-400/60 hover:text-white"
              >
                {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                {copied ? 'تم النسخ' : 'نسخ'}
              </button>
              {resultType === 'linkedin' && (
                <button
                  type="button"
                  onClick={() => window.open('https://www.linkedin.com/feed/', '_blank', 'noopener,noreferrer')}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-3 py-2 text-sm text-slate-200 transition hover:border-amber-400/60 hover:text-white"
                >
                  <ExternalLink className="h-4 w-4" />
                  فتح LinkedIn
                </button>
              )}
              {resultType === 'blog' && (
                <button
                  type="button"
                  onClick={handleDownload}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-3 py-2 text-sm text-slate-200 transition hover:border-amber-400/60 hover:text-white"
                >
                  <Download className="h-4 w-4" />
                  تنزيل .md
                </button>
              )}
            </div>
          </div>
          <pre className="whitespace-pre-wrap break-words rounded-2xl border border-slate-800 bg-slate-950/70 p-5 font-sans text-sm leading-7 text-slate-200">
            {result}
          </pre>
        </section>
      )}
    </div>
  );
}
