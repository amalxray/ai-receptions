import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * #35 — contract guard for the in-app notification stack.
 *
 * The bell (badge + dropdown + mark-as-read), the global toast store (blob +
 * conic border + chime) and the Web Audio chime are asserted on SOURCE because
 * they need a browser runtime while this suite runs in `node`. A regression
 * back to the broken wiring (un-awaited `authHeaders`, per-component toast
 * state, a phantom `clinic_notifications` table) fails immediately.
 */

const projectRoot = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(projectRoot, rel), 'utf8');

const bell = read('components/notifications/NotificationBell.tsx');
const inbox = read('components/notifications/NotificationsInbox.tsx');
const tabs = read('components/notifications/NotificationsTabs.tsx');
const toastUi = read('components/ui/Toast.tsx');
const header = read('components/auth/DashboardHeader.tsx');
const dashLayout = read('app/(dashboard)/layout.tsx');
const apiRoute = read('app/api/clinic/notifications/route.ts');
const chime = read('lib/audio/chime.ts');
const manager = read('components/dashboard/NotificationTemplateManager.tsx');
const notifPage = read('app/(dashboard)/dashboard/[clinicSlug]/notifications/page.tsx');

describe('#35 — NotificationBell wiring', () => {
  it('awaits the authHeaders thunk instead of treating it as a headers object', () => {
    expect(bell).toContain('await authHeaders()');
    expect(bell).not.toContain('authHeaders ||');
  });

  it('resolves the tenant from the URL slug with a membership fallback', () => {
    expect(bell).toContain('params?.clinicSlug');
    expect(bell).toContain('memberships.find');
    expect(bell).toContain('urlMembership?.clinic_id');
  });

  it('renders an unread badge, a mark-all action and a chime toggle', () => {
    expect(bell).toContain('unreadCount > 99');
    expect(bell).toContain('markAllAsRead');
    expect(bell).toContain('markSingleAsRead');
    expect(bell).toContain('toggleMute');
    expect(bell).toContain('isChimeMuted');
    expect(bell).toContain('setChimeMuted');
  });

  it('reflects the selected no-sound option in the bell mute control', () => {
    expect(bell).toContain('getNotificationChimeType');
    expect(bell).toContain("getNotificationChimeType() === 'none'");
    expect(bell).toContain("disabled={getNotificationChimeType() === 'none'}");
  });

  it('polls for newly arrived notifications', () => {
    expect(bell).toContain('setInterval');
    expect(bell).toContain('isPolling');
  });

  it('never plays the chime directly — the toast store owns it exactly once', () => {
    expect(bell).not.toContain('playNotificationChime');
    expect(bell).toContain("type: 'notification'");
  });

  it('is mounted in the dashboard header', () => {
    expect(header).toContain("import NotificationBell from '@/components/notifications/NotificationBell'");
    expect(header).toContain('<NotificationBell />');
    expect(header).toContain('اختيار نغمة الإشعارات');
    expect(header).toContain("type: 'classic'");
    expect(header).toContain("type: 'soft'");
    expect(header).toContain("type: 'alert'");
    expect(header).toContain("type: 'strong-ring'");
    expect(header).toContain("type: 'extended-bell'");
    expect(header).toContain("type: 'repeating-alert'");
    expect(header).toContain("type: 'none'");
  });
});

describe('#35 — inbox page and tabs', () => {
  it('exposes the incoming + templates tabs', () => {
    expect(notifPage).toContain('NotificationsTabs');
    expect(tabs).toContain('الواردة');
    expect(tabs).toContain('القوالب');
    expect(tabs).toContain('NotificationsInbox');
    expect(tabs).toContain('NotificationTemplateManager');
  });

  it('supports per-item and bulk mark-as-read', () => {
    expect(inbox).toContain('async function markRead');
    expect(inbox).toContain('async function markAllRead');
    expect(inbox).toContain('notificationId: id');
    expect(inbox).toContain('markAll: true');
    expect(inbox).toContain('تحديد الكل كمقروء');
  });

  it('bell and inbox both use the codebase-standard clinic_id query param', () => {
    expect(bell).toContain('?clinic_id=');
    expect(inbox).toContain('?clinic_id=');
    expect(bell).not.toContain('?clinicId=');
    expect(inbox).not.toContain('?clinicId=');
  });
});

describe('#35 — in-app notifications API', () => {
  it('reads clinic_id and answers with notifications + unreadCount', () => {
    expect(apiRoute).toContain("searchParams.get('clinic_id')");
    expect(apiRoute).toContain('notifications:');
    expect(apiRoute).toContain('unreadCount');
  });

  it('scopes every query to channel = inapp on the REAL notifications table', () => {
    expect(apiRoute).toContain(".from('notifications')");
    expect(apiRoute).toContain(".eq('channel', 'inapp')");
    // Read-state comes from the shared contract, never from a local literal.
    expect(apiRoute).toContain('IN_APP_UNREAD_STATUSES');
    expect(apiRoute).toContain('IN_APP_READ_STATUS');
  });

  it('counts pending + unread as not-seen, matching what the producers write', () => {
    expect(apiRoute).toContain(".in('status', [...IN_APP_UNREAD_STATUSES])");
    expect(apiRoute).toContain("status: isInAppUnread(n.status) ? 'unread' : 'read'");
    // The regression: only `unread` counted → admin announcements never badged.
    expect(apiRoute).not.toContain(".eq('status', 'unread')");
  });

  it('never targets a phantom clinic_notifications table', () => {
    expect(apiRoute).not.toContain('clinic_notifications');
  });

  it('exports GET, PATCH and POST handlers', () => {
    expect(apiRoute).toContain('export async function GET');
    expect(apiRoute).toContain('export async function PATCH');
    expect(apiRoute).toContain('export async function POST');
  });
});

describe('#35 — global toast store', () => {
  it('exposes one module-level store plus a single viewport', () => {
    expect(toastUi).toContain('export function pushToast');
    expect(toastUi).toContain('export function dismissToast');
    expect(toastUi).toContain('export function ToastViewport');
    expect(toastUi).toContain('useSyncExternalStore');
    // The broken per-component state that nothing rendered is gone.
    expect(toastUi).not.toContain('const [toasts, setToasts] = useState');
  });

  it('mounts the viewport exactly once in the dashboard shell', () => {
    expect(dashLayout).toContain("import { ToastViewport } from '@/components/ui/Toast'");
    expect(dashLayout).toContain('<ToastViewport />');
    expect((dashLayout.match(/<ToastViewport \/>/g) || []).length).toBe(1);
  });

  it('builds the modern look from the existing ShineBorder conic border + a blob', () => {
    expect(toastUi).toContain("from '@/components/ui/shine-border'");
    expect(toastUi).toContain('<ShineBorder');
    expect(toastUi).toContain('blobColor');
    expect(toastUi).toContain('blur-3xl');
    expect(toastUi).toContain('backdrop-blur-xl');
  });

  it('ships five semantic palettes and a 6s toast duration and progress bar', () => {
    for (const t of ['success', 'error', 'info', 'warning', 'notification']) {
      expect(toastUi).toContain(`${t}: {`);
    }
    expect(toastUi).toContain('6000');
    expect(toastUi).toContain("initial={{ width: '100%' }}");
    expect(toastUi).toContain("animate={{ width: '0%' }}");
  });

  it('chimes only for notification toasts and exports the convenience API', () => {
    expect(toastUi).toContain('shouldChime');
    expect(toastUi).toContain("toast.type === 'notification'");
    expect(toastUi).toContain('playNotificationChime');
    for (const fn of ['success', 'error', 'info', 'warning', 'notification']) {
      expect(toastUi).toContain(`${fn}:`);
    }
  });
});

describe('#35 — Web Audio chime (no mp3 asset)', () => {
  it('synthesises the dual-tone chime with a Web Audio oscillator', () => {
    expect(chime).toContain('createOscillator');
    expect(chime).toContain('CHIME_DURATION_SECONDS = 4');
    expect(chime).toContain('NOTE_DURATION_SECONDS = 0.9');
    expect(chime).toContain('linearRampToValueAtTime(0.035');
    expect(chime).toContain('fundamental.stop(start + NOTE_DURATION_SECONDS)');
    expect(chime).not.toMatch(/\.mp3/);
  });

  it('persists the mute preference in localStorage', () => {
    expect(chime).toContain('localStorage');
    expect(chime).toContain('export function isChimeMuted');
    expect(chime).toContain('export function setChimeMuted');
  });

  it('schedules a quiet melody for about four seconds and then closes its audio context', async () => {
    const stops: number[] = [];
    const peakGains: number[] = [];
    const timers: number[] = [];
    const oscillators: Array<{
      frequency: { setValueAtTime: (value: number, time: number) => void };
      connect: () => void;
      start: (time: number) => void;
      stop: (time: number) => void;
      type: string;
    }> = [];
    class MockAudioContext {
      currentTime = 10;
      state = 'running';
      destination = {};
      createOscillator() {
        const oscillator = {
          frequency: { setValueAtTime: () => undefined },
          connect: () => undefined,
          start: () => undefined,
          stop: (time: number) => stops.push(time),
          type: '',
        };
        oscillators.push(oscillator);
        return oscillator;
      }
      createGain() {
        return {
          gain: {
            setValueAtTime: (value: number) => {
              if (value > 0.001) peakGains.push(value);
            },
            linearRampToValueAtTime: (value: number) => peakGains.push(value),
          },
          connect: () => undefined,
        };
      }
      close = async () => undefined;
      resume = async () => undefined;
    }
    const context = new MockAudioContext();

    vi.stubGlobal('window', {
      AudioContext: MockAudioContext,
      setTimeout: (_callback: () => void, delay: number) => timers.push(delay),
    });
    vi.stubGlobal('localStorage', { getItem: () => 'false' });
    try {
      const { playNotificationChime } = await import('@/lib/audio/chime');
      playNotificationChime();

      expect(oscillators).toHaveLength(10);
      expect(Math.max(...stops) - context.currentTime).toBeCloseTo(3.94);
      expect(timers).toContain(4250);
      expect(Math.max(...peakGains)).toBe(0.035);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('schedules the strong ring as three 0.8-second rising tones at volume 0.25', async () => {
    const tones: Array<{ start: number; stop: number; frequencies: number[]; gains: number[] }> = [];
    const timers: number[] = [];
    class MockAudioContext {
      currentTime = 10;
      state = 'running';
      destination = {};
      createOscillator() {
        const tone = { start: 0, stop: 0, frequencies: [] as number[], gains: [] as number[] };
        tones.push(tone);
        return {
          type: '',
          frequency: {
            setValueAtTime: (value: number) => tone.frequencies.push(value),
            linearRampToValueAtTime: (value: number) => tone.frequencies.push(value),
          },
          connect: () => undefined,
          start: (time: number) => { tone.start = time; },
          stop: (time: number) => { tone.stop = time; },
        };
      }
      createGain() {
        const tone = tones[tones.length - 1];
        return {
          gain: {
            setValueAtTime: (value: number) => tone.gains.push(value),
            linearRampToValueAtTime: (value: number) => tone.gains.push(value),
          },
          connect: () => undefined,
        };
      }
      close = async () => undefined;
      resume = async () => undefined;
    }

    vi.stubGlobal('window', {
      AudioContext: MockAudioContext,
      setTimeout: (_callback: () => void, delay: number) => timers.push(delay),
    });
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => key === 'clinic_notifications_chime_muted' ? 'false' : null,
    });
    try {
      const { playNotificationChime } = await import('@/lib/audio/chime');
      playNotificationChime('strong-ring');

      expect(tones).toHaveLength(3);
      expect(tones.map(({ start }) => start)).toEqual([10, 10.95, 11.9]);
      tones.forEach(({ stop, start }) => expect(stop - start).toBeCloseTo(0.8));
      expect(tones.every(({ frequencies, gains }) =>
        frequencies[0] === 880 && frequencies[1] === 1200 && gains.includes(0.25)
      )).toBe(true);
      expect(timers).toContain(2950);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('schedules the extended bell at C6 for four seconds with a 0.15 combined peak', async () => {
    const tones: Array<{ start: number; stop: number; frequency?: number; peakGain: number }> = [];
    const timers: number[] = [];
    class MockAudioContext {
      currentTime = 10;
      state = 'running';
      destination = {};
      createOscillator() {
        const tone: { start: number; stop: number; frequency?: number; peakGain: number } = {
          start: 0,
          stop: 0,
          peakGain: 0,
        };
        tones.push(tone);
        return {
          type: '',
          frequency: {
            setValueAtTime: (value: number) => { tone.frequency = value; },
            linearRampToValueAtTime: (value: number) => { tone.frequency = value; },
          },
          connect: () => undefined,
          start: (time: number) => { tone.start = time; },
          stop: (time: number) => { tone.stop = time; },
        };
      }
      createGain() {
        const tone = tones[tones.length - 1];
        return {
          gain: {
            setValueAtTime: (value: number) => { tone.peakGain = Math.max(tone.peakGain, value); },
            linearRampToValueAtTime: (value: number) => { tone.peakGain = Math.max(tone.peakGain, value); },
          },
          connect: () => undefined,
        };
      }
      close = async () => undefined;
      resume = async () => undefined;
    }

    vi.stubGlobal('window', {
      AudioContext: MockAudioContext,
      setTimeout: (_callback: () => void, delay: number) => timers.push(delay),
    });
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => key === 'clinic_notifications_chime_muted' ? 'false' : null,
    });
    try {
      const { playNotificationChime } = await import('@/lib/audio/chime');
      playNotificationChime('extended-bell');

      expect(tones).toHaveLength(2);
      expect(tones.map(({ frequency }) => frequency)).toEqual([1046, 2092]);
      expect(tones.every(({ stop, start }) => stop - start === 4)).toBe(true);
      expect(tones.reduce((sum, tone) => sum + tone.peakGain, 0)).toBeCloseTo(0.15);
      expect(timers).toContain(4250);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('schedules three 0.15-second repeating alerts with half-second gaps at volume 0.2', async () => {
    const tones: Array<{ start: number; stop: number; frequency?: number; peakGain: number }> = [];
    const timers: number[] = [];
    class MockAudioContext {
      currentTime = 10;
      state = 'running';
      destination = {};
      createOscillator() {
        const tone: { start: number; stop: number; frequency?: number; peakGain: number } = {
          start: 0,
          stop: 0,
          peakGain: 0,
        };
        tones.push(tone);
        return {
          type: '',
          frequency: {
            setValueAtTime: (value: number) => { tone.frequency = value; },
            linearRampToValueAtTime: (value: number) => { tone.frequency = value; },
          },
          connect: () => undefined,
          start: (time: number) => { tone.start = time; },
          stop: (time: number) => { tone.stop = time; },
        };
      }
      createGain() {
        const tone = tones[tones.length - 1];
        return {
          gain: {
            setValueAtTime: (value: number) => { tone.peakGain = Math.max(tone.peakGain, value); },
            linearRampToValueAtTime: (value: number) => { tone.peakGain = Math.max(tone.peakGain, value); },
          },
          connect: () => undefined,
        };
      }
      close = async () => undefined;
      resume = async () => undefined;
    }

    vi.stubGlobal('window', {
      AudioContext: MockAudioContext,
      setTimeout: (_callback: () => void, delay: number) => timers.push(delay),
    });
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => key === 'clinic_notifications_chime_muted' ? 'false' : null,
    });
    try {
      const { playNotificationChime } = await import('@/lib/audio/chime');
      playNotificationChime('repeating-alert');

      expect(tones).toHaveLength(3);
      expect(tones.map(({ start }) => start)).toEqual([10, 10.65, 11.3]);
      tones.forEach(({ stop, start }) => expect(stop - start).toBeCloseTo(0.15));
      expect(tones.every(({ frequency, peakGain }) => frequency === 880 && peakGain === 0.2)).toBe(true);
      expect(timers).toContain(1700);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('keeps both none and the mute preference silent', async () => {
    let selectedType = 'none';
    let muted = 'false';
    let audioContextsCreated = 0;
    class MockAudioContext {
      constructor() {
        audioContextsCreated += 1;
      }
    }

    vi.stubGlobal('window', { AudioContext: MockAudioContext });
    vi.stubGlobal('localStorage', {
      getItem: (key: string) =>
        key === 'clinic_notifications_chime_type' ? selectedType : muted,
    });
    try {
      const { isChimeMuted, playNotificationChime } = await import('@/lib/audio/chime');

      expect(isChimeMuted()).toBe(true);
      playNotificationChime();
      expect(audioContextsCreated).toBe(0);

      selectedType = 'strong-ring';
      muted = 'true';
      expect(isChimeMuted()).toBe(true);
      playNotificationChime('strong-ring');
      expect(audioContextsCreated).toBe(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('supports selectable notification chimes and persists the selected type', () => {
    expect(chime).toContain("'strong-ring'");
    expect(chime).toContain("'extended-bell'");
    expect(chime).toContain("'repeating-alert'");
    expect(chime).toContain("'clinic_notifications_chime_type'");
    expect(chime).toContain('export function getNotificationChimeType');
    expect(chime).toContain('export function setNotificationChimeType');
    expect(chime).toContain('CHIME_PRESETS');
    expect(chime).toContain("if (type === 'none' || isChimeMuted()) return;");
  });

  it('is a safe no-op outside the browser', async () => {
    const mod = await import('@/lib/audio/chime');
    expect(mod.isChimeMuted()).toBe(true);
    expect(() => mod.playNotificationChime()).not.toThrow();
  });
});

describe('#35 — single source of truth for the in-app read-state', () => {
  it('treats pending and unread as not-seen, and read/sent as seen', async () => {
    const { isInAppUnread } = await import('@/lib/notification/inAppStatus');
    expect(isInAppUnread('pending')).toBe(true);
    expect(isInAppUnread('unread')).toBe(true);
    expect(isInAppUnread('read')).toBe(false);
    expect(isInAppUnread('sent')).toBe(false);
    expect(isInAppUnread(null)).toBe(false);
    expect(isInAppUnread(undefined)).toBe(false);
  });

  it('is the only place that decides the read-state for both clients', () => {
    for (const source of [bell, inbox]) {
      expect(source).toContain("from '@/lib/notification/inAppStatus'");
      expect(source).toContain('isInAppUnread(');
      // No local literal comparison can silently drift from the producers again.
      expect(source).not.toContain("=== 'unread'");
    }
  });
});

describe('#36 — templates manager bound to the real route contract', () => {
  it('uses clinic_id, unwraps the { data } envelope and PUT for updates', () => {
    expect(manager).toContain('?clinic_id=');
    expect(manager).not.toContain('?clinicId=');
    expect(manager).toContain('payload?.data');
    expect(manager).toContain('PUT');
    expect(manager).toContain('editingId ? "PUT" : "POST"');
  });

  it('offers visual editing: channel tabs, variable chips and a live preview', () => {
    expect(manager).toContain('selectedChannelTab');
    expect(manager).toContain('{patient_name}');
    expect(manager).toContain('{provider_name}');
    expect(manager).toContain('معاينة');
  });
});
