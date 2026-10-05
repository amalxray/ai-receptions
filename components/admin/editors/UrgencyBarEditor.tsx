'use client';

import { useState } from 'react';
import UrgencyBar, { type UrgencyBarContent } from '@/components/landing/UrgencyBar';
import { LandingContentProvider } from '@/components/landing/LandingContent';
import { landingCopy } from '@/lib/landing/landing-copy';
import SectionEditorModal from './SectionEditorModal';

type Props = { initialContent: Record<string, unknown> | null; onClose: () => void; onSaved: (content: UrgencyBarContent) => void };
const defaults = landingCopy.urgencyBar as UrgencyBarContent;
const inputClass = 'mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200';

function normalize(content: Record<string, unknown> | null): UrgencyBarContent {
  return { ...defaults, ...(content ?? {}), text: String(content?.text ?? defaults.text), suffix: String(content?.suffix ?? defaults.suffix), cta: String(content?.cta ?? defaults.cta), backgroundColor: String(content?.backgroundColor ?? defaults.backgroundColor), textColor: String(content?.textColor ?? defaults.textColor), tickerSpeed: (['off', 'slow', 'normal', 'fast'].includes(String(content?.tickerSpeed)) ? content?.tickerSpeed : defaults.tickerSpeed) as UrgencyBarContent['tickerSpeed'] };
}

export default function UrgencyBarEditor({ initialContent, onClose, onSaved }: Props) {
  const [draft, setDraft] = useState<UrgencyBarContent>(() => normalize(initialContent));
  const update = (key: keyof UrgencyBarContent, value: string) => setDraft((current) => ({ ...current, [key]: value }));
  const save = async () => {
    const response = await fetch('/api/admin/landing-page/urgency_bar', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: draft }) });
    const body = await response.json().catch(() => null) as { error?: string; issues?: Array<{ path: string; message: string }> } | null;
    if (!response.ok) throw new Error(body?.issues?.map((issue) => `${issue.path}: ${issue.message}`).join('، ') || body?.error || 'تعذر حفظ شريط العرض');
    onSaved(draft);
  };
  const previewCopy = { ...landingCopy, urgencyBar: draft };

  return (
    <SectionEditorModal title="تحرير شريط العرض العاجل" description="غيّر نص الشريط وألوانه وسرعة الحركة. اختر إيقاف الحركة للحفاظ على عرض ثابت." onClose={onClose} onSave={save} preview={<LandingContentProvider copy={previewCopy}><UrgencyBar previewContent={draft} /></LandingContentProvider>}>
      <label className="block text-sm font-medium text-slate-700">النص الظاهر<input maxLength={300} value={draft.text} onChange={(event) => update('text', event.target.value)} className={inputClass} /></label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm text-slate-700">الكلمة بعد عداد المقاعد<input maxLength={80} value={draft.suffix} onChange={(event) => update('suffix', event.target.value)} className={inputClass} /></label>
        <label className="block text-sm text-slate-700">نص الزر<input maxLength={100} value={draft.cta} onChange={(event) => update('cta', event.target.value)} className={inputClass} /></label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {(['backgroundColor', 'textColor'] as const).map((key) => <label key={key} className="block text-sm text-slate-700">{key === 'backgroundColor' ? 'لون الخلفية' : 'لون النص'}<div className="mt-1 flex gap-2"><input type="color" value={draft[key]} onChange={(event) => update(key, event.target.value)} className="h-11 w-14 rounded border border-slate-300 bg-white p-1" /><input value={draft[key]} onChange={(event) => update(key, event.target.value)} className={inputClass} dir="ltr" /></div></label>)}
      </div>
      <label className="block text-sm text-slate-700">سرعة الحركة<select value={draft.tickerSpeed} onChange={(event) => update('tickerSpeed', event.target.value)} className={inputClass}><option value="off">ثابت — دون حركة</option><option value="slow">بطيئة</option><option value="normal">متوسطة</option><option value="fast">سريعة</option></select></label>
    </SectionEditorModal>
  );
}
