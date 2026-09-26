import { describe, expect, it } from 'vitest';
import {
  PWA_DISMISSED_KEY,
  PWA_INSTALLED_KEY,
  isIOSDevice,
  shouldShowInstallButton,
  type PWAInstallSignals,
} from '@/hooks/usePWAInstall';

/**
 * PWA install-button detection.
 *
 * The hook itself is DOM plumbing (beforeinstallprompt / appinstalled /
 * localStorage); the visibility decision is the pure rule tested here:
 *
 *   !isStandalone && !wasDismissed && !isInstalledInStorage
 *   && (hasDeferredPrompt || isIOS)
 */

const base: PWAInstallSignals = {
  isStandalone: false,
  isInstalledInStorage: false,
  wasDismissed: false,
  hasDeferredPrompt: false,
  isIOS: false,
};

describe('shouldShowInstallButton', () => {
  it('shows on Android once Chrome handed over the install prompt', () => {
    expect(shouldShowInstallButton({ ...base, hasDeferredPrompt: true })).toBe(true);
  });

  it('shows on iOS even though no prompt event ever fires', () => {
    expect(shouldShowInstallButton({ ...base, isIOS: true })).toBe(true);
  });

  it('never shows on a desktop browser that offers no install path', () => {
    expect(shouldShowInstallButton(base)).toBe(false);
  });

  it('hides in standalone display mode (already installed)', () => {
    expect(shouldShowInstallButton({ ...base, hasDeferredPrompt: true, isStandalone: true })).toBe(false);
    expect(shouldShowInstallButton({ ...base, isIOS: true, isStandalone: true })).toBe(false);
  });

  it('hides for good after the visitor dismissed it', () => {
    expect(shouldShowInstallButton({ ...base, hasDeferredPrompt: true, wasDismissed: true })).toBe(false);
    expect(shouldShowInstallButton({ ...base, isIOS: true, wasDismissed: true })).toBe(false);
  });

  it('hides when a previous visit recorded a successful install', () => {
    expect(shouldShowInstallButton({ ...base, hasDeferredPrompt: true, isInstalledInStorage: true })).toBe(false);
    expect(shouldShowInstallButton({ ...base, isIOS: true, isInstalledInStorage: true })).toBe(false);
  });

  it('keeps the localStorage keys of the UI contract stable', () => {
    expect(PWA_INSTALLED_KEY).toBe('pwa-installed');
    expect(PWA_DISMISSED_KEY).toBe('pwa-dismissed');
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
