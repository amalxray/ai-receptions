'use client';

import { useCallback, useState } from 'react';
import { usePWAInstall } from '@/hooks/usePWAInstall';

/**
 * "أضف للشاشة" — install button that hides itself forever once the app is
 * installed (see `usePWAInstall` for the detection rules).
 *
 * Variants:
 *  • `inline`   → compact pill for headers / toolbars (/ask, dashboard).
 *  • `floating` → bottom banner with a dismiss ✕ for public pages; it sits
 *                 above the floating chat/WhatsApp bubbles.
 *
 * iOS has no `beforeinstallprompt`, so Android shows the native prompt while
 * Safari gets the Share ▸ Add to Home Screen walkthrough.
 */
export type InstallPWAProps = {
  variant?: 'inline' | 'floating';
  label?: string;
  className?: string;
};

export default function InstallPWA({
  variant = 'inline',
  label = '📱 أضف للشاشة',
  className,
}: InstallPWAProps) {
  const {
    mounted,
    shouldShow,
    isIOS,
    canPromptNatively,
    install,
    dismiss,
    showIOSHelp,
    openIOSHelp,
    closeIOSHelp,
  } = usePWAInstall();
  const [busy, setBusy] = useState(false);

  const handleInstall = useCallback(async () => {
    // iOS never fires `beforeinstallprompt` → guide the visitor instead.
    if (isIOS && !canPromptNatively) {
      openIOSHelp();
      return;
    }
    setBusy(true);
    try {
      await install();
    } finally {
      setBusy(false);
    }
  }, [canPromptNatively, install, isIOS, openIOSHelp]);

  if (!mounted || !shouldShow) return null;

  const pill = (
    <button
      type="button"
      onClick={handleInstall}
      disabled={busy}
      className={`inline-flex min-h-[40px] touch-manipulation items-center justify-center gap-2 rounded-full border border-emerald-400/40 bg-emerald-500/10 px-4 py-2 text-xs font-bold text-emerald-200 transition hover:border-emerald-400 hover:bg-emerald-500/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-60 ${className ?? ''}`}
    >
      {busy ? 'جارٍ التثبيت…' : label}
    </button>
  );

  if (variant === 'inline') {
    return (
      <>
        {pill}
        {showIOSHelp && <IOSInstallHelp onClose={closeIOSHelp} />}
      </>
    );
  }

  return (
    <>
      <div
        dir="rtl"
        className={`fixed inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-emerald-400/30 bg-slate-900/95 p-3 text-right shadow-2xl shadow-emerald-950/40 backdrop-blur sm:left-auto sm:right-6 ${className ?? ''}`}
      >
        <span aria-hidden className="text-2xl">📱</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-white">ثبّت AI-Receptions على شاشتك</p>
          <p className="mt-0.5 truncate text-xs text-slate-300">
            وصول أسرع بلمسة واحدة، ويعمل حتى بدون إنترنت.
          </p>
        </div>
        <button
          type="button"
          onClick={handleInstall}
          disabled={busy}
          className="shrink-0 rounded-full bg-emerald-500 px-4 py-2 text-xs font-bold text-white transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? 'جارٍ…' : 'أضف للشاشة'}
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="إخفاء زر التثبيت"
          className="shrink-0 rounded-full px-2 py-1 text-slate-400 transition hover:bg-white/10 hover:text-white"
        >
          ✕
        </button>
      </div>
      {showIOSHelp && <IOSInstallHelp onClose={closeIOSHelp} />}
    </>
  );
}

/** iOS only — Safari exposes no install API, so the steps are shown visually. */
function IOSInstallHelp({ onClose }: { onClose: () => void }) {
  const steps = [
    { icon: '⬆️', title: 'اضغط زر المشاركة', text: 'في شريط Safari السفلي — أيقونة المربع مع سهم للأعلى.' },
    { icon: '➕', title: 'اختر «إضافة إلى الشاشة الرئيسية»', text: 'اسحب قائمة المشاركة للأسفل حتى تجد الخيار.' },
    { icon: '✅', title: 'اضغط «إضافة»', text: 'سيظهر التطبيق كأيقونة على شاشة هاتفك مباشرة.' },
  ];
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="تعليمات تثبيت التطبيق على iPhone"
      className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/70 p-4 backdrop-blur-sm sm:items-center"
    >
      <div dir="rtl" className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-5 text-right shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-black text-white">أضف التطبيق إلى شاشة iPhone</h2>
            <p className="mt-1 text-xs text-slate-400">ثلاث خطوات فقط من متصفح Safari.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق التعليمات"
            className="shrink-0 rounded-full bg-white/5 px-3 py-1 text-slate-300 transition hover:bg-white/10 hover:text-white"
          >
            ✕
          </button>
        </div>
        <ol className="mt-4 space-y-3">
          {steps.map((step, i) => (
            <li key={step.title} className="flex items-start gap-3 rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
              <span className="text-xl" aria-hidden>{step.icon}</span>
              <div>
                <p className="text-sm font-bold text-slate-100">
                  {i + 1}. {step.title}
                </p>
                <p className="mt-0.5 text-xs leading-5 text-slate-400">{step.text}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-3 rounded-xl bg-amber-500/10 p-3 text-xs leading-5 text-amber-200">
          ملاحظة: إذا فتحت الرابط من Chrome أو فيسبوك على iPhone، افتحه أولًا في Safari — فمتصفح iOS لا يسمح بالإضافة إلى الشاشة الرئيسية.
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-full bg-emerald-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-400"
        >
          فهمت، شكرًا
        </button>
      </div>
    </div>
  );
}

