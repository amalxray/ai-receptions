'use client';

import { useState } from 'react';
import { landingCopy } from '@/lib/landing/landing-copy';
import SectionEditorModal from './SectionEditorModal';

type Seo = { title: string; description: string; og_image: string };
type Props = { initialContent: Record<string, unknown> | null; onClose: () => void; onSaved: (content: Seo) => void };
const defaults = landingCopy.seo as Seo;
const inputClass = 'mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200';

export default function LandingSeoEditor({ initialContent, onClose, onSaved }: Props) {
  const [draft, setDraft] = useState<Seo>(() => ({ ...defaults, ...(initialContent ?? {}) } as Seo));
  const update = (key: keyof Seo, value: string) => setDraft((current) => ({ ...current, [key]: value }));
  const save = async () => {
    const response = await fetch('/api/admin/landing-page/seo', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: draft }) });
    const body = await response.json().catch(() => null) as { error?: string; issues?: Array<{ path: string; message: string }> } | null;
    if (!response.ok) throw new Error(body?.issues?.map((issue) => `${issue.path}: ${issue.message}`).join('، ') || body?.error || 'تعذر حفظ إعدادات SEO');
    onSaved(draft);
  };
  const canonicalImage = draft.og_image.startsWith('/') ? `https://www.dentairec.com${draft.og_image}` : draft.og_image;

  return (
    <SectionEditorModal title="إعدادات SEO والمشاركة" description="تتحدث بيانات عنوان الصفحة ووصفها وصورة Open Graph بعد الحفظ وإعادة التحقق من الصفحة الرئيسية." onClose={onClose} onSave={save} preview={<div className="space-y-5 bg-slate-50 p-5"><div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs text-slate-500">معاينة نتيجة البحث</p><p className="mt-2 line-clamp-1 text-lg font-semibold text-blue-800">{draft.title || 'عنوان الصفحة'}</p><p className="text-xs text-emerald-800">www.dentairec.com</p><p className="mt-1 line-clamp-3 text-sm text-slate-600">{draft.description || 'وصف الصفحة سيظهر هنا.'}</p></div><div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="grid aspect-[1.91/1] place-items-center bg-slate-100">{canonicalImage ? <img src={canonicalImage} alt="معاينة صورة المشاركة" className="h-full w-full object-cover" /> : <span className="text-sm text-slate-500">لا توجد صورة مشاركة محددة</span>}</div><div className="p-4"><p className="text-xs uppercase text-slate-500">DENTAIREC.COM</p><p className="mt-1 font-bold text-slate-900">{draft.title || 'عنوان الصفحة'}</p><p className="mt-1 line-clamp-2 text-sm text-slate-600">{draft.description || 'وصف المشاركة سيظهر هنا.'}</p></div></div></div>}>
      <label className="block text-sm font-medium text-slate-700">عنوان الصفحة<input maxLength={180} value={draft.title} onChange={(event) => update('title', event.target.value)} className={inputClass} /></label>
      <label className="block text-sm font-medium text-slate-700">الوصف التعريفي<textarea rows={4} maxLength={320} value={draft.description} onChange={(event) => update('description', event.target.value)} className={inputClass} /><span className="mt-1 block text-xs text-slate-500">{draft.description.length}/320 حرفًا</span></label>
      <label className="block text-sm font-medium text-slate-700">رابط صورة المشاركة (اختياري)<input type="url" dir="ltr" maxLength={1000} value={draft.og_image} onChange={(event) => update('og_image', event.target.value)} className={inputClass} placeholder="https://... أو /images/share.jpg" /></label>
      {canonicalImage && <p className="text-xs text-slate-500" dir="ltr">{canonicalImage}</p>}
    </SectionEditorModal>
  );
}
