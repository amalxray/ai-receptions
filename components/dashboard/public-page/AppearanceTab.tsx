'use client';

import React from 'react';

import Section from './shared/Section';
import Segmented from './shared/Segmented';
import Preview from './shared/Preview';
import PublicMediaManager from '@/components/dashboard/clinic/PublicMediaManager';
import type { PageConfig, UpdateFn, ReloadFn } from './shared/types';

type Props = { config: PageConfig; update: UpdateFn; load: ReloadFn };

export const SIZE_LABELS: Record<string, string> = {
  small: 'صغير',
  medium: 'متوسط',
  large: 'كبير',
};

const SIZE_OPTS = [
  { value: 'small', label: 'صغير' },
  { value: 'medium', label: 'متوسط' },
  { value: 'large', label: 'كبير' },
] as const;

const GALLERY_SPACING_OPTS = [
  { value: 'compact', label: 'مضغوط' },
  { value: 'normal', label: 'عادي' },
  { value: 'roomy', label: 'واسع' },
] as const;

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
        <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
          <div className="grid content-start gap-4 sm:grid-cols-2">
          {SIZE_ROWS.map(([key, label]) => (
            <Segmented
              key={key}
              groupId={`size-${key}`}
              label={label}
              value={config.display?.[key] ?? (key === 'gallery_spacing' ? 'normal' : 'medium')}
              options={key === 'gallery_spacing' ? [...GALLERY_SPACING_OPTS] : [...SIZE_OPTS]}
              onChange={(v) => void update({ display: { [key]: v } })}
            />
          ))}
          </div>
          <div className="lg:sticky lg:top-4 lg:self-start">
            <Preview display={config.display} />
          </div>
        </div>
      </Section>
      <AppearanceCoverNews config={config} update={update} />
      <PublicMediaManager />
    </div>
  );
}

const COVER_HEIGHT_OPTS = [
  { value: 400, label: 'قصير', hint: '400' },
  { value: 600, label: 'متوسط', hint: '600' },
  { value: 790, label: 'طويل', hint: '790' },
  { value: 800, label: 'طويل جدًا', hint: '800' },
] as const;

const COVER_BLUR_OPTS = [
  { value: 0, label: 'واضح', hint: '0' },
  { value: 5, label: 'ناعم', hint: '5' },
  { value: 10, label: 'ضبابي', hint: '10' },
  { value: 20, label: 'ضبابي جدًا', hint: '20' },
] as const;

const OFFSET_Y_OPTS = [
  { value: 0, label: 'أعلى', hint: '0%' },
  { value: 50, label: 'وسط', hint: '50%' },
  { value: 100, label: 'أسفل', hint: '100%' },
] as const;

function AppearanceCoverNews({ config, update }: { config: PageConfig; update: UpdateFn }) {
  return (
    <Section title="الغلاف وشريط الأخبار" subtitle="وضوح صورة الغلاف وموقعها وإزاحتها، وحجم شريط الأخبار وخطه — تطبيق فوري على الصفحة العامة.">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Segmented
            groupId="cover-height"
            label={`ارتفاع الغلاف — ${config.display?.cover_height ?? 384}px`}
            value={config.display?.cover_height ?? 384}
            options={[...COVER_HEIGHT_OPTS]}
            onChange={(v) => void update({ display: { cover_height: v } })}
          />
        </div>
        <Segmented
          groupId="cover-fit"
          label="طريقة عرض الغلاف"
          value={config.display?.cover_fit ?? 'cover'}
          options={[
            { value: 'cover', label: 'قص (يملأ المساحة)' },
            { value: 'contain', label: 'كامل (تظهر الصورة كاملة)' },
          ]}
          onChange={(v) => void update({ display: { cover_fit: v } })}
        />
        <div className="sm:col-span-2">
          <Segmented
            groupId="cover-blur"
            label={`وضوح صورة الغلاف — ${config.display?.cover_blur ?? 0}px (0 = واضحة تمامًا)`}
            value={config.display?.cover_blur ?? 0}
            options={[...COVER_BLUR_OPTS]}
            onChange={(v) => void update({ display: { cover_blur: v } })}
          />
        </div>
        <Segmented
          groupId="cover-position"
          label="موقع صورة الغلاف"
          value={config.display?.cover_position ?? 'center'}
          options={[
            { value: 'center', label: 'وسط' },
            { value: 'top', label: 'أعلى' },
            { value: 'bottom', label: 'أسفل' },
            { value: 'left', label: 'يسار' },
            { value: 'right', label: 'يمين' },
          ]}
          onChange={(v) => void update({ display: { cover_position: v } })}
        />
        <Segmented
          groupId="cover-offset"
          label={`إزاحة عمودية — ${config.display?.cover_offset_y ?? 50}%`}
          value={config.display?.cover_offset_y ?? 50}
          options={[...OFFSET_Y_OPTS]}
          onChange={(v) => void update({ display: { cover_offset_y: v } })}
        />
        <Segmented
          groupId="news-height"
          label="حجم شريط الأخبار"
          value={config.display?.news_height ?? 'md'}
          options={[
            { value: 'xs', label: 'صغير جدًا' },
            { value: 'sm', label: 'صغير' },
            { value: 'md', label: 'متوسط' },
            { value: 'lg', label: 'كبير' },
            { value: 'xl', label: 'كبير جدًا' },
          ]}
          onChange={(v) => void update({ display: { news_height: v } })}
        />
        <Segmented
          groupId="news-font"
          label="حجم خط شريط الأخبار"
          value={config.display?.news_font ?? 'base'}
          options={[
            { value: 'sm', label: 'صغير' },
            { value: 'base', label: 'عادي' },
            { value: 'lg', label: 'كبير' },
            { value: 'xl', label: 'كبير جدًا' },
            { value: '2xl', label: 'ضخم' },
          ]}
          onChange={(v) => void update({ display: { news_font: v } })}
        />
      </div>
    </Section>
  );
}
