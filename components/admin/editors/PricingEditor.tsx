'use client';

import { useState } from 'react';
import PricingSection from '@/components/landing/PricingSection';
import { LandingContentProvider } from '@/components/landing/LandingContent';
import { landingCopy } from '@/lib/landing/landing-copy';
import SectionEditorModal from './SectionEditorModal';

type BillingTierId = 'basic' | 'advanced' | 'center';
type Tier = { id: BillingTierId; title: string; monthly: string; yearly: string; note: string; features: string[]; highlighted: boolean; buttonText: string };
type PricingContent = {
  title: string; badge: string; highlightedLabel: string; monthlyLabel: string; yearlyLabel: string;
  trialTitle: string; trialDescription: string; trialCta: string; yearlyNote: string; trialNote: string;
  footerText: string; footerLinkText: string; tiers: Tier[];
};
type Props = { initialContent: Record<string, unknown> | null; onClose: () => void; onSaved: (content: PricingContent) => void };
const defaults = landingCopy.pricing as PricingContent;
const PLAN_IDS: BillingTierId[] = ['basic', 'advanced', 'center'];
const PLAN_LABELS: Record<BillingTierId, string> = { basic: 'الأساسية', advanced: 'المتقدمة / المؤسسون', center: 'المركز' };
const inputClass = 'mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200';

function normalize(content: Record<string, unknown> | null): PricingContent {
  const value = { ...defaults, ...(content ?? {}) } as PricingContent;
  const tiers = Array.isArray(value.tiers) ? value.tiers : defaults.tiers;
  return { ...value, tiers: tiers.map((tier) => ({ ...tier, id: PLAN_IDS.includes(tier.id) ? tier.id : 'basic', title: String(tier.title ?? ''), monthly: String(tier.monthly ?? ''), yearly: String(tier.yearly ?? ''), note: String(tier.note ?? ''), features: Array.isArray(tier.features) ? tier.features.map(String) : [], highlighted: Boolean(tier.highlighted), buttonText: String(tier.buttonText ?? 'اشترك الآن 🚀') })) };
}

export default function PricingEditor({ initialContent, onClose, onSaved }: Props) {
  const [draft, setDraft] = useState<PricingContent>(() => normalize(initialContent));
  const update = (key: keyof Omit<PricingContent, 'tiers'>, value: string) => setDraft((current) => ({ ...current, [key]: value }));
  const updateTier = (index: number, key: keyof Tier, value: string | boolean | BillingTierId) => setDraft((current) => ({ ...current, tiers: current.tiers.map((tier, i) => i === index ? { ...tier, [key]: value } : tier) }));
  const updateFeature = (tierIndex: number, featureIndex: number, value: string) => setDraft((current) => ({ ...current, tiers: current.tiers.map((tier, i) => i === tierIndex ? { ...tier, features: tier.features.map((feature, j) => j === featureIndex ? value : feature) } : tier) }));

  const save = async () => {
    const response = await fetch('/api/admin/landing-page/pricing', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: draft }) });
    const body = await response.json().catch(() => null) as { error?: string; issues?: Array<{ path: string; message: string }> } | null;
    if (!response.ok) throw new Error(body?.issues?.map((issue) => `${issue.path}: ${issue.message}`).join('، ') || body?.error || 'تعذر حفظ قسم الأسعار');
    onSaved(draft);
  };

  const field = (key: keyof Omit<PricingContent, 'tiers'>, label: string, max = 300) => (
    <label className="block text-sm font-medium text-slate-700">{label}<input maxLength={max} value={draft[key]} onChange={(event) => update(key, event.target.value)} className={inputClass} /></label>
  );
  const previewCopy = { ...landingCopy, pricing: draft };
  const addableId = PLAN_IDS.find((id) => !draft.tiers.some((tier) => tier.id === id));

  return (
    <SectionEditorModal title="تحرير خطط الأسعار" description="الأسعار هنا نصوص عرض فقط؛ معرّفات الدفع تبقى مقيدة بخطط الفوترة المعتمدة حتى لا تتعطل عملية checkout." onClose={onClose} onSave={save} preview={<LandingContentProvider copy={previewCopy}><PricingSection /></LandingContentProvider>}>
      {field('title', 'عنوان القسم', 180)}
      {field('badge', 'الشارة أعلى العنوان', 160)}
      {field('highlightedLabel', 'شارة الباقة المميزة', 100)}
      <div className="grid gap-3 sm:grid-cols-2">{field('monthlyLabel', 'عنوان التبديل الشهري', 50)}{field('yearlyLabel', 'عنوان التبديل السنوي', 80)}</div>
      {field('yearlyNote', 'النص أسفل عنوان القسم')}
      <div className="grid gap-3 sm:grid-cols-2">{field('trialTitle', 'عنوان صندوق التجربة')}{field('trialDescription', 'وصف صندوق التجربة')}</div>
      <div className="grid gap-3 sm:grid-cols-2">{field('trialCta', 'زر التجربة', 80)}{field('footerText', 'النص أسفل الباقات')}</div>
      {field('footerLinkText', 'رابط النص أسفل الباقات', 100)}
      {draft.tiers.map((tier, index) => (
        <fieldset key={`${tier.id}-${index}`} className="space-y-3 rounded-2xl border border-slate-200 p-4">
          <legend className="px-2 text-sm font-semibold text-slate-800">الباقة {index + 1}</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm text-slate-700">الخطة المرتبطة بالاشتراك<select value={tier.id} onChange={(event) => updateTier(index, 'id', event.target.value as BillingTierId)} className={inputClass}>{PLAN_IDS.map((id) => <option key={id} value={id} disabled={draft.tiers.some((other, otherIndex) => otherIndex !== index && other.id === id)}>{PLAN_LABELS[id]} · {id}</option>)}</select></label>
            <label className="block text-sm text-slate-700">اسم الباقة<input maxLength={100} value={tier.title} onChange={(event) => updateTier(index, 'title', event.target.value)} className={inputClass} /></label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm text-slate-700">السعر الشهري الظاهر<input maxLength={30} value={tier.monthly} onChange={(event) => updateTier(index, 'monthly', event.target.value)} className={inputClass} /></label>
            <label className="block text-sm text-slate-700">السعر السنوي الظاهر<input maxLength={30} value={tier.yearly} onChange={(event) => updateTier(index, 'yearly', event.target.value)} className={inputClass} /></label>
          </div>
          <label className="block text-sm text-slate-700">ملاحظة الباقة<input maxLength={300} value={tier.note} onChange={(event) => updateTier(index, 'note', event.target.value)} className={inputClass} /></label>
          <label className="block text-sm text-slate-700">نص زر الاشتراك<input maxLength={100} value={tier.buttonText} onChange={(event) => updateTier(index, 'buttonText', event.target.value)} className={inputClass} /></label>
          <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={tier.highlighted} onChange={(event) => updateTier(index, 'highlighted', event.target.checked)} />تمييز هذه الباقة كموصى بها</label>
          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-700">مميزات الباقة</p>
            {tier.features.map((feature, featureIndex) => <div key={featureIndex} className="flex gap-2"><input maxLength={160} value={feature} onChange={(event) => updateFeature(index, featureIndex, event.target.value)} className={inputClass} /><button type="button" disabled={tier.features.length <= 1} onClick={() => setDraft((current) => ({ ...current, tiers: current.tiers.map((item, i) => i === index ? { ...item, features: item.features.filter((_, j) => j !== featureIndex) } : item) }))} className="mt-1 rounded-lg border border-red-200 px-3 text-sm text-red-600 disabled:opacity-40">حذف</button></div>)}
            <button type="button" disabled={tier.features.length >= 30} onClick={() => setDraft((current) => ({ ...current, tiers: current.tiers.map((item, i) => i === index ? { ...item, features: [...item.features, ''] } : item) }))} className="rounded-full border border-slate-300 px-3 py-1.5 text-xs text-slate-700 disabled:opacity-40">＋ ميزة</button>
          </div>
          <button type="button" disabled={draft.tiers.length <= 1} onClick={() => setDraft((current) => ({ ...current, tiers: current.tiers.filter((_, i) => i !== index) }))} className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-600 disabled:opacity-40">حذف الباقة</button>
        </fieldset>
      ))}
      <button type="button" disabled={!addableId || draft.tiers.length >= 3} onClick={() => addableId && setDraft((current) => ({ ...current, tiers: [...current.tiers, { id: addableId, title: '', monthly: '', yearly: '', note: '', features: [''], highlighted: false, buttonText: 'اشترك الآن 🚀' }] }))} className="rounded-full border border-violet-300 px-4 py-2 text-sm font-semibold text-violet-700 disabled:opacity-40">＋ إضافة باقة متاحة</button>
    </SectionEditorModal>
  );
}
