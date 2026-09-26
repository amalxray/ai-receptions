import { describe, it, expect } from 'vitest';
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

  it('ships five semantic palettes and a 5s progress bar', () => {
    for (const t of ['success', 'error', 'info', 'warning', 'notification']) {
      expect(toastUi).toContain(`${t}: {`);
    }
    expect(toastUi).toContain('5000');
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
    expect(chime).toContain('exponentialRampToValueAtTime');
    expect(chime).toContain('1200');
    expect(chime).not.toMatch(/\.mp3/);
  });

  it('persists the mute preference in localStorage', () => {
    expect(chime).toContain('localStorage');
    expect(chime).toContain('export function isChimeMuted');
    expect(chime).toContain('export function setChimeMuted');
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

