'use client';

import { useState } from 'react';
import WhySection from '@/components/landing/WhySection';
import { LandingContentProvider } from '@/components/landing/LandingContent';
import { landingCopy } from '@/lib/landing/landing-copy';
import SectionEditorModal from './SectionEditorModal';

export type FeatureCardContent = { icon: string; title: string; desc: string; href: string; cta?: string };
export type FeaturesContent = { eyebrow: string; title: string; titleAccent: string; subtitle: string; cards: FeatureCardContent[] };

type Props = { initialContent: Record<string, unknown> | null; onClose: () => void; onSaved: (content: FeaturesContent) => void };
const defaults = landingCopy.features as FeaturesContent;
const inputClass = 'mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200';

function normalize(content: Record<string, unknown> | null): FeaturesContent {
  const value = { ...defaults, ...(content ?? {}) } as FeaturesContent;
  const cards = Array.isArray(value.cards) ? value.cards : defaults.cards;
  return { ...value, cards: cards.map((card) => ({ ...card, icon: String(card.icon ?? ''), title: String(card.title ?? ''), desc: String(card.desc ?? ''), href: String(card.href ?? '/register'), cta: card.cta ? String(card.cta) : '' })) };
}

export default function FeaturesEditor({ initialContent, onClose, onSaved }: Props) {
  const [draft, setDraft] = useState<FeaturesContent>(() => normalize(initialContent));
  const setField = (key: keyof Omit<FeaturesContent, 'cards'>, value: string) => setDraft((current) => ({ ...current, [key]: value }));
  const updateCard = (index: number, key: keyof FeatureCardContent, value: string) => setDraft((current) => ({ ...current, cards: current.cards.map((card, i) => i === index ? { ...card, [key]: value } : card) }));

  const save = async () => {
    const response = await fetch('/api/admin/landing-page/features', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: draft }) });
    const body = await response.json().catch(() => null) as { error?: string; issues?: Array<{ path: string; message: string }> } | null;
    if (!response.ok) throw new Error(body?.issues?.map((issue) => `${issue.path}: ${issue.message}`).join('، ') || body?.error || 'تعذر حفظ قسم المميزات');
    onSaved(draft);
  };

  const previewCopy = { ...landingCopy, features: draft };
  const field = (key: keyof Omit<FeaturesContent, 'cards'>, label: string, multiline = false) => (
    <label className="block text-sm font-medium text-slate-700">{label}
      {multiline ? <textarea rows={3} maxLength={500} value={draft[key]} onChange={(event) => setField(key, event.target.value)} className={inputClass} /> : <input maxLength={160} value={draft[key]} onChange={(event) => setField(key, event.target.value)} className={inputClass} />}
    </label>
  );

  return (
    <SectionEditorModal title="تحرير قسم المميزات" description="عدّل مقدمة القسم وبطاقاته وروابطها. تتحدث المعاينة مع كل تغيير." onClose={onClose} onSave={save} preview={<LandingContentProvider copy={previewCopy}><WhySection /></LandingContentProvider>}>
      {field('eyebrow', 'النص التعريفي أعلى العنوان')}
      <div className="grid gap-3 sm:grid-cols-2">{field('title', 'العنوان')}{field('titleAccent', 'النص الملوّن في العنوان')}</div>
      {field('subtitle', 'الوصف المختصر', true)}
      <div className="space-y-4">
        {draft.cards.map((card, index) => (
          <fieldset key={index} className="space-y-3 rounded-2xl border border-slate-200 p-4">
            <legend className="px-2 text-sm font-semibold text-slate-800">بطاقة {index + 1}</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm text-slate-700">الأيقونة / Emoji<input maxLength={16} value={card.icon} onChange={(event) => updateCard(index, 'icon', event.target.value)} className={inputClass} /></label>
              <label className="block text-sm text-slate-700">العنوان<input maxLength={100} value={card.title} onChange={(event) => updateCard(index, 'title', event.target.value)} className={inputClass} /></label>
            </div>
            <label className="block text-sm text-slate-700">الوصف<textarea rows={2} maxLength={500} value={card.desc} onChange={(event) => updateCard(index, 'desc', event.target.value)} className={inputClass} /></label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm text-slate-700">الرابط<input type="url" dir="ltr" maxLength={600} value={card.href} onChange={(event) => updateCard(index, 'href', event.target.value)} className={inputClass} /></label>
              <label className="block text-sm text-slate-700">نص الرابط (اختياري)<input maxLength={100} value={card.cta ?? ''} onChange={(event) => updateCard(index, 'cta', event.target.value)} className={inputClass} /></label>
            </div>
            <button type="button" disabled={draft.cards.length <= 1} onClick={() => setDraft((current) => ({ ...current, cards: current.cards.filter((_, i) => i !== index) }))} className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-600 disabled:opacity-40">حذف البطاقة</button>
          </fieldset>
        ))}
      </div>
      <button type="button" disabled={draft.cards.length >= 12} onClick={() => setDraft((current) => ({ ...current, cards: [...current.cards, { icon: '✨', title: '', desc: '', href: '/register', cta: '' }] }))} className="rounded-full border border-violet-300 px-4 py-2 text-sm font-semibold text-violet-700 disabled:opacity-40">＋ إضافة بطاقة</button>
    </SectionEditorModal>
  );
}
