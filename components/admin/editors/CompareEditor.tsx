'use client';

import { useState } from 'react';
import { LandingContentProvider } from '@/components/landing/LandingContent';
import ComparisonSection from '@/components/landing/ComparisonSection';
import { landingCopy } from '@/lib/landing/landing-copy';
import SectionEditorModal from './SectionEditorModal';

export type CompareContent = { without: { title: string; points: string[] }; with: { title: string; points: string[] } };
type Props = { initialContent: Record<string, unknown> | null; onClose: () => void; onSaved: (content: CompareContent) => void };
const defaults = landingCopy.compare as CompareContent;
const inputClass = 'mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200';

function normalize(content: Record<string, unknown> | null): CompareContent {
  const value = { ...defaults, ...(content ?? {}) } as CompareContent;
  return {
    without: { title: String(value.without?.title ?? defaults.without.title), points: Array.isArray(value.without?.points) ? value.without.points.map(String) : defaults.without.points },
    with: { title: String(value.with?.title ?? defaults.with.title), points: Array.isArray(value.with?.points) ? value.with.points.map(String) : defaults.with.points },
  };
}

export default function CompareEditor({ initialContent, onClose, onSaved }: Props) {
  const [draft, setDraft] = useState<CompareContent>(() => normalize(initialContent));
  const updatePoint = (side: 'without' | 'with', index: number, value: string) => {
    setDraft((current) => ({ ...current, [side]: { ...current[side], points: current[side].points.map((item, i) => i === index ? value : item) } }));
  };
  const save = async () => {
    const response = await fetch('/api/admin/landing-page/compare', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: draft }) });
    const body = await response.json().catch(() => null) as { error?: string; issues?: Array<{ path: string; message: string }> } | null;
    if (!response.ok) throw new Error(body?.issues?.map((issue) => `${issue.path}: ${issue.message}`).join('، ') || body?.error || 'تعذر حفظ قسم المقارنة');
    onSaved(draft);
  };
  const previewCopy = { ...landingCopy, compare: draft };

  return (
    <SectionEditorModal title="تحرير مقارنة الحل" description="غيّر نقاط البديل وميزات AI-Receptions المعروضة في المقارنة." onClose={onClose} onSave={save} preview={<LandingContentProvider copy={previewCopy}><ComparisonSection /></LandingContentProvider>}>
      <div className="grid gap-4 lg:grid-cols-2">
        <fieldset className="space-y-3 rounded-2xl border border-slate-200 p-4">
          <legend className="px-2 text-sm font-semibold text-slate-800">بدون AI-Receptions</legend>
          <label className="block text-sm text-slate-700">العنوان<input maxLength={120} value={draft.without.title} onChange={(event) => setDraft((current) => ({ ...current, without: { ...current.without, title: event.target.value } }))} className={inputClass} /></label>
          {draft.without.points.map((point, index) => <label key={index} className="block text-sm text-slate-700">النقطة {index + 1}<input maxLength={200} value={point} onChange={(event) => updatePoint('without', index, event.target.value)} className={inputClass} /></label>)}
        </fieldset>
        <fieldset className="space-y-3 rounded-2xl border border-slate-200 p-4">
          <legend className="px-2 text-sm font-semibold text-slate-800">مع AI-Receptions</legend>
          <label className="block text-sm text-slate-700">العنوان<input maxLength={120} value={draft.with.title} onChange={(event) => setDraft((current) => ({ ...current, with: { ...current.with, title: event.target.value } }))} className={inputClass} /></label>
          {draft.with.points.map((point, index) => <label key={index} className="block text-sm text-slate-700">النقطة {index + 1}<input maxLength={200} value={point} onChange={(event) => updatePoint('with', index, event.target.value)} className={inputClass} /></label>)}
        </fieldset>
      </div>
    </SectionEditorModal>
  );
}
