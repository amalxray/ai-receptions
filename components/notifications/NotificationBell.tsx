'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Bell, CheckCheck, Volume2, VolumeX, ExternalLink, RefreshCw } from 'lucide-react';
import { useClinicContext } from '@/lib/useClinicContext';
import { isChimeMuted, setChimeMuted } from '@/lib/audio/chime';
import { isInAppUnread } from '@/lib/notification/inAppStatus';
import { useToast } from '@/components/ui/Toast';
import { getSupabaseClient } from '@/lib/supabase/client';

export type InAppNotification = {
  id: string;
  type: string;
  status: 'unread' | 'read' | 'pending';
  payload: {
    title?: string;
    body?: string;
    link?: string;
  };
  created_at: string;
};

const TYPE_ICONS: Record<string, { icon: string; bg: string }> = {
  appointment_reminder: { icon: '⏰', bg: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
  appointment_confirmation: { icon: '✅', bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
  appointment_cancellation: { icon: '❌', bg: 'bg-rose-500/10 text-rose-400 border-rose-500/30' },
  appointment_new: { icon: '📅', bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
  appointment_rescheduled: { icon: '🔄', bg: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30' },
  message_new: { icon: '💬', bg: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
  payment_received: { icon: '💰', bg: 'bg-purple-500/10 text-purple-400 border-purple-500/30' },
  billing: { icon: '💳', bg: 'bg-purple-500/10 text-purple-400 border-purple-500/30' },
  platform_announcement: { icon: '📢', bg: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
  system: { icon: '⚙️', bg: 'bg-slate-500/10 text-slate-400 border-slate-500/30' },
};

function formatTimeAgo(isoString: string): string {
  try {
    const diffMs = Date.now() - new Date(isoString).getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    if (diffMins < 1) return 'الآن';
    if (diffMins < 60) return `منذ ${diffMins} دقيقة`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `منذ ${diffHours} ساعة`;
    const diffDays = Math.floor(diffHours / 24);
    return `منذ ${diffDays} يوم`;
  } catch {
    return '';
  }
}

export default function NotificationBell() {
  const params = useParams();
  const clinicSlug = (params?.clinicSlug as string) || '';
  const { clinicId: activeClinicId, memberships, authHeaders } = useClinicContext();
  const { addToast } = useToast();

  // This bell lives in the dashboard header, i.e. OUTSIDE the `[clinicSlug]`
  // layout, so the URL is the only trustworthy hint about the current tenant.
  // Fall back to the active membership when no tenant slug is in the URL.
  const urlMembership = clinicSlug
    ? memberships.find((m) => m.clinic?.slug === clinicSlug)
    : undefined;
  const clinicId = urlMembership?.clinic_id ?? activeClinicId;

  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [muted, setMutedState] = useState(true);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const previousUnreadRef = useRef<number>(0);

  useEffect(() => {
    setMutedState(isChimeMuted());
  }, []);

  function toggleMute() {
    const next = !muted;
    setChimeMuted(next);
    setMutedState(next);
  }

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  async function fetchNotifications(isPolling = false) {
    if (!clinicId) return;
    if (!isPolling) setLoading(true);
    try {
      // authHeaders() is a thunk (Bearer token lookup) — it must be awaited.
      const headers = await authHeaders();
      const res = await fetch(
        `/api/clinic/notifications?clinic_id=${encodeURIComponent(clinicId)}&limit=5`,
        { headers }
      );
      if (!res.ok) return;
      const data = await res.json();
      const nextList: InAppNotification[] = data.notifications || [];
      const nextCount: number = data.unreadCount || 0;

      // A newly arrived unread item → toast. The toast store owns the chime
      // (single sound per event, never duplicated across components).
      if (isPolling && nextCount > previousUnreadRef.current && nextList.length > 0) {
        const latest = nextList[0];
        addToast({
          type: 'notification',
          title: latest.payload?.title || 'إشعار جديد في العيادة',
          message: latest.payload?.body || 'لديك إشعار جديد في لوحة التحكم.',
          link: latest.payload?.link ?? null,
        });
      }

      previousUnreadRef.current = nextCount;
      setNotifications(nextList);
      setUnreadCount(nextCount);
    } catch {
      // Background poll silently fails
    } finally {
      if (!isPolling) setLoading(false);
    }
  }

  useEffect(() => {
    void fetchNotifications();

    // 1) Realtime subscription for instant alerts (< 1 second)
    const supabase = getSupabaseClient();
    const channelName = clinicId ? `clinic-notifications-${clinicId}` : 'clinic-notifications-all';
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: clinicId ? `clinic_id=eq.${clinicId}` : undefined,
        },
        (payload) => {
          const row = payload.new as any;
          if (row && row.channel === 'inapp') {
            const newNotif: InAppNotification = {
              id: row.id,
              type: row.type || 'system',
              status: row.status || 'pending',
              payload: row.payload || {},
              created_at: row.created_at || new Date().toISOString(),
            };
            setNotifications((prev) => [newNotif, ...prev.slice(0, 4)]);
            setUnreadCount((c) => c + 1);

            // Trigger instant Toast + Chime sound
            addToast({
              type: 'notification',
              title: newNotif.payload?.title || 'إشعار جديد في العيادة',
              message: newNotif.payload?.body || 'لديك إشعار جديد في لوحة التحكم.',
              link: newNotif.payload?.link ?? null,
            });
          }
        }
      )
      .subscribe();

    // 2) Keep a 60s backup heartbeat polling in case websocket disconnects
    const interval = setInterval(() => {
      void fetchNotifications(true);
    }, 60000);

    return () => {
      clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [clinicId]);

  async function markAllAsRead() {
    if (!clinicId || unreadCount === 0) return;
    try {
      const auth = await authHeaders();
      await fetch(`/api/clinic/notifications?clinic_id=${encodeURIComponent(clinicId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({ markAll: true }),
      });
      setUnreadCount(0);
      setNotifications((list) => list.map((n) => ({ ...n, status: 'read' })));
    } catch {
      // Ignore
    }
  }

  async function markSingleAsRead(id: string) {
    if (!clinicId) return;
    try {
      const auth = await authHeaders();
      await fetch(`/api/clinic/notifications?clinic_id=${encodeURIComponent(clinicId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({ notificationId: id }),
      });
      setNotifications((list) =>
        list.map((n) => (n.id === id ? { ...n, status: 'read' } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      // Ignore
    }
  }

  return (
    <div className="relative" ref={dropdownRef} dir="rtl">
      {/* Bell Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label="إشعارات العيادة"
        className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 hover:bg-slate-800/80 transition-all focus:outline-none"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center min-w-[20px] h-5 px-1 rounded-full bg-rose-500 text-[11px] font-bold text-white shadow-lg shadow-rose-500/40 animate-pulse">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Glassmorphism Dropdown */}
      {isOpen && (
        <div className="absolute left-0 sm:left-auto sm:right-0 mt-3 w-80 sm:w-96 rounded-2xl border border-slate-800/90 bg-slate-950/95 backdrop-blur-xl shadow-2xl z-50 overflow-hidden text-right">
          {/* Header */}
          <div className="flex items-center justify-between p-3.5 border-b border-slate-800/80 bg-slate-900/60">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-white">الإشعارات الواردة</span>
              {unreadCount > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  {unreadCount} جديد
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleMute}
                title={muted ? 'تشغيل صوت التنبيه' : 'كتم صوت التنبيه'}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
              >
                {muted ? <VolumeX className="w-4 h-4 text-slate-500" /> : <Volume2 className="w-4 h-4 text-cyan-400" />}
              </button>

              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllAsRead}
                  className="flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300 font-medium px-2 py-1 rounded-lg hover:bg-cyan-950/50 transition-colors"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span>تحديد الكل كمقروء</span>
                </button>
              )}
            </div>
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto divide-y divide-slate-800/60">
            {loading && notifications.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-cyan-500" />
                <span>جاري تحميل الإشعارات...</span>
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                <p className="text-2xl mb-2">🔔</p>
                <p className="font-semibold text-slate-300">لا توجد إشعارات حالياً</p>
                <p className="text-[11px] text-slate-500 mt-1">ستصلك هنا تنبيهات المواعيد والحجوزات الجديدة</p>
              </div>
            ) : (
              notifications.map((n) => {
                const isUnread = isInAppUnread(n.status);
                const style = TYPE_ICONS[n.type] || TYPE_ICONS.system;
                return (
                  <div
                    key={n.id}
                    onClick={() => {
                      if (isUnread) markSingleAsRead(n.id);
                    }}
                    className={`flex items-start gap-3 p-3.5 transition-colors cursor-pointer ${
                      isUnread
                        ? 'bg-cyan-950/20 hover:bg-cyan-950/30'
                        : 'hover:bg-slate-900/60 opacity-80 hover:opacity-100'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border text-sm ${style.bg}`}>
                      {style.icon}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <p className={`text-xs font-semibold truncate ${isUnread ? 'text-white' : 'text-slate-300'}`}>
                          {n.payload?.title || 'إشعار عيادة'}
                        </p>
                        <span className="text-[10px] text-slate-500 shrink-0 font-sans">
                          {formatTimeAgo(n.created_at)}
                        </span>
                      </div>

                      {n.payload?.body && (
                        <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                          {n.payload.body}
                        </p>
                      )}

                      {n.payload?.link && (
                        <Link
                          href={n.payload.link}
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 text-[10px] text-cyan-400 hover:text-cyan-300 mt-1 font-medium"
                        >
                          <span>عرض التفاصيل</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </Link>
                      )}
                    </div>

                    {isUnread && (
                      <span className="w-2 h-2 rounded-full bg-cyan-400 shrink-0 self-center" />
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Footer link to full notifications page */}
          <div className="p-2.5 border-t border-slate-800/80 bg-slate-900/80 text-center">
            <Link
              href={clinicSlug ? `/dashboard/${clinicSlug}/notifications` : '/dashboard/notifications'}
              onClick={() => setIsOpen(false)}
              className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold transition-colors block py-1"
            >
              عرض كل الإشعارات وسجل الرسائل ←
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
