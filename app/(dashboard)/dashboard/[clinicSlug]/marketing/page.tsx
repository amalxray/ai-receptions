'use client';

import { useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import DashboardSection from '@/components/dashboard/DashboardSection';
import { useClinicContext } from '@/lib/useClinicContext';

type MarketingAction = 'linkedin' | 'sales_email' | 'blog_article';

const TABS: Array<{ action: MarketingAction; label: string }> = [
  { action: 'linkedin', label: 'بوست لينكدإن' },
  { action: 'sales_email', label: 'إيميل مبيعات' },
  { action: 'blog_article', label: 'مقال مدونة' },
];

function errorMessage(status: number, code?: string): string {
  if (status === 401) return 'انتهت جلسة الدخول. سجّل الدخول مجددًا.';
  if (status === 403) return 'ليس لديك صلاحية استخدام أدوات التسويق لهذه العيادة.';
  if (code === 'MARKETING_GENERATION_FAILED') return 'تعذّر توليد المحتوى الآن. حاول مرة أخرى لاحقًا.';
  if (status === 400) return 'تحقّق من الحقول المطلوبة ثم أعد المحاولة.';
  return 'حدث خطأ أثناء توليد المحتوى. حاول مرة أخرى.';
}

function Field({
  id,
  label,
  value,
  onChange,
  multiline = false,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  placeholder?: string;
}) {
  const className = 'mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none focus:border-cyan-500';
  const commonProps = {
    id,
    required: true,
    maxLength: 1000,
    value,
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(event.target.value),
    placeholder,
    className,
  };

  return (
    <div>
      <label htmlFor={id} className="block text-sm text-slate-300">{label}</label>
      {multiline
        ? <textarea {...commonProps} rows={4} />
        : <input {...commonProps} />}
    </div>
  );
}

export default function MarketingAgentPage() {
  const { clinicId, authHeaders, loading: clinicLoading, error: clinicError } = useClinicContext();
  const [activeTab, setActiveTab] = useState<MarketingAction>('linkedin');
  const [topic, setTopic] = useState('');
  const [audience, setAudience] = useState('أطباء الأسنان');
  const [clinicName, setClinicName] = useState('');
  const [doctorName, setDoctorName] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');

  function selectTab(action: MarketingAction) {
    setActiveTab(action);
    setResult('');
    setError('');
  }

  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!clinicId || loading) return;

    const fields = activeTab === 'linkedin'
      ? { topic, audience }
      : activeTab === 'sales_email'
        ? { clinicName, doctorName, note }
        : { topic };

    setLoading(true);
    setResult('');
    setError('');

    try {
      const headers = await authHeaders();
      const response = await fetch('/api/agents/marketing', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify({ action: activeTab, clinic_id: clinicId, ...fields }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(errorMessage(response.status, payload?.error));
      }
      if (typeof payload?.data?.content !== 'string' || !payload.data.content.trim()) {
        throw new Error('لم يُرجع المساعد محتوى صالحًا. حاول مرة أخرى.');
      }
      setResult(payload.data.content);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'تعذّر توليد المحتوى.');
    } finally {
      setLoading(false);
    }
  }

  let fields: ReactNode;
  if (activeTab === 'linkedin') {
    fields = (
      <>
        <Field
          id="marketing-topic"
          label="موضوع المنشور"
          value={topic}
          onChange={setTopic}
          placeholder="مثال: كيف تحسّن العيادة تجربة المرضى؟"
        />
        <Field
          id="marketing-audience"
          label="الجمهور المستهدف"
          value={audience}
          onChange={setAudience}
        />
      </>
    );
  } else if (activeTab === 'sales_email') {
    fields = (
      <>
        <Field id="marketing-clinic" label="اسم العيادة" value={clinicName} onChange={setClinicName} />
        <Field id="marketing-doctor" label="اسم الطبيب" value={doctorName} onChange={setDoctorName} />
        <Field
          id="marketing-note"
          label="ملاحظة أو سياق المتابعة"
          value={note}
          onChange={setNote}
          multiline
        />
      </>
    );
  } else {
    fields = (
      <Field
        id="marketing-article-topic"
        label="موضوع المقال"
        value={topic}
        onChange={setTopic}
        placeholder="مثال: تحسين تجربة المريض في عيادات الأسنان"
      />
    );
  }

  return (
    <div dir="rtl" className="space-y-6">
      <DashboardSection
        title="خبير التسويق والمحتوى"
        subtitle="أنشئ مسودات تسويقية عربية بمساعدة موظف Dentairec الرقمي."
      >
        {clinicLoading ? (
          <p className="text-sm text-slate-400">جارٍ تحميل بيانات العيادة...</p>
        ) : clinicError ? (
          <p role="alert" className="text-sm text-rose-300">{clinicError}</p>
        ) : !clinicId ? (
          <p role="alert" className="text-sm text-amber-200">تعذّر تحديد العيادة الحالية.</p>
        ) : (
          <>
            <div role="tablist" aria-label="نوع المحتوى" className="mb-5 flex flex-wrap gap-2">
              {TABS.map((tab) => (
                <button
                  key={tab.action}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab.action}
                  onClick={() => selectTab(tab.action)}
                  className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                    activeTab === tab.action
                      ? 'border-cyan-400 bg-cyan-400/15 text-cyan-200'
                      : 'border-slate-700 text-slate-300 hover:border-slate-500'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <form onSubmit={(event) => void generate(event)} className="max-w-2xl space-y-4">
              {fields}
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-cyan-400 px-4 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:min-w-48"
              >
                {loading ? 'جارٍ التوليد...' : 'توليد'}
              </button>
            </form>
          </>
        )}
      </DashboardSection>

      {error && (
        <p role="alert" className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-200">
          {error}
        </p>
      )}

      {result && (
        <DashboardSection title="المحتوى المُولّد" subtitle="راجع المسودة قبل استخدامها أو مشاركتها.">
          <textarea
            aria-label="المحتوى المُولّد"
            readOnly
            rows={14}
            value={result}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-right leading-8 text-slate-100"
          />
        </DashboardSection>
      )}
    </div>
  );
}
