'use client';

import React from 'react';

import Section from './shared/Section';
import PublicMediaManager from '@/components/dashboard/clinic/PublicMediaManager';
import type { PageConfig, UpdateFn, ReloadFn } from './shared/types';

type Props = { config: PageConfig; update: UpdateFn; load: ReloadFn };

const SIZE_ROWS = [
  ['body_text', 'حجم النص'],
  ['heading', 'حجم العناوين'],
  ['section_title', 'حجم عناوين الأقسام'],
  ['image_size', 'حجم الصور'],
  ['video_size', 'حجم الفيديو'],
  ['gallery_spacing', 'تباعد المعرض'],
] as const;

/** Appearance tab (moved verbatim): display sizes + cover/news + media. */
export default function AppearanceTab({ config, update, load }: Props) {
  return (
    <div className="space-y-4">
      <Section title="مقاسات العرض" subtitle="تحكم في حجم النصوص والصور والفيديو في صفحتك العامة. القيم محدودة وآمنة ولا تؤثر على البنية.">
        <div className="grid gap-3 sm:grid-cols-2">
          {SIZE_ROWS.map(([key, label]) => (
            <label key={key} className="block">
              <span className="mb-1 block text-sm font-medium text-slate-400">{label}</span>
              <select
                value={config.display?.[key] ?? (key === 'gallery_spacing' ? 'normal' : 'medium')}
                onChange={(e) => void update({ display: { [key]: e.target.value } }).then(() => load())}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 hover:border-slate-600 focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-500/50"
              >
                {(['small', 'medium', 'large'] as const).map((v) => (
                  <option key={v} value={v}>
                    {v === 'small' ? 'صغير' : v === 'large' ? 'كبير' : 'متوسط'}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </Section>
      <AppearanceCoverNews config={config} update={update} />
      <PublicMediaManager />
    </div>
  );
}

function AppearanceCoverNews({ config, update }: { config: PageConfig; update: UpdateFn }) {
  return (
    <Section title="الغلاف وشريط الأخبار" subtitle="وضوح صورة الغلاف وموقعها وإزاحتها، وحجم شريط الأخبار وخطه — تطبيق فوري على الصفحة العامة.">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-400">
            ارتفاع الغلاف — {config.display?.cover_height ?? 384}px
          </span>
          <input type="range" min={200} max={800} step={10}
            value={config.display?.cover_height ?? 384}
            onChange={(e) => void update({ display: { cover_height: Number(e.target.value) } })}
            className="w-full accent-cyan-600" />
          <span className="text-xs text-slate-500">من 200 إلى 800 بكسل</span>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-400">طريقة عرض الغلاف</span>
          <select value={config.display?.cover_fit ?? 'cover'}
            onChange={(e) => void update({ display: { cover_fit: e.target.value } })}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 hover:border-slate-600 focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-500/50">
            <option value="cover">قص (يملأ المساحة)</option>
            <option value="contain">كامل (تظهر الصورة كاملة)</option>
          </select>
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-sm font-medium text-slate-400">
            وضوح صورة الغلاف — {config.display?.cover_blur ?? 0}px (0 = واضحة تماماً)
          </span>
          <input type="range" min={0} max={20} step={1}
            value={config.display?.cover_blur ?? 0}
            onChange={(e) => void update({ display: { cover_blur: Number(e.target.value) } })}
            className="w-full accent-cyan-600" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-400">موقع صورة الغلاف</span>
          <select value={config.display?.cover_position ?? 'center'}
            onChange={(e) => void update({ display: { cover_position: e.target.value } })}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 hover:border-slate-600 focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-500/50">
            <option value="center">وسط</option>
            <option value="top">أعلى</option>
            <option value="bottom">أسفل</option>
            <option value="left">يسار</option>
            <option value="right">يمين</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-400">
            إزاحة عمودية (%) — {config.display?.cover_offset_y ?? 50}%
          </span>
          <input type="range" min={0} max={100} step={5}
            value={config.display?.cover_offset_y ?? 50}
            onChange={(e) => void update({ display: { cover_offset_y: Number(e.target.value) } })}
            className="w-full accent-cyan-600" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-400">حجم شريط الأخبار</span>
          <select value={config.display?.news_height ?? 'md'}
            onChange={(e) => void update({ display: { news_height: e.target.value } })}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 hover:border-slate-600 focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-500/50">
            <option value="xs">صغير جداً</option>
            <option value="sm">صغير</option>
            <option value="md">متوسط</option>
            <option value="lg">كبير</option>
            <option value="xl">كبير جداً</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-400">حجم خط شريط الأخبار</span>
          <select value={config.display?.news_font ?? 'base'}
            onChange={(e) => void update({ display: { news_font: e.target.value } })}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 hover:border-slate-600 focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-500/50">
            <option value="sm">صغير</option>
            <option value="base">عادي</option>
            <option value="lg">كبير</option>
            <option value="xl">كبير جداً</option>
            <option value="2xl">ضخم</option>
          </select>
        </label>
      </div>
    </Section>
  );
}
