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
 * `appName` is the identity shown to the visitor: the CLINIC's name on a tenant
 * space (`/{slug}`, owned by the page), the platform name everywhere else.
 *
 * iOS has no `beforeinstallprompt`, and Apple allows "Add to Home Screen" in
 * Safari ONLY. Android therefore gets the native prompt while iPhone gets a
 * Share-sheet walkthrough — and, inside Facebook/Instagram/WhatsApp, the
 * "open it in Safari first" step, which is where the option silently vanishes.
 */
export type InstallPWAProps = {
  variant?: 'inline' | 'floating';
  label?: string;
  /** App identity in the banner/instructions (clinic name on tenant pages). */
  appName?: string;
  className?: string;
};

/** Platform fallback — matches the root metadata's `applicationName`. */
const DEFAULT_APP_NAME = 'AI-Receptions';

export default function InstallPWA({
  variant = 'inline',
  label = '📱 أضف للشاشة',
  appName = DEFAULT_APP_NAME,
  className,
}: InstallPWAProps) {
  const {
    mounted,
    shouldShow,
    isIOS,
    /** Non-null inside an in-app browser (فيسبوك/إنستغرام/واتساب…). */
    inAppBrowser,
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
        {showIOSHelp && (
          <IOSInstallHelp appName={appName} inAppBrowser={inAppBrowser} onClose={closeIOSHelp} />
        )}
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
          <p className="truncate text-sm font-bold text-white">ثبّت «{appName}» على شاشتك</p>
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
      {showIOSHelp && (
        <IOSInstallHelp appName={appName} inAppBrowser={inAppBrowser} onClose={closeIOSHelp} />
      )}
    </>
  );
}

/**
 * iOS only — Safari exposes no install API at all, so the steps are shown
 * visually. Apple deliberately keeps "Add to Home Screen" inside Safari, which is
 * why the walkthrough starts by getting the visitor into a browser that has it
 * (with a copy-link action instead of leaving them stuck in a webview).
 */
function IOSInstallHelp({
  appName,
  inAppBrowser,
  onClose,
}: {
  appName: string;
  /** Friendly name of the in-app browser, or null in a real browser. */
  inAppBrowser: string | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  /** Webviews can block the clipboard — a failed copy must not look like success. */
  const copyLink = useCallback(async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 4000);
    } catch {
      setCopied(false);
    }
  }, []);

  const steps = [
    {
      icon: '🧭',
      title: 'افتح الصفحة في Safari',
      text: inAppBrowser
        ? `أنت داخل ${inAppBrowser}، وهذا التطبيق لا يسمح بالإضافة إلى الشاشة الرئيسية. اضغط زر المشاركة ثم «فتح في Safari»، أو انسخ الرابط والصقه في Safari.`
        : 'إن فتحت الرابط من Chrome أو أي تطبيق آخر على iPhone، افتحه في Safari — فمتصفح iOS لا يسمح بالإضافة إلى الشاشة الرئيسية.',
    },
    {
      icon: '⬆️',
      title: 'اضغط زر المشاركة (Share)',
      text: 'المربّع الذي فيه سهم للأعلى في شريط Safari السفلي، بجانب شريط العنوان.',
    },
    {
      icon: '➕',
      title: 'اختر «إضافة إلى الشاشة الرئيسية»',
      text: 'اسحب قائمة المشاركة للأسفل حتى يظهر الخيار، ثم اضغط عليه.',
    },
    {
      icon: '✅',
      title: 'اضغط «إضافة»',
      text: `ستظهر أيقونة «${appName}» على شاشة هاتفك وتُفتح كتطبيق مستقل بدون شريط المتصفح.`,
    },
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
            <h2 className="text-base font-black text-white">أضف «{appName}» إلى شاشة iPhone</h2>
            <p className="mt-1 text-xs text-slate-400">
              {inAppBrowser ? 'الخيار مخفي في هذا المتصفح — أربع خطوات من Safari.' : 'أربع خطوات سريعة من Safari.'}
            </p>
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
          ملاحظة: Apple لا تسمح لأي موقع بإظهار نافذة تثبيت تلقائية على iPhone (بخلاف أندرويد)،
          فالإضافة إلى الشاشة تبقى يدوية من قائمة المشاركة — هذا طبيعي وليس خللًا في الموقع.
        </p>
        {inAppBrowser && (
          <button
            type="button"
            onClick={copyLink}
            className="mt-3 w-full rounded-full border border-emerald-400/40 bg-emerald-500/10 px-4 py-2.5 text-sm font-bold text-emerald-200 transition hover:border-emerald-400 hover:bg-emerald-500/20"
          >
            {copied ? '✅ تم نسخ الرابط — افتحه الآن في Safari' : '📋 انسخ الرابط لفتحه في Safari'}
          </button>
        )}
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

