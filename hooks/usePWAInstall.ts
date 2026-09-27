'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * PWA install detection — the single source of truth for the "أضف للشاشة"
 * button. Covers every install path:
 *
 *   • Android / Chrome with a prompt → `beforeinstallprompt` (native dialog)
 *   • Android / Chrome without one   → "⋮ ▸ تثبيت التطبيق" walkthrough
 *   • iOS / Safari                   → no prompt event at all, only the manual
 *                                      Share ▸ "Add to Home Screen" flow
 *
 * Android deliberately does NOT wait for `beforeinstallprompt`: Chrome fires it
 * only after a user-engagement heuristic (a tap + ~30s of viewing) and not at all
 * for ~90 days after its native sheet was dismissed, so gating the button on the
 * event left Android visitors with no install affordance whatsoever.
 *
 * The button must respect every "already installed" signal: standalone display
 * mode, the iOS `navigator.standalone` flag, and the persisted localStorage
 * flag written by `appinstalled` (which iOS never fires, hence the re-checks
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
  /** The visitor closed the button within the last `PWA_DISMISS_TTL_MS`. */
  wasDismissed: boolean;
  /** Chrome handed us a usable `beforeinstallprompt` event. */
  hasDeferredPrompt: boolean;
  /** iOS/iPadOS — installable, but only through the Share sheet. */
  isIOS: boolean;
  /** Android — Chrome's ⋮ menu always offers install, prompt event or not. */
  isAndroid: boolean;
  /** The native dialog was accepted and `appinstalled` has not landed yet. */
  isInstallPending: boolean;
};

/**
 * How long a manual ✕ keeps the button hidden. One accidental tap used to hide
 * the install path forever with no way back; a week is a polite hint, not a ban.
 */
export const PWA_DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Grace for `appinstalled`: if the OS step is cancelled, the button returns. */
export const PWA_INSTALL_PENDING_TIMEOUT_MS = 60_000;

/**
 * Final visibility rule:
 *   !isStandalone && !isInstalledInStorage && !wasDismissed && !isInstallPending
 *   && (deferredPrompt !== null || isIOS || isAndroid)
 *
 * Android is included even when `beforeinstallprompt` never arrived, because
 * Chrome fires that event only after its user-engagement heuristic (at least one
 * tap plus ~30s of viewing, and nothing at all for ~90 days after the native
 * sheet was dismissed). Requiring the event meant an Android visitor saw no
 * install affordance whatsoever; "⋮ ▸ تثبيت التطبيق" always exists, so the
 * button is permanent and falls back to instructions exactly like iOS does.
 */
export function shouldShowInstallButton(signals: PWAInstallSignals): boolean {
  if (
    signals.isStandalone ||
    signals.isInstalledInStorage ||
    signals.wasDismissed ||
    signals.isInstallPending
  ) {
    return false;
  }
  return signals.hasDeferredPrompt || signals.isIOS || signals.isAndroid;
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
 * Android/Chrome. This — not `beforeinstallprompt` — is what makes the button
 * visible on a first visit: Chrome withholds the event until its engagement
 * heuristic is satisfied, so the click later prefers the prompt when Chrome
 * supplied one and otherwise shows the ⋮-menu walkthrough.
 */
export function isAndroidDevice(userAgent: string): boolean {
  return /\bAndroid\b/i.test(userAgent);
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

/**
 * Dismissal is stored as a TIMESTAMP under the same `pwa-dismissed` key and only
 * suppresses the button for `PWA_DISMISS_TTL_MS`. The legacy `"true"` value (the
 * old permanent ban) parses as non-numeric and therefore expires immediately —
 * intentional, so users who tapped ✕ once get the install path back.
 */
function readDismissed(key: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return false;
    const at = Number.parseInt(raw, 10);
    if (!Number.isFinite(at)) return false;
    return Date.now() - at < PWA_DISMISS_TTL_MS;
  } catch {
    return false;
  }
}

function writeDismissed(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, String(Date.now()));
  } catch {
    /* private mode / storage disabled — suppression still works in memory */
  }
}

/**
 * `beforeinstallprompt` can fire before React hydrates (the hook only attaches
 * its own listener after mount), and the event is never replayed. `app/layout.tsx`
 * installs a capture listener that stashes the event here so it can be adopted.
 */
declare global {
  interface Window {
    __pwaInstallPrompt?: PWAInstallPromptEvent | null;
  }
}

export function usePWAInstall() {
  // `mounted` gates rendering: the install state only exists on the client, so
  // the server HTML must never contain the button (no hydration mismatch).
  const [mounted, setMounted] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<PWAInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const [inAppBrowser, setInAppBrowser] = useState<string | null>(null);
  const [wasDismissed, setWasDismissed] = useState(false);
  const [isInstalledInStorage, setIsInstalledInStorage] = useState(false);
  /** Native dialog accepted, `appinstalled` still outstanding — hides the button briefly. */
  const [isInstallPending, setIsInstallPending] = useState(false);
  const [showManualHelp, setShowManualHelp] = useState(false);
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    setIsAndroid(isAndroidDevice(nav.userAgent ?? ''));
    setInAppBrowser(inAppBrowserName(nav.userAgent ?? ''));
    setWasDismissed(readDismissed(PWA_DISMISSED_KEY));
    setIsInstalledInStorage(readFlag(PWA_INSTALLED_KEY));
  }, []);

  useEffect(() => {
    setMounted(true);
    refresh();

    // Adopt a prompt that the pre-hydration capture listener in `app/layout.tsx`
    // caught before this effect attached — Chrome never replays the event.
    const stashed = window.__pwaInstallPrompt;
    if (stashed) {
      window.__pwaInstallPrompt = null;
      setDeferredPrompt(stashed);
    }

    const onBeforeInstallPrompt = (event: Event) => {
      // Keep the prompt for our own button instead of the mini-infobar.
      event.preventDefault();
      setDeferredPrompt(event as PWAInstallPromptEvent);
    };
    const onInstalled = () => {
      writeFlag(PWA_INSTALLED_KEY, true);
      setIsInstalledInStorage(true);
      setIsInstallPending(false);
      setDeferredPrompt(null);
      setShowManualHelp(false);
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
      if (pendingTimer.current) clearTimeout(pendingTimer.current);
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
   * Android/Chrome holding a prompt → the browser's native install dialog.
   * Everything else (iOS, or Android before Chrome's engagement heuristic fires)
   * has no dialog to offer, so the manual walkthrough is shown instead: the
   * button must never turn into a dead click target.
   */
  const install = useCallback(async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    if (!deferredPrompt) {
      setShowManualHelp(true);
      return 'unavailable';
    }
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        // "accepted" is not an install: Android still runs its own confirmation
        // and only then fires `appinstalled`, which is what persists the flag.
        // Writing it here used to hide the button forever after a cancelled OS
        // step, so hide for a bounded grace window instead.
        setDeferredPrompt(null);
        setIsInstallPending(true);
        if (pendingTimer.current) clearTimeout(pendingTimer.current);
        pendingTimer.current = setTimeout(
          () => setIsInstallPending(false),
          PWA_INSTALL_PENDING_TIMEOUT_MS
        );
        return 'accepted';
      }
      // Declined in the native sheet: the event is spent, so drop it.
      setDeferredPrompt(null);
      return 'dismissed';
    } catch {
      // `prompt()` rejects only when the event was already consumed elsewhere
      // (e.g. Chrome's own infobar). Keep the reference and fall back to the
      // manual steps — nulling it here used to leave no install path at all.
      setShowManualHelp(true);
      return 'unavailable';
    }
  }, [deferredPrompt]);

  /** The visitor closed the button → hide it for `PWA_DISMISS_TTL_MS`, not forever. */
  const dismiss = useCallback(() => {
    writeDismissed(PWA_DISMISSED_KEY);
    setWasDismissed(true);
    setShowManualHelp(false);
  }, []);

  const openManualHelp = useCallback(() => setShowManualHelp(true), []);
  const closeManualHelp = useCallback(() => setShowManualHelp(false), []);

  const shouldShow = useMemo(
    () =>
      mounted &&
      shouldShowInstallButton({
        isStandalone,
        isInstalledInStorage,
        wasDismissed,
        hasDeferredPrompt: deferredPrompt !== null,
        isIOS,
        isAndroid,
        isInstallPending,
      }),
    [mounted, isStandalone, isInstalledInStorage, wasDismissed, deferredPrompt, isIOS, isAndroid, isInstallPending]
  );

  return {
    mounted,
    shouldShow,
    isIOS,
    /** Android: the ⋮-menu install always exists, prompt event or not. */
    isAndroid,
    /** Friendly name of the enclosing in-app browser (فيسبوك/إنستغرام…), else null. */
    inAppBrowser,
    /** True inside an in-app browser: no install exists until the link opens in a real browser. */
    isInAppBrowser: inAppBrowser !== null,
    isStandalone,
    /** Android/Chrome: a real native prompt is available right now. */
    canPromptNatively: deferredPrompt !== null,
    /** Manual (iOS / Android-without-prompt) instructions sheet visibility. */
    showManualHelp,
    openManualHelp,
    closeManualHelp,
    install,
    dismiss,
    refresh,
  };
}

export default usePWAInstall;

