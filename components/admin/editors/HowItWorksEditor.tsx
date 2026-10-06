'use client';

import { useState } from 'react';
import { LandingContentProvider } from '@/components/landing/LandingContent';
import { HowItWorks } from '@/components/landing/Sections';
import { landingCopy } from '@/lib/landing/landing-copy';
import SectionEditorModal from './SectionEditorModal';

export type HowItWorksContent = { title: string; steps: Array<{ num: string; title: string; desc: string }> };
type Props = { initialContent: Record<string, unknown> | null; onClose: () => void; onSaved: (content: HowItWorksContent) => void };
const defaults = landingCopy.howItWorks as HowItWorksContent;
const inputClass = 'mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200';

function normalize(content: Record<string, unknown> | null): HowItWorksContent {
  const value = { ...defaults, ...(content ?? {}) } as HowItWorksContent;
  const steps = Array.isArray(value.steps) ? value.steps : defaults.steps;
  return { ...value, steps: steps.map((step) => ({ num: String(step.num ?? ''), title: String(step.title ?? ''), desc: String(step.desc ?? '') })) };
}

export default function HowItWorksEditor({ initialContent, onClose, onSaved }: Props) {
  const [draft, setDraft] = useState<HowItWorksContent>(() => normalize(initialContent));
  const updateStep = (index: number, key: keyof HowItWorksContent['steps'][number], value: string) => {
    setDraft((current) => ({ ...current, steps: current.steps.map((step, i) => i === index ? { ...step, [key]: value } : step) }));
  };
  const save = async () => {
    const response = await fetch('/api/admin/landing-page/how_it_works', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: draft }) });
    const body = await response.json().catch(() => null) as { error?: string; issues?: Array<{ path: string; message: string }> } | null;
    if (!response.ok) throw new Error(body?.issues?.map((issue) => `${issue.path}: ${issue.message}`).join('، ') || body?.error || 'تعذر حفظ قسم كيف يعمل');
    onSaved(draft);
  };
  const previewCopy = { ...landingCopy, howItWorks: draft };

  return (
    <SectionEditorModal title="تحرير قسم كيف يعمل" description="عدّل عنوان القسم والخطوات الثلاثة المعروضة في الصفحة." onClose={onClose} onSave={save} preview={<LandingContentProvider copy={previewCopy}><HowItWorks /></LandingContentProvider>}>
      <label className="block text-sm font-medium text-slate-700">عنوان القسم<input maxLength={160} value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} className={inputClass} /></label>
      {draft.steps.map((step, index) => (
        <fieldset key={index} className="space-y-3 rounded-2xl border border-slate-200 p-4">
          <legend className="px-2 text-sm font-semibold text-slate-800">خطوة {index + 1}</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm text-slate-700">الرقم<input maxLength={4} value={step.num} onChange={(event) => updateStep(index, 'num', event.target.value)} className={inputClass} /></label>
            <label className="block text-sm text-slate-700">العنوان<input maxLength={100} value={step.title} onChange={(event) => updateStep(index, 'title', event.target.value)} className={inputClass} /></label>
          </div>
          <label className="block text-sm text-slate-700">الوصف<textarea rows={3} maxLength={500} value={step.desc} onChange={(event) => updateStep(index, 'desc', event.target.value)} className={inputClass} /></label>
        </fieldset>
      ))}
    </SectionEditorModal>
  );
}
