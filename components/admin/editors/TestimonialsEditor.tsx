'use client';

import { useState } from 'react';
import TestimonialsSection from '@/components/landing/TestimonialsSection';
import { LandingContentProvider } from '@/components/landing/LandingContent';
import { landingCopy } from '@/lib/landing/landing-copy';
import SectionEditorModal from './SectionEditorModal';

type Testimonial = { content: string; doctor_name: string; specialty: string; rating: number; image_url: string };
type TestimonialsContent = { title: string; subtitle: string; items: Testimonial[] };
type Props = { initialContent: Record<string, unknown> | null; onClose: () => void; onSaved: (content: TestimonialsContent) => void };
const defaults = landingCopy.testimonials as TestimonialsContent;
const inputClass = 'mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200';

function normalize(content: Record<string, unknown> | null): TestimonialsContent {
  const value = { ...defaults, ...(content ?? {}) } as TestimonialsContent;
  const items = Array.isArray(value.items) ? value.items : defaults.items;
  return { ...value, items: items.map((item) => ({ content: String(item.content ?? ''), doctor_name: String(item.doctor_name ?? ''), specialty: String(item.specialty ?? ''), rating: Number(item.rating ?? 5), image_url: String(item.image_url ?? '') })) };
}

export default function TestimonialsEditor({ initialContent, onClose, onSaved }: Props) {
  const [draft, setDraft] = useState<TestimonialsContent>(() => normalize(initialContent));
  const updateItem = (index: number, key: keyof Testimonial, value: string | number) => setDraft((current) => ({ ...current, items: current.items.map((item, i) => i === index ? { ...item, [key]: value } : item) }));
  const previewCopy = { ...landingCopy, testimonials: draft };

  const save = async () => {
    const response = await fetch('/api/admin/landing-page/testimonials', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: draft }) });
    const body = await response.json().catch(() => null) as { error?: string; issues?: Array<{ path: string; message: string }> } | null;
    if (!response.ok) throw new Error(body?.issues?.map((issue) => `${issue.path}: ${issue.message}`).join('، ') || body?.error || 'تعذر حفظ آراء الأطباء');
    onSaved(draft);
  };

  return (
    <SectionEditorModal title="تحرير آراء الأطباء والمرضى" description="أدخل نص الرأي والاسم والتخصص والتقييم. صورة اختيارية عبر رابط محلي أو HTTPS." onClose={onClose} onSave={save} preview={<LandingContentProvider copy={previewCopy}><TestimonialsSection /></LandingContentProvider>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium text-slate-700">عنوان القسم<input maxLength={160} value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} className={inputClass} /></label>
        <label className="block text-sm font-medium text-slate-700">الوصف المختصر<input maxLength={300} value={draft.subtitle} onChange={(event) => setDraft((current) => ({ ...current, subtitle: event.target.value }))} className={inputClass} /></label>
      </div>
      {draft.items.map((item, index) => (
        <fieldset key={index} className="space-y-3 rounded-2xl border border-slate-200 p-4">
          <legend className="px-2 text-sm font-semibold text-slate-800">رأي {index + 1}</legend>
          <label className="block text-sm text-slate-700">نص الرأي<textarea rows={3} maxLength={1500} value={item.content} onChange={(event) => updateItem(index, 'content', event.target.value)} className={inputClass} /></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm text-slate-700">الاسم<input maxLength={120} value={item.doctor_name} onChange={(event) => updateItem(index, 'doctor_name', event.target.value)} className={inputClass} /></label>
            <label className="block text-sm text-slate-700">التخصص<input maxLength={120} value={item.specialty} onChange={(event) => updateItem(index, 'specialty', event.target.value)} className={inputClass} /></label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm text-slate-700">التقييم (1–5)<select value={item.rating} onChange={(event) => updateItem(index, 'rating', Number(event.target.value))} className={inputClass}>{[5, 4, 3, 2, 1].map((rating) => <option key={rating} value={rating}>{rating} من 5</option>)}</select></label>
            <label className="block text-sm text-slate-700">رابط الصورة (اختياري)<input type="url" dir="ltr" maxLength={1000} value={item.image_url} onChange={(event) => updateItem(index, 'image_url', event.target.value)} className={inputClass} placeholder="https://... أو /images/..." /></label>
          </div>
          <button type="button" disabled={draft.items.length <= 1} onClick={() => setDraft((current) => ({ ...current, items: current.items.filter((_, i) => i !== index) }))} className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-600 disabled:opacity-40">حذف الرأي</button>
        </fieldset>
      ))}
      <button type="button" disabled={draft.items.length >= 30} onClick={() => setDraft((current) => ({ ...current, items: [...current.items, { content: '', doctor_name: '', specialty: '', rating: 5, image_url: '' }] }))} className="rounded-full border border-violet-300 px-4 py-2 text-sm font-semibold text-violet-700 disabled:opacity-40">＋ إضافة رأي</button>
    </SectionEditorModal>
  );
}
