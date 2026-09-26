'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

/**
 * PWA install detection — the single source of truth for the "أضف للشاشة"
 * button. Covers both install paths:
 *
 *   • Android / Chrome  → `beforeinstallprompt` (native dialog, reusable once)
 *   • iOS / Safari      → no prompt event at all, only the manual
 *                         Share ▸ "Add to Home Screen" flow
 *
 * The button must respect every "already installed" signal: standalone display
 * mode, the iOS `navigator.standalone` flag, and the persisted localStorage
 * flags written by `appinstalled` (which iOS never fires, hence the re-checks
 * on visibilitychange / pageshow).
 */

/** Android/Chrome install prompt event (absent from the DOM lib typings). */
export type PWAInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

/** localStorage keys — shared with the UI so both stay in sync. */
export const PWA_INSTALLED_KEY = 'pwa-installed';
export const PWA_DISMISSED_KEY = 'pwa-dismissed';

export type PWAInstallSignals = {
  /** App is running inside the installed window (standalone / minimal-ui). */
  isStandalone: boolean;
  /** A previous visit recorded a successful install. */
  isInstalledInStorage: boolean;
  /** The visitor closed the button before — never show it again. */
  wasDismissed: boolean;
  /** Chrome handed us a usable `beforeinstallprompt` event. */
  hasDeferredPrompt: boolean;
  /** iOS/iPadOS — installable, but only through the Share sheet. */
  isIOS: boolean;
};

/**
 * Final visibility rule:
 *   !isStandalone && !wasDismissed && !isInstalledInStorage
 *   && (deferredPrompt !== null || isIOS)
 */
export function shouldShowInstallButton(signals: PWAInstallSignals): boolean {
  if (signals.isStandalone || signals.isInstalledInStorage || signals.wasDismissed) {
    return false;
  }
  return signals.hasDeferredPrompt || signals.isIOS;
}

/**
 * iPadOS 13+ reports a desktop Safari user agent ("Macintosh"); touch points
 * are what disambiguate a real iPad from a Mac.
 */
export function isIOSDevice(userAgent: string, platform = '', maxTouchPoints = 0): boolean {
  if (/iPad|iPhone|iPod/i.test(userAgent)) return true;
  return /Mac/i.test(platform) && maxTouchPoints > 1;
}

/**
 * In-app browsers (Facebook, Instagram, WhatsApp, TikTok…) expose NO "Add to
 * Home Screen" on iOS — Apple allows it in Safari only. Detecting the wrapper
 * lets the instructions name the app the visitor is stuck in and tell them what
 * to tap; silently showing Safari steps there was the confusing case.
 */
export const IN_APP_BROWSER_NAMES: ReadonlyArray<{ pattern: RegExp; label: string }> = [
  { pattern: /FBAN|FBAV|FB_IAB|FBIOS/i, label: 'متصفح فيسبوك' },
  { pattern: /Instagram/i, label: 'متصفح إنستغرام' },
  { pattern: /WhatsApp/i, label: 'متصفح واتساب' },
  { pattern: /TikTok|BytedanceWebview|musical_ly/i, label: 'متصفح تيك توك' },
  { pattern: /Twitter/i, label: 'متصفح X (تويتر)' },
  { pattern: /Snapchat/i, label: 'متصفح سناب شات' },
  { pattern: /LinkedInApp/i, label: 'متصفح لينكدإن' },
  { pattern: /MicroMessenger/i, label: 'متصفح وي تشات' },
  { pattern: /GSA\//i, label: 'متصفح تطبيق جوجل' },
];

/** Friendly Arabic name of the enclosing in-app browser, or null when standalone. */
export function inAppBrowserName(userAgent: string): string | null {
  for (const entry of IN_APP_BROWSER_NAMES) {
    if (entry.pattern.test(userAgent)) return entry.label;
  }
  return null;
}

export function isInAppBrowser(userAgent: string): boolean {
  return inAppBrowserName(userAgent) !== null;
}

function readFlag(key: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(key) === 'true';
  } catch {
    return false;
  }
}

function writeFlag(key: string, value: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    if (value) window.localStorage.setItem(key, 'true');
    else window.localStorage.removeItem(key);
  } catch {
    /* private mode / storage disabled — detection still works in memory */
  }
}

export function usePWAInstall() {
  // `mounted` gates rendering: the install state only exists on the client, so
  // the server HTML must never contain the button (no hydration mismatch).
  const [mounted, setMounted] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<PWAInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [inAppBrowser, setInAppBrowser] = useState<string | null>(null);
  const [wasDismissed, setWasDismissed] = useState(false);
  const [isInstalledInStorage, setIsInstalledInStorage] = useState(false);
  const [showIOSHelp, setShowIOSHelp] = useState(false);

  /** Re-evaluate every signal (also covers returning to a backgrounded tab). */
  const refresh = useCallback(() => {
    if (typeof window === 'undefined') return;
    const nav = window.navigator as Navigator & { standalone?: boolean; platform?: string };
    const standaloneMode =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(display-mode: standalone)').matches
        : false;
    // iOS Safari exposes its own flag; keep both paths.
    setIsStandalone(standaloneMode || nav.standalone === true);
    setIsIOS(isIOSDevice(nav.userAgent ?? '', nav.platform ?? '', nav.maxTouchPoints ?? 0));
    setInAppBrowser(inAppBrowserName(nav.userAgent ?? ''));
    setWasDismissed(readFlag(PWA_DISMISSED_KEY));
    setIsInstalledInStorage(readFlag(PWA_INSTALLED_KEY));
  }, []);

  useEffect(() => {
    setMounted(true);
    refresh();

    const onBeforeInstallPrompt = (event: Event) => {
      // Keep the prompt for our own button instead of the mini-infobar.
      event.preventDefault();
      setDeferredPrompt(event as PWAInstallPromptEvent);
    };
    const onInstalled = () => {
      writeFlag(PWA_INSTALLED_KEY, true);
      setIsInstalledInStorage(true);
      setDeferredPrompt(null);
      setShowIOSHelp(false);
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    window.addEventListener('pageshow', refresh);
    document.addEventListener('visibilitychange', onVisible);

    // Going standalone live (e.g. launched from the home-screen icon).
    const media =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(display-mode: standalone)')
        : null;
    if (media?.addEventListener) media.addEventListener('change', refresh);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      window.removeEventListener('pageshow', refresh);
      document.removeEventListener('visibilitychange', onVisible);
      if (media?.removeEventListener) media.removeEventListener('change', refresh);
    };
  }, [refresh]);

  /** Service worker registration — best-effort, never blocks the page. */
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* offline support is a bonus, not a requirement */
    });
  }, []);

  /**
   * Android/Chrome → the browser's native install dialog.
   * iOS → no prompt exists, so surface the Share-sheet instructions instead.
   */
  const install = useCallback(async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    if (!deferredPrompt) {
      if (isIOS) setShowIOSHelp(true);
      return 'unavailable';
    }
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        writeFlag(PWA_INSTALLED_KEY, true);
        setIsInstalledInStorage(true);
        setDeferredPrompt(null);
        return 'accepted';
      }
    } catch {
      /* the prompt rejects if it was already consumed — fall through */
    }
    // A `beforeinstallprompt` event is single-use: dropping it hides the button
    // instead of leaving a dead click target behind.
    setDeferredPrompt(null);
    return 'dismissed';
  }, [deferredPrompt, isIOS]);

  /** The visitor closed the button → never offer it again on this device. */
  const dismiss = useCallback(() => {
    writeFlag(PWA_DISMISSED_KEY, true);
    setWasDismissed(true);
    setShowIOSHelp(false);
  }, []);

  const openIOSHelp = useCallback(() => setShowIOSHelp(true), []);
  const closeIOSHelp = useCallback(() => setShowIOSHelp(false), []);

  const shouldShow = useMemo(
    () =>
      mounted &&
      shouldShowInstallButton({
        isStandalone,
        isInstalledInStorage,
        wasDismissed,
        hasDeferredPrompt: deferredPrompt !== null,
        isIOS,
      }),
    [mounted, isStandalone, isInstalledInStorage, wasDismissed, deferredPrompt, isIOS]
  );

  return {
    mounted,
    shouldShow,
    isIOS,
    /** Friendly name of the enclosing in-app browser (فيسبوك/إنستغرام…), else null. */
    inAppBrowser,
    /** True inside an in-app browser: no install exists until the link opens in a real browser. */
    isInAppBrowser: inAppBrowser !== null,
    isStandalone,
    /** Android/Chrome: a real native prompt is available right now. */
    canPromptNatively: deferredPrompt !== null,
    /** iOS instructions sheet visibility. */
    showIOSHelp,
    openIOSHelp,
    closeIOSHelp,
    install,
    dismiss,
    refresh,
  };
}

export default usePWAInstall;

