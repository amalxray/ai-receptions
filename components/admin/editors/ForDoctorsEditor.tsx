'use client';

import { useState } from 'react';
import { LandingContentProvider } from '@/components/landing/LandingContent';
import ForDoctorsSection from '@/components/landing/ForDoctorsSection';
import { landingCopy } from '@/lib/landing/landing-copy';
import SectionEditorModal from './SectionEditorModal';

export type ForDoctorsContent = {
  eyebrow: string;
  title: string;
  points: Array<{ icon: string; title: string; desc: string; quote?: string }>;
  cta: string;
};

type Props = { initialContent: Record<string, unknown> | null; onClose: () => void; onSaved: (content: ForDoctorsContent) => void };
const defaults = landingCopy.forDoctors as ForDoctorsContent;
const inputClass = 'mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200';

function normalize(content: Record<string, unknown> | null): ForDoctorsContent {
  const value = { ...defaults, ...(content ?? {}) } as ForDoctorsContent;
  const points = Array.isArray(value.points) ? value.points : defaults.points;
  return {
    ...value,
    points: points.map((point) => ({
      icon: String(point.icon ?? ''),
      title: String(point.title ?? ''),
      desc: String(point.desc ?? ''),
      quote: point.quote ? String(point.quote) : undefined,
    })),
  };
}

export default function ForDoctorsEditor({ initialContent, onClose, onSaved }: Props) {
  const [draft, setDraft] = useState<ForDoctorsContent>(() => normalize(initialContent));
  const updatePoint = (index: number, key: keyof ForDoctorsContent['points'][number], value: string) => {
    setDraft((current) => ({ ...current, points: current.points.map((point, i) => i === index ? { ...point, [key]: value } : point) }));
  };
  const save = async () => {
    const response = await fetch('/api/admin/landing-page/for_doctors', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: draft }) });
    const body = await response.json().catch(() => null) as { error?: string; issues?: Array<{ path: string; message: string }> } | null;
    if (!response.ok) throw new Error(body?.issues?.map((issue) => `${issue.path}: ${issue.message}`).join('، ') || body?.error || 'تعذر حفظ قسم للأطباء');
    onSaved(draft);
  };
  const previewCopy = { ...landingCopy, forDoctors: draft };

  return (
    <SectionEditorModal title="تحرير قسم للأطباء" description="عدّل عنوان القسم والنقاط والدعوة لاتخاذ إجراء. ستظهر التغييرات فوراً في المعاينة." onClose={onClose} onSave={save} preview={<LandingContentProvider copy={previewCopy}><ForDoctorsSection /></LandingContentProvider>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium text-slate-700">النص التعريفي<input maxLength={160} value={draft.eyebrow} onChange={(event) => setDraft((current) => ({ ...current, eyebrow: event.target.value }))} className={inputClass} /></label>
        <label className="block text-sm font-medium text-slate-700">عنوان القسم<input maxLength={160} value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} className={inputClass} /></label>
      </div>
      <label className="block text-sm font-medium text-slate-700">نص الزر<input maxLength={100} value={draft.cta} onChange={(event) => setDraft((current) => ({ ...current, cta: event.target.value }))} className={inputClass} /></label>
      {draft.points.map((point, index) => (
        <fieldset key={index} className="space-y-3 rounded-2xl border border-slate-200 p-4">
          <legend className="px-2 text-sm font-semibold text-slate-800">نقطة {index + 1}</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm text-slate-700">الأيقونة<input maxLength={20} value={point.icon} onChange={(event) => updatePoint(index, 'icon', event.target.value)} className={inputClass} /></label>
            <label className="block text-sm text-slate-700">العنوان<input maxLength={100} value={point.title} onChange={(event) => updatePoint(index, 'title', event.target.value)} className={inputClass} /></label>
          </div>
          <label className="block text-sm text-slate-700">الوصف<textarea rows={2} maxLength={500} value={point.desc} onChange={(event) => updatePoint(index, 'desc', event.target.value)} className={inputClass} /></label>
          <label className="block text-sm text-slate-700">اقتباس اختياري<textarea rows={2} maxLength={300} value={point.quote ?? ''} onChange={(event) => updatePoint(index, 'quote', event.target.value)} className={inputClass} /></label>
        </fieldset>
      ))}
    </SectionEditorModal>
  );
}
