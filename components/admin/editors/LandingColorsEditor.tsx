'use client';

import { useState } from 'react';
import PricingSection from '@/components/landing/PricingSection';
import { LandingContentProvider } from '@/components/landing/LandingContent';
import { landingCopy } from '@/lib/landing/landing-copy';
import SectionEditorModal from './SectionEditorModal';

type Colors = { primary: string; secondary: string; cta: string };
type Props = { initialContent: Record<string, unknown> | null; onClose: () => void; onSaved: (content: Colors) => void };
const defaults = landingCopy.colors as Colors;
const fields: Array<{ key: keyof Colors; label: string; description: string }> = [
  { key: 'primary', label: 'اللون الأساسي', description: 'العناوين المميزة والحالات النشطة.' },
  { key: 'secondary', label: 'اللون الثانوي', description: 'التدرج اللوني والأجزاء المساندة.' },
  { key: 'cta', label: 'لون أزرار الإجراء', description: 'الأزرار الداكنة وروابط الحجز.' },
];

export default function LandingColorsEditor({ initialContent, onClose, onSaved }: Props) {
  const [draft, setDraft] = useState<Colors>(() => ({ ...defaults, ...(initialContent ?? {}) } as Colors));
  const update = (key: keyof Colors, value: string) => setDraft((current) => ({ ...current, [key]: value }));
  const save = async () => {
    const response = await fetch('/api/admin/landing-page/colors', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: draft }) });
    const body = await response.json().catch(() => null) as { error?: string; issues?: Array<{ path: string; message: string }> } | null;
    if (!response.ok) throw new Error(body?.issues?.map((issue) => `${issue.path}: ${issue.message}`).join('، ') || body?.error || 'تعذر حفظ ألوان الصفحة');
    onSaved(draft);
  };
  const previewCopy = { ...landingCopy, colors: draft };

  return (
    <SectionEditorModal title="ألوان الصفحة الرئيسية" description="تُطبّق الألوان الأساسية والثانوية على أزرار وتفاصيل الصفحة الرئيسية دون قبول CSS حر." onClose={onClose} onSave={save} preview={<LandingContentProvider copy={previewCopy}><div className="space-y-5 p-5"><div className="flex flex-wrap gap-3"><button type="button" className="rounded-full px-5 py-3 font-bold text-white" style={{ background: 'linear-gradient(90deg, var(--landing-primary), var(--landing-secondary))' }}>زر بتدرج الهوية</button><button type="button" className="rounded-full px-5 py-3 font-bold text-white" style={{ backgroundColor: 'var(--landing-cta)' }}>دعوة لاتخاذ إجراء</button></div><PricingSection /></div></LandingContentProvider>}>
      {fields.map(({ key, label, description }) => <label key={key} className="block text-sm font-medium text-slate-700">{label}<p className="text-xs font-normal text-slate-500">{description}</p><div className="mt-1 flex gap-2"><input type="color" value={draft[key]} onChange={(event) => update(key, event.target.value)} className="h-11 w-14 rounded border border-slate-300 bg-white p-1" /><input value={draft[key]} onChange={(event) => update(key, event.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200" dir="ltr" /></div></label>)}
    </SectionEditorModal>
  );
}
