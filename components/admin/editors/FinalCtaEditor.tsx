'use client';

import { useState } from 'react';
import { LandingContentProvider } from '@/components/landing/LandingContent';
import FinalCTASection from '@/components/landing/FinalCTASection';
import { landingCopy } from '@/lib/landing/landing-copy';
import SectionEditorModal from './SectionEditorModal';

export type FinalCtaContent = { title: string; paragraph: string; ctaPrimary: string; ctaSecondary: string };
type Props = { initialContent: Record<string, unknown> | null; onClose: () => void; onSaved: (content: FinalCtaContent) => void };
const defaults = landingCopy.finalCta as FinalCtaContent;
const inputClass = 'mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200';

function normalize(content: Record<string, unknown> | null): FinalCtaContent {
  return { ...defaults, ...(content ?? {}) } as FinalCtaContent;
}

export default function FinalCtaEditor({ initialContent, onClose, onSaved }: Props) {
  const [draft, setDraft] = useState<FinalCtaContent>(() => normalize(initialContent));
  const save = async () => {
    const response = await fetch('/api/admin/landing-page/cta', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: draft }) });
    const body = await response.json().catch(() => null) as { error?: string; issues?: Array<{ path: string; message: string }> } | null;
    if (!response.ok) throw new Error(body?.issues?.map((issue) => `${issue.path}: ${issue.message}`).join('، ') || body?.error || 'تعذر حفظ دعوة اتخاذ إجراء');
    onSaved(draft);
  };
  const previewCopy = { ...landingCopy, finalCta: draft };

  return (
    <SectionEditorModal title="تحرير دعوة اتخاذ إجراء" description="عدّل عنوان القسم والعبارات الثانوية مع إبقاء روابط الأزرار كما هي." onClose={onClose} onSave={save} preview={<LandingContentProvider copy={previewCopy}><FinalCTASection /></LandingContentProvider>}>
      <label className="block text-sm font-medium text-slate-700">العنوان<input maxLength={180} value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} className={inputClass} /></label>
      <label className="block text-sm font-medium text-slate-700">الوصف<textarea rows={3} maxLength={500} value={draft.paragraph} onChange={(event) => setDraft((current) => ({ ...current, paragraph: event.target.value }))} className={inputClass} /></label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium text-slate-700">زر القرار<input maxLength={100} value={draft.ctaPrimary} onChange={(event) => setDraft((current) => ({ ...current, ctaPrimary: event.target.value }))} className={inputClass} /></label>
        <label className="block text-sm font-medium text-slate-700">زر التواصل<input maxLength={100} value={draft.ctaSecondary} onChange={(event) => setDraft((current) => ({ ...current, ctaSecondary: event.target.value }))} className={inputClass} /></label>
      </div>
    </SectionEditorModal>
  );
}
