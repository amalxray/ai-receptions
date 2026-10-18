'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useState } from 'react';
import ImageCarousel from '@/components/public/ImageCarousel';
import PublicGalleryLightbox, { type LightboxMedia } from '@/components/public/PublicGalleryLightbox';
import BeforeAfterSlider from '@/components/public/BeforeAfterSlider';
import { Image, Maximize2, MoveUpRight, Sparkles, X } from 'lucide-react';

const gallery: LightboxMedia[] = [
  {
    id: 'receptionist-portrait',
    media_type: 'image',
    public_url: '/images/receptionist-avatar.png',
    title: 'رعاية واهتمام',
    caption: 'صورة محلية من ملفات المشروع.',
    alt_text: 'مراجعة في عيادة أسنان',
  },
  {
    id: 'ai-receptionist',
    media_type: 'image',
    public_url: '/brand/ai-receptionist.png',
    title: 'المساعدة الافتراضية',
    caption: 'صورة العلامة الموجودة في المشروع.',
    alt_text: 'مساعدة استقبال افتراضية بسماعة',
  },
  {
    id: 'clinic-space',
    media_type: 'image',
    public_url: 'https://images.unsplash.com/photo-1629909613654-28e377c37b09?auto=format&fit=crop&w=1400&q=85',
    title: 'مساحة عيادة هادئة',
    caption: 'مثال لصورة مكان داخل معرض العيادة.',
    alt_text: 'داخل عيادة أسنان عصرية',
  },
  {
    id: 'clinic-team',
    media_type: 'image',
    public_url: 'https://images.unsplash.com/photo-1606811971618-4486d14f3f99?auto=format&fit=crop&w=1400&q=85',
    title: 'فريق العيادة',
    caption: 'مرر أو اضغط لفتح الصورة بالحجم الكامل.',
    alt_text: 'فريق في عيادة أسنان',
  },
];

const masonryItems = [
  { src: '/images/receptionist-avatar.png', alt: 'مراجعة في عيادة أسنان', title: 'رعاية تبدأ بالاهتمام', size: 'row-span-2' },
  { src: '/brand/ai-receptionist.png', alt: 'مساعدة الاستقبال الافتراضية', title: 'استقبال ذكي', size: '' },
  { src: 'https://images.unsplash.com/photo-1629909613654-28e377c37b09?auto=format&fit=crop&w=1000&q=85', alt: 'عيادة أسنان عصرية', title: 'مساحة مريحة', size: '' },
  { src: '/images/receptionist-avatar.png', alt: 'صورة موظفة الاستقبال', title: 'فريق قريب منك', size: 'sm:col-span-2' },
];

const collageItems = [
  { id: 'care', src: '/images/receptionist-avatar.png', alt: 'مراجعة في عيادة أسنان', title: 'اهتمام بكل مراجع' },
  { id: 'assistant', src: '/brand/ai-receptionist.png', alt: 'مساعدة الاستقبال الافتراضية', title: 'مساعدة ذكية' },
  { id: 'clinic', src: 'https://images.unsplash.com/photo-1629909613654-28e377c37b09?auto=format&fit=crop&w=1000&q=85', alt: 'عيادة أسنان عصرية', title: 'مكان مريح' },
  { id: 'team', src: 'https://images.unsplash.com/photo-1606811971618-4486d14f3f99?auto=format&fit=crop&w=1000&q=85', alt: 'فريق في عيادة أسنان', title: 'فريق العيادة' },
];

const hotspots = [
  { id: 'welcome', x: '19%', y: '67%', title: 'استقبال مريح', description: 'نقطة ترحيب واضحة من أول زيارة.' },
  { id: 'care', x: '52%', y: '43%', title: 'رعاية متخصصة', description: 'اعرض خدمات العيادة قرب صورة الفريق.' },
  { id: 'booking', x: '79%', y: '69%', title: 'حجز سهل', description: 'اربط النقطة بزر الحجز أو تفاصيل الموعد.' },
];

export default function ImageMotionShowcase() {
  const reduceMotion = useReducedMotion();
  const [expandedCollageId, setExpandedCollageId] = useState<string | null>(null);
  const [activeHotspotId, setActiveHotspotId] = useState<string | null>(hotspots[0].id);
  const activeHotspot = hotspots.find((spot) => spot.id === activeHotspotId);

  return (
    <div className="space-y-8">
      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded-2xl border border-white/[0.07] bg-slate-950/50 p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-bold text-white"><Image size={16} className="text-cyan-200" /> شبكة Masonry</h3>
              <p className="mt-1 text-xs text-slate-500">صور بأحجام مختلفة، تكبر وتكشف العنوان عند المرور.</p>
            </div>
            <span className="rounded-full border border-cyan-200/10 bg-cyan-200/5 px-2.5 py-1 font-mono text-[9px] text-cyan-100/70">STAGGER + HOVER</span>
          </div>
          <div className="grid auto-rows-[120px] grid-cols-2 gap-3 sm:auto-rows-[145px]">
            {masonryItems.map((item, index) => (
              <motion.figure
                key={item.src}
                initial={reduceMotion ? false : { opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.15 }}
                transition={{ duration: 0.45, delay: reduceMotion ? 0 : index * 0.08 }}
                whileHover={reduceMotion ? undefined : { y: -4 }}
                className={`group relative overflow-hidden rounded-xl border border-white/10 bg-slate-900 ${item.size}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.src} alt={item.alt} className="h-full w-full object-cover transition duration-700 ease-out group-hover:scale-110" />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/5 to-transparent opacity-80 transition-opacity group-hover:opacity-100" />
                <figcaption className="absolute inset-x-0 bottom-0 flex translate-y-1 items-end justify-between p-3 transition-transform group-hover:translate-y-0">
                  <span className="text-xs font-semibold text-white">{item.title}</span>
                  <MoveUpRight size={14} className="text-cyan-100 opacity-0 transition group-hover:opacity-100" />
                </figcaption>
              </motion.figure>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-white/[0.07] bg-slate-950/50 p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-bold text-white"><Sparkles size={16} className="text-violet-200" /> معرض يتحول إلى نافذة</h3>
              <p className="mt-1 text-xs text-slate-500">اضغط صورة لتتمدد بسلاسة إلى عرض التفاصيل.</p>
            </div>
            <span className="rounded-full border border-violet-200/10 bg-violet-200/5 px-2.5 py-1 font-mono text-[9px] text-violet-100/70">SHARED LAYOUT</span>
          </div>
          <PublicGalleryLightbox media={gallery} gapClassName="gap-3" />
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-2xl border border-white/[0.07] bg-slate-950/50 p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-bold text-white"><Image size={16} className="text-rose-200" /> كولاج يعيد ترتيب نفسه</h3>
              <p className="mt-1 text-xs text-slate-500">اضغط صورة لتكبر، والبقية تتحرك لتصنع تكوينًا جديدًا.</p>
            </div>
            <span className="rounded-full border border-rose-200/10 bg-rose-200/5 px-2.5 py-1 font-mono text-[9px] text-rose-100/70">LAYOUT SPRING</span>
          </div>
          <div className="grid auto-rows-[112px] grid-cols-2 gap-2.5 sm:auto-rows-[132px]" aria-label="كولاج صور تفاعلي">
            {collageItems.map((item, index) => {
              const isExpanded = expandedCollageId === item.id;
              return (
                <motion.button
                  key={item.id}
                  type="button"
                  layout
                  onClick={() => setExpandedCollageId(isExpanded ? null : item.id)}
                  aria-pressed={isExpanded}
                  transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 260, damping: 28 }}
                  className={`group relative overflow-hidden rounded-xl border text-right ${isExpanded ? 'col-span-2 row-span-2 border-rose-200/50' : 'border-white/10'}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.src} alt={item.alt} className={`h-full w-full object-cover transition duration-500 ${isExpanded ? 'scale-100' : 'group-hover:scale-105'}`} />
                  <span className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent" />
                  <span className={`absolute bottom-2 right-2 font-semibold text-white ${isExpanded ? 'text-sm' : 'text-[10px] sm:text-xs'}`}>{item.title}</span>
                  {isExpanded && <span className="absolute left-2 top-2 rounded-full bg-black/45 px-2 py-1 text-[9px] text-white">اضغط لإعادة الترتيب</span>}
                  {!expandedCollageId && <span className="absolute left-2 top-2 rounded-full bg-black/45 px-2 py-1 text-[9px] text-white">{index + 1}</span>}
                </motion.button>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-white/[0.07] bg-slate-950/50 p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-bold text-white"><Sparkles size={16} className="text-amber-200" /> نقاط معلومات فوق الصورة</h3>
              <p className="mt-1 text-xs text-slate-500">اضغط النقاط لتبديل المعلومات المرتبطة بمكانها.</p>
            </div>
            <span className="rounded-full border border-amber-200/10 bg-amber-200/5 px-2.5 py-1 font-mono text-[9px] text-amber-100/70">IMAGE HOTSPOTS</span>
          </div>
          <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-white/10 bg-slate-900 sm:aspect-[16/10]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="https://images.unsplash.com/photo-1629909613654-28e377c37b09?auto=format&fit=crop&w=1400&q=85" alt="مساحة عيادة أسنان" className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-slate-950/15" />
            {hotspots.map((spot) => {
              const isActive = activeHotspotId === spot.id;
              return (
                <button
                  key={spot.id}
                  type="button"
                  onClick={() => setActiveHotspotId(isActive ? null : spot.id)}
                  aria-label={spot.title}
                  aria-expanded={isActive}
                  className="absolute z-10 grid h-10 w-10 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white/70 bg-cyan-300/90 text-slate-950 shadow-[0_0_28px_rgba(103,232,249,0.55)] transition hover:scale-110"
                  style={{ left: spot.x, top: spot.y }}
                >
                  <span className="absolute inset-0 animate-ping rounded-full bg-cyan-200/40" />
                  <span className="relative text-lg leading-none">+</span>
                </button>
              );
            })}
            <AnimatePresence mode="wait">
              {activeHotspot && (
                <motion.div
                  key={activeHotspot.id}
                  initial={reduceMotion ? false : { opacity: 0, y: 8, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={reduceMotion ? undefined : { opacity: 0, y: -5, scale: 0.98 }}
                  transition={{ duration: reduceMotion ? 0 : 0.2 }}
                  className="absolute bottom-3 left-3 right-3 z-20 rounded-xl border border-white/20 bg-slate-950/80 p-3 text-right shadow-xl backdrop-blur-xl sm:bottom-4 sm:left-4 sm:right-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div><h4 className="text-xs font-bold text-white">{activeHotspot.title}</h4><p className="mt-1 text-[10px] leading-5 text-slate-300">{activeHotspot.description}</p></div>
                    <button type="button" aria-label="إغلاق المعلومة" onClick={() => setActiveHotspotId(null)} className="rounded-full p-1 text-slate-300 transition hover:bg-white/10 hover:text-white"><X size={14} /></button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-2xl border border-white/[0.07] bg-slate-950/50 p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-bold text-white"><Maximize2 size={16} className="text-emerald-200" /> Carousel بالسحب</h3>
              <p className="mt-1 text-xs text-slate-500">اسحب الصورة أو استخدم الأسهم؛ اضغطها لفتح العرض الكامل.</p>
            </div>
            <span className="rounded-full border border-emerald-200/10 bg-emerald-200/5 px-2.5 py-1 font-mono text-[9px] text-emerald-100/70">DRAG + LIGHTBOX</span>
          </div>
          <ImageCarousel media={gallery} />
        </div>

        <div className="rounded-2xl border border-white/[0.07] bg-slate-950/50 p-4 sm:p-5">
          <div className="mb-4">
            <h3 className="text-sm font-bold text-white">مقارنة قبل وبعد</h3>
            <p className="mt-1 text-xs text-slate-500">حرّك الفاصل لكشف الصورتين. مثال توضيحي للمعاينة.</p>
          </div>
          <BeforeAfterSlider
            before="https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?auto=format&fit=crop&w=1000&q=85"
            after="https://images.unsplash.com/photo-1606811971618-4486d14f3f99?auto=format&fit=crop&w=1000&q=85"
            title="شكل تفاعلي لمقارنة صورتين"
          />
        </div>
      </div>

      <p className="text-[10px] leading-5 text-slate-600">المعرض يستخدم مكونات الصور الموجودة في components/public. بعض الصور المحلية، وأمثلة الصور الخارجية تحتاج اتصال إنترنت.</p>
    </div>
  );
}
