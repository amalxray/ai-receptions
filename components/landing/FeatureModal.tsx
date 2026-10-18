'use client';

import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Link from 'next/link';
import { CheckCircle2, TrendingUp, X, type LucideIcon } from 'lucide-react';

export type FeatureDetail = {
  points: string[];
  roi: string;
  visualCaption: string;
};

export const FEATURE_DETAILS: FeatureDetail[] = [
  {
    points: [
      'موظفة استقبال رقمية ترد على المرضى 24/7 باللهجة العامية — لا مكالمات فائتة بعد الدوام.',
      'تحجز الموعد مباشرة في تقويم العيادة مع تأكيد فوري، بدون تدخل يدوي.',
      'تجمع الأعراض قبل الموعد وتصنّف الحالات الطارئة للتحويل الفوري.',
    ],
    roi: '+40% حجوزات خلال الشهر الأول، و−70% مكالمات فائتة.',
    visualCaption: 'محادثة حجز تلقائية — 24/7',
  },
  {
    points: [
      'ارفع صور الأشعة مباشرة من مركز التصوير إلى ملف المريض — بدون أقراص CD أو واتساب.',
      'أرشفة الصور البانورامية والمقطعية (DICOM حتى 2 جيجابايت) في ملف واحد.',
      'وصول فوري للطبيب لصورة المريض قبل دخوله العيادة.',
    ],
    roi: 'توفير حتى 20 ساعة أسبوعياً من البحث عن الملفات والأقراص.',
    visualCaption: 'ملف المريض + أرشيف الأشعة',
  },
  {
    points: [
      'فواتير إلكترونية مع رصيد مستحق لكل مريض وتحصيل مباشر.',
      'مدفوعات Stripe (دولي) وLahza (محلي) مع سجل كامل.',
      'مصروفات وتقارير ربح وخسارة، ورواتب بكشوف قابلة للطباعة.',
    ],
    roi: 'تحصيل أسرع، ورواتب بلا أخطاء، وقرارات مبنية على أرقام.',
    visualCaption: 'الفواتير والرواتب والتقارير',
  },
  {
    points: [
      'ربط واتساب: تذكير بالمواعيد، استدعاء المرضى، وقوالب عدم الحضور.',
      'مزامنة المواعيد مع تقويم جوجل — جدولك دائماً محدث.',
      'إشعارات تلقائية تقلل الغياب بدون مجهود من السكرتارية.',
    ],
    roi: 'انخفاض الغياب حتى −70% مع التذكير التلقائي.',
    visualCaption: 'واتساب + تقويم جوجل — مزامنة تلقائية',
  },
  {
    points: [
      'صفحة عامة احترافية لعيادتك تعرض الخدمات والمواعيد.',
      'كود QR قابل للطباعة يُلصق في العيادة ويجلب مرضى جدد.',
      'صفحة تقييمات المرضى ومعرض قبل/بعد يبنيان الثقة.',
    ],
    roi: 'قناة تسويق مجانية: كل مريض راضٍ يجلب مريضاً جديداً.',
    visualCaption: 'صفحة العيادة + QR + التقييمات',
  },
  {
    points: [
      'عزل كامل بين العيادات — كل عيادة ترى بياناتها فقط.',
      'تشفير رموز الحجز ومفاتيح التكامل، وصلاحيات مبنية على العضوية.',
      'نطاقات فرعية خاصة لكل عيادة.',
    ],
    roi: 'ثقة المرضى والتزام كامل بخصوصية البيانات الصحية.',
    visualCaption: 'عزل وتشفير على مستوى المؤسسات',
  },
];

const FALLBACK_DETAIL: FeatureDetail = {
  points: ['تفاصيل إضافية قريباً.'],
  roi: '',
  visualCaption: 'معاينة الميزة',
};

type FeatureModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  desc: string;
  Icon: LucideIcon;
  iconClassName?: string;
  detailIndex?: number;
};

export default function FeatureModal({ open, onClose, title, desc, Icon, iconClassName, detailIndex }: FeatureModalProps) {
  const d = FEATURE_DETAILS[detailIndex ?? -1] ?? FALLBACK_DETAIL;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
          aria-label={title}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            dir="rtl"
            className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-white/10 bg-slate-950/90 text-white shadow-2xl backdrop-blur-xl"
          >
            <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-l from-cyan-500/20 via-violet-500/15 to-transparent blur-2xl" />
            <button
              type="button"
              onClick={onClose}
              aria-label="إغلاق"
              className="absolute left-4 top-4 grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10 hover:text-white"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>

            <div className="relative p-6 md:p-8">
              <div className={`grid h-16 w-16 place-items-center rounded-2xl ${iconClassName ?? 'bg-cyan-500/15 text-cyan-300'}`}>
                <Icon className="h-8 w-8" aria-hidden="true" />
              </div>
              <h3 className="mt-5 text-2xl font-black">{title}</h3>
              <p className="mt-2 leading-7 text-slate-400">{desc}</p>

              <div aria-hidden="true" className="mt-6 flex h-36 items-center justify-center gap-3 overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-cyan-500/15 via-slate-900 to-violet-500/15">
                <Icon className="h-12 w-12 text-cyan-300/70" aria-hidden="true" />
                <span className="text-sm font-semibold text-slate-300">{d.visualCaption}</span>
              </div>

              <ul className="mt-6 space-y-3">
                {d.points.map((point) => (
                  <li key={point} className="flex items-start gap-2.5 text-[15px] leading-7 text-slate-200">
                    <CheckCircle2 className="mt-1.5 h-5 w-5 shrink-0 text-emerald-400" aria-hidden="true" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>

              {d.roi && (
                <div className="mt-6 flex items-start gap-2.5 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4">
                  <TrendingUp className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" aria-hidden="true" />
                  <p className="text-sm font-bold leading-6 text-emerald-200">{d.roi}</p>
                </div>
              )}

              <Link
                href="/register"
                className="mt-6 block rounded-2xl bg-gradient-to-l from-cyan-500 to-violet-500 px-6 py-3.5 text-center text-base font-black text-white shadow-lg shadow-cyan-500/25 transition hover:brightness-110"
              >
                جربها الآن مجاناً
              </Link>
              <button type="button" onClick={onClose} className="mt-3 w-full text-center text-sm font-semibold text-slate-400 transition hover:text-slate-200">
                متابعة التصفح
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
