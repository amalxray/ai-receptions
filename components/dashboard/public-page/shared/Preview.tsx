'use client';

import React from 'react';
import type { DisplaySettings } from './types';

const TEXT_PX: Record<string, string> = {
  small: 'text-xs',
  medium: 'text-sm',
  large: 'text-base',
};

const HEAD_PX: Record<string, string> = {
  small: 'text-sm',
  medium: 'text-lg',
  large: 'text-2xl',
};

const MEDIA_H: Record<string, string> = {
  small: 'h-10',
  medium: 'h-16',
  large: 'h-24',
};

const GAP: Record<string, string> = {
  compact: 'gap-1',
  normal: 'gap-2',
  roomy: 'gap-4',
};

/**
 * Preview مصغّرة (ب2): تعكس قيم display فورًا عبر re-render.
 * بصري فقط — لا منطق حفظ.
 */
export default function Preview({ display }: { display: Partial<DisplaySettings> | undefined }) {
  const d = display ?? {};
  const titleCls = HEAD_PX[d.section_title ?? 'medium'] ?? HEAD_PX.medium;
  const headCls = HEAD_PX[d.heading ?? 'medium'] ?? HEAD_PX.medium;
  const textCls = TEXT_PX[d.body_text ?? 'medium'] ?? TEXT_PX.medium;
  const imgCls = MEDIA_H[d.image_size ?? 'medium'] ?? MEDIA_H.medium;
  const vidCls = MEDIA_H[d.video_size ?? 'medium'] ?? MEDIA_H.medium;
  const gapCls = GAP[d.gallery_spacing ?? 'normal'] ?? GAP.normal;

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4 transition-all duration-200 hover:border-cyan-400/50 hover:shadow-[0_0_20px_rgba(34,211,238,0.15)]">
      <p className="mb-2 text-xs font-medium text-slate-500">معاينة مباشرة</p>
      <div className={`flex flex-col ${gapCls}`}>
        <p className={`font-bold text-slate-100 ${titleCls}`}>عنوان القسم</p>
        <p className={`font-semibold text-slate-200 ${headCls}`}>عنوان رئيسي</p>
        <p className={`text-slate-400 ${textCls}`}>نص تجريبي يعكس حجم النص المختار في الصفحة العامة.</p>
        <div className="flex items-center gap-2">
          <div className={`flex-1 rounded-lg bg-gradient-to-l from-cyan-500/30 to-emerald-500/20 ${imgCls}`} aria-hidden="true" />
          <div className={`flex-1 rounded-lg bg-gradient-to-l from-violet-500/30 to-cyan-500/20 ${vidCls}`} aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}
