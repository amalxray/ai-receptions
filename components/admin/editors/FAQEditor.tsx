'use client';

import { useState } from 'react';
import FAQSection from '@/components/landing/FAQSection';
import { LandingContentProvider } from '@/components/landing/LandingContent';
import { landingCopy } from '@/lib/landing/landing-copy';
import SectionEditorModal from './SectionEditorModal';

type FaqItem = { q: string; a: string };
type FAQContent = { title: string; items: FaqItem[] };
type Props = { initialContent: Record<string, unknown> | null; onClose: () => void; onSaved: (content: FAQContent) => void };
const defaults = landingCopy.faq as FAQContent;
const inputClass = 'mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200';

function normalize(content: Record<string, unknown> | null): FAQContent {
  const value = { ...defaults, ...(content ?? {}) } as FAQContent;
  const items = Array.isArray(value.items) ? value.items : defaults.items;
  return { ...value, items: items.map((item) => ({ q: String(item.q ?? ''), a: String(item.a ?? '') })) };
}

export default function FAQEditor({ initialContent, onClose, onSaved }: Props) {
  const [draft, setDraft] = useState<FAQContent>(() => normalize(initialContent));
  const previewCopy = { ...landingCopy, faq: draft, __cmsOverrides: ['faq'] };
  const updateItem = (index: number, key: keyof FaqItem, value: string) => setDraft((current) => ({ ...current, items: current.items.map((item, i) => i === index ? { ...item, [key]: value } : item) }));

  const save = async () => {
    const response = await fetch('/api/admin/landing-page/faq', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: draft }) });
    const body = await response.json().catch(() => null) as { error?: string; issues?: Array<{ path: string; message: string }> } | null;
    if (!response.ok) throw new Error(body?.issues?.map((issue) => `${issue.path}: ${issue.message}`).join('، ') || body?.error || 'تعذر حفظ قسم الأسئلة الشائعة');
    onSaved(draft);
  };

  return (
    <SectionEditorModal title="تحرير الأسئلة الشائعة" description="عدّل عنوان القسم والأسئلة والأجوبة. ستظهر الإجابات المحفوظة بدل المصدر العام عند وجود تعديل CMS." onClose={onClose} onSave={save} preview={<LandingContentProvider copy={previewCopy}><FAQSection previewContent={draft} /></LandingContentProvider>}>
      <label className="block text-sm font-medium text-slate-700">عنوان القسم<input maxLength={160} value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} className={inputClass} /></label>
      {draft.items.map((item, index) => (
        <fieldset key={index} className="space-y-3 rounded-2xl border border-slate-200 p-4">
          <legend className="px-2 text-sm font-semibold text-slate-800">سؤال {index + 1}</legend>
          <label className="block text-sm text-slate-700">السؤال<input maxLength={300} value={item.q} onChange={(event) => updateItem(index, 'q', event.target.value)} className={inputClass} /></label>
          <label className="block text-sm text-slate-700">الإجابة<textarea rows={4} maxLength={2000} value={item.a} onChange={(event) => updateItem(index, 'a', event.target.value)} className={inputClass} /></label>
          <button type="button" disabled={draft.items.length <= 1} onClick={() => setDraft((current) => ({ ...current, items: current.items.filter((_, i) => i !== index) }))} className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-600 disabled:opacity-40">حذف السؤال</button>
        </fieldset>
      ))}
      <button type="button" disabled={draft.items.length >= 30} onClick={() => setDraft((current) => ({ ...current, items: [...current.items, { q: '', a: '' }] }))} className="rounded-full border border-violet-300 px-4 py-2 text-sm font-semibold text-violet-700 disabled:opacity-40">＋ إضافة سؤال</button>
    </SectionEditorModal>
  );
}
