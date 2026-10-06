'use client';

import { useState } from 'react';
import { LandingContentProvider } from '@/components/landing/LandingContent';
import { landingCopy } from '@/lib/landing/landing-copy';
import SectionEditorModal from './SectionEditorModal';

export type FooterContent = { copyright: string; fabTooltip: string };
type Props = { initialContent: Record<string, unknown> | null; onClose: () => void; onSaved: (content: FooterContent) => void };
const defaults = landingCopy.footer as FooterContent;
const inputClass = 'mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200';

function normalize(content: Record<string, unknown> | null): FooterContent {
  return { ...defaults, ...(content ?? {}) } as FooterContent;
}

export default function FooterEditor({ initialContent, onClose, onSaved }: Props) {
  const [draft, setDraft] = useState<FooterContent>(() => normalize(initialContent));
  const save = async () => {
    const response = await fetch('/api/admin/landing-page/footer', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: draft }) });
    const body = await response.json().catch(() => null) as { error?: string; issues?: Array<{ path: string; message: string }> } | null;
    if (!response.ok) throw new Error(body?.issues?.map((issue) => `${issue.path}: ${issue.message}`).join('، ') || body?.error || 'تعذر حفظ تذييل الصفحة');
    onSaved(draft);
  };
  const previewCopy = { ...landingCopy, footer: draft };

  return (
    <SectionEditorModal title="تحرير تذييل الصفحة" description="عدّل حقوق النشر واسم أداة تواصل المساعدة الظاهرة في الزاوية السفلية." onClose={onClose} onSave={save} preview={<LandingContentProvider copy={previewCopy}><footer className="border-t border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-600">{draft.copyright}</footer></LandingContentProvider>}>
      <label className="block text-sm font-medium text-slate-700">حقوق النشر<input maxLength={160} value={draft.copyright} onChange={(event) => setDraft((current) => ({ ...current, copyright: event.target.value }))} className={inputClass} /></label>
      <label className="block text-sm font-medium text-slate-700">عنوان زر المحادثة<input maxLength={120} value={draft.fabTooltip} onChange={(event) => setDraft((current) => ({ ...current, fabTooltip: event.target.value }))} className={inputClass} /></label>
    </SectionEditorModal>
  );
}
