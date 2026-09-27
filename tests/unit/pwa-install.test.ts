import { describe, expect, it } from 'vitest';
import {
  PWA_DISMISS_TTL_MS,
  PWA_DISMISSED_KEY,
  PWA_INSTALLED_KEY,
  inAppBrowserName,
  isAndroidDevice,
  isIOSDevice,
  isInAppBrowser,
  shouldShowInstallButton,
  type PWAInstallSignals,
} from '@/hooks/usePWAInstall';

/**
 * PWA install-button detection.
 *
 * The hook itself is DOM plumbing (beforeinstallprompt / appinstalled /
 * localStorage); the visibility decision is the pure rule tested here:
 *
 *   !isStandalone && !isInstalledInStorage && !wasDismissed && !isInstallPending
 *   && (hasDeferredPrompt || isIOS || isAndroid)
 */

const base: PWAInstallSignals = {
  isStandalone: false,
  isInstalledInStorage: false,
  wasDismissed: false,
  hasDeferredPrompt: false,
  isIOS: false,
  isAndroid: false,
  isInstallPending: false,
};

describe('shouldShowInstallButton', () => {
  it('shows on Android once Chrome handed over the install prompt', () => {
    expect(shouldShowInstallButton({ ...base, hasDeferredPrompt: true })).toBe(true);
  });

  /**
   * The regression this guards: Chrome only fires `beforeinstallprompt` after a
   * tap + ~30s of engagement (and for ~90 days after its sheet was dismissed),
   * so waiting for the event meant Android visitors saw no install button at all.
   */
  it('shows on Android even before Chrome hands over any prompt', () => {
    expect(shouldShowInstallButton({ ...base, isAndroid: true })).toBe(true);
  });

  it('shows on iOS even though no prompt event ever fires', () => {
    expect(shouldShowInstallButton({ ...base, isIOS: true })).toBe(true);
  });

  it('never shows on a desktop browser that offers no install path', () => {
    expect(shouldShowInstallButton(base)).toBe(false);
  });

  it('still shows on desktop once Chrome offers a real prompt', () => {
    expect(shouldShowInstallButton({ ...base, hasDeferredPrompt: true })).toBe(true);
  });

  /** "accepted" is not "installed": the button returns if appinstalled never lands. */
  it('hides while the native dialog is finishing its install step', () => {
    expect(shouldShowInstallButton({ ...base, isAndroid: true, isInstallPending: true })).toBe(false);
    expect(shouldShowInstallButton({ ...base, hasDeferredPrompt: true, isInstallPending: true })).toBe(false);
  });

  it('hides in standalone display mode (already installed)', () => {
    expect(shouldShowInstallButton({ ...base, hasDeferredPrompt: true, isStandalone: true })).toBe(false);
    expect(shouldShowInstallButton({ ...base, isIOS: true, isStandalone: true })).toBe(false);
    expect(shouldShowInstallButton({ ...base, isAndroid: true, isStandalone: true })).toBe(false);
  });

  it('hides for good after the visitor dismissed it', () => {
    expect(shouldShowInstallButton({ ...base, hasDeferredPrompt: true, wasDismissed: true })).toBe(false);
    expect(shouldShowInstallButton({ ...base, isIOS: true, wasDismissed: true })).toBe(false);
    expect(shouldShowInstallButton({ ...base, isAndroid: true, wasDismissed: true })).toBe(false);
  });

  it('hides when a previous visit recorded a successful install', () => {
    expect(shouldShowInstallButton({ ...base, hasDeferredPrompt: true, isInstalledInStorage: true })).toBe(false);
    expect(shouldShowInstallButton({ ...base, isIOS: true, isInstalledInStorage: true })).toBe(false);
    expect(shouldShowInstallButton({ ...base, isAndroid: true, isInstalledInStorage: true })).toBe(false);
  });

  it('keeps the localStorage keys of the UI contract stable', () => {
    expect(PWA_INSTALLED_KEY).toBe('pwa-installed');
    expect(PWA_DISMISSED_KEY).toBe('pwa-dismissed');
    // ✕ is a week-long hint, not a permanent ban (stored value is a timestamp).
    expect(PWA_DISMISS_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });
});

describe('isIOSDevice', () => {
  it('detects iPhone / iPad / iPod touch user agents', () => {
    expect(isIOSDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe(true);
    expect(isIOSDevice('Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X)')).toBe(true);
    expect(isIOSDevice('Mozilla/5.0 (iPod touch; CPU iPhone OS 15_0 like Mac OS X)')).toBe(true);
  });

  it('detects iPadOS 13+ which masquerades as desktop Safari', () => {
    expect(isIOSDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 5)).toBe(true);
  });

  it('does not flag desktop macOS or Android', () => {
    expect(isIOSDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 0)).toBe(false);
    expect(isIOSDevice('Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/120')).toBe(false);
  });
});

/**
 * Android drives the permanent install button, so a false positive would put the
 * button on desktop browsers that offer nothing, and a false negative would hide
 * it from the phone we built this for.
 */
describe('isAndroidDevice', () => {
  it('detects Android phones and tablets across browser UAs', () => {
    expect(isAndroidDevice('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120')).toBe(true);
    expect(isAndroidDevice('Mozilla/5.0 (Linux; Android 13; SM-A135F) SamsungBrowser/22.0')).toBe(true);
    expect(isAndroidDevice('Mozilla/5.0 (Linux; Android 12; Tab S6) Chrome/119 Mobile Safari/537.36')).toBe(true);
    expect(isAndroidDevice('Mozilla/5.0 (Linux; U; Android 11) WebView')).toBe(true);
  });

  it('does not flag iOS, desktop Chrome or a plain desktop Linux box', () => {
    expect(isAndroidDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe(false);
    expect(isAndroidDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120')).toBe(false);
    expect(isAndroidDevice('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120')).toBe(false);
    expect(isAndroidDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120')).toBe(false);
    expect(isAndroidDevice('')).toBe(false);
  });
});

/**
 * In-app browsers: Apple exposes "Add to Home Screen" in Safari only, so an
 * iPhone inside Facebook/Instagram/WhatsApp sees no option at all. The install
 * sheet names the wrapper and offers a copy-link step instead.
 */
describe('in-app browser detection', () => {
  const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15';

  it('names the wrapping app so the instructions can be specific', () => {
    expect(inAppBrowserName(`${IPHONE} Mobile/15E148 [FBAN/FBIOS;FBAV/400.0]`)).toBe('متصفح فيسبوك');
    expect(inAppBrowserName(`${IPHONE} Instagram 320.0`)).toBe('متصفح إنستغرام');
    expect(inAppBrowserName(`${IPHONE} WhatsApp/2.24`)).toBe('متصفح واتساب');
    expect(inAppBrowserName(`${IPHONE} TikTok 32.0`)).toBe('متصفح تيك توك');
  });

  it('does not flag real Safari, Chrome or a plain Android browser', () => {
    expect(isInAppBrowser(IPHONE)).toBe(false);
    expect(inAppBrowserName(`${IPHONE} CriOS/120.0`)).toBeNull();
    expect(isInAppBrowser('Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/120')).toBe(false);
    expect(inAppBrowserName('')).toBeNull();
  });
});
