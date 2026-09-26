'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { CheckCheck, RefreshCw } from 'lucide-react';
import { useClinicContext } from '@/lib/useClinicContext';
import { useSupabaseConfig } from '@/lib/useSupabaseConfig';
import EmptyState from '@/components/dashboard/EmptyState';
import Skeleton from '@/components/ui/Skeleton';
import { isInAppUnread } from '@/lib/notification/inAppStatus';

type InAppNotification = {
  id: string;
  type: string;
  status: 'unread' | 'read' | 'pending';
  payload: { title?: string; body?: string; link?: string } | null;
  created_at: string;
};

const TYPE_STYLES: Record<string, { icon: string; bg: string }> = {
  appointment_reminder: { icon: '⏰', bg: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
  appointment_confirmation: { icon: '✅', bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
  appointment_cancellation: { icon: '❌', bg: 'bg-rose-500/10 text-rose-400 border-rose-500/30' },
  billing: { icon: '💳', bg: 'bg-purple-500/10 text-purple-400 border-purple-500/30' },
  platform_announcement: { icon: '📢', bg: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
  system: { icon: '⚙️', bg: 'bg-slate-500/10 text-slate-400 border-slate-500/30' },
};

function formatDateTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat('ar-EG', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    return '';
  }
}

/**
 * #35 — full in-app inbox for a tenant. Reads the REAL `notifications` table
 * filtered to `channel = 'inapp'` (no phantom tables, no DDL).
 */
export default function NotificationsInbox() {
  const params = useParams();
  const clinicSlug = (params?.clinicSlug as string) || '';
  const {
    isConfigured: isSupabaseConfigured,
    loading: configLoading,
    checkFailed,
  } = useSupabaseConfig();
  const {
    clinicId: activeClinicId,
    memberships,
    authHeaders,
    loading: clinicLoading,
    error: clinicError,
  } = useClinicContext();

  const urlMembership = clinicSlug ? memberships.find((m) => m.clinic?.slug === clinicSlug) : undefined;
  const clinicId = urlMembership?.clinic_id ?? activeClinicId;

  const [items, setItems] = useState<InAppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!clinicId) return;
    setLoading(true);
    setError(null);
    try {
      const headers = await authHeaders();
      const res = await fetch(
        `/api/clinic/notifications?clinic_id=${encodeURIComponent(clinicId)}&limit=20`,
        { headers }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.error || 'فشل تحميل الإشعارات');
        setItems([]);
        return;
      }
      const data = await res.json();
      setItems(Array.isArray(data.notifications) ? data.notifications : []);
      setUnreadCount(Number(data.unreadCount) || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل الاتصال بالخادم');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [clinicId, authHeaders]);

  useEffect(() => {
    if (configLoading) {
      setLoading(true);
      return;
    }
    if (!isSupabaseConfigured && !checkFailed) {
      setLoading(false);
      return;
    }
    if (clinicLoading) {
      setLoading(true);
      return;
    }
    if (!clinicId) {
      if (clinicError) setError(clinicError);
      setLoading(false);
      return;
    }
    void load();
  }, [isSupabaseConfigured, configLoading, checkFailed, clinicLoading, clinicId, clinicError, load]);

  async function markRead(id: string) {
    if (!clinicId) return;
    try {
      const auth = await authHeaders();
      await fetch(`/api/clinic/notifications?clinic_id=${encodeURIComponent(clinicId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({ notificationId: id }),
      });
      setItems((list) => list.map((n) => (n.id === id ? { ...n, status: 'read' } : n)));
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      // Non-blocking: the refresh button reconciles the true state.
    }
  }

  async function markAllRead() {
    if (!clinicId || unreadCount === 0) return;
    setBusy(true);
    try {
      const auth = await authHeaders();
      await fetch(`/api/clinic/notifications?clinic_id=${encodeURIComponent(clinicId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({ markAll: true }),
      });
      setItems((list) => list.map((n) => ({ ...n, status: 'read' })));
      setUnreadCount(0);
    } catch {
      // Ignore
    } finally {
      setBusy(false);
    }
  }

  if (loading || configLoading) return <Skeleton className="h-60" />;

  if (!isSupabaseConfigured && !checkFailed) {
    return (
      <EmptyState
        title="Supabase is not configured"
        description="Enable your clinic backend to read in-app notifications."
      />
    );
  }

  if (error && items.length === 0) {
    return <EmptyState title="الخدمة غير متوفرة" description={error} />;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-white">الإشعارات الواردة</span>
          {unreadCount > 0 ? (
            <span className="rounded-full border border-cyan-500/30 bg-cyan-500/20 px-2.5 py-0.5 text-xs text-cyan-300">
              {unreadCount} غير مقروء
            </span>
          ) : (
            <span className="text-xs text-slate-500">كل الإشعارات مقروءة</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 px-3.5 py-1.5 text-xs text-slate-300 transition hover:bg-slate-900"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            تحديث
          </button>
          <button
            type="button"
            onClick={markAllRead}
            disabled={busy || unreadCount === 0}
            className="inline-flex items-center gap-1.5 rounded-full bg-cyan-500 px-3.5 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <CheckCheck className="h-3.5 w-3.5" />
            تحديد الكل كمقروء
          </button>
        </div>
      </div>


      {items.length === 0 ? (
        <EmptyState
          title="لا توجد إشعارات"
          description="ستظهر هنا تنبيهات المواعيد والحجوزات والتنبيهات المالية فور وصولها."
        />
      ) : (
        <ul className="space-y-2.5">
          {items.map((n) => {
            const style = TYPE_STYLES[n.type] ?? TYPE_STYLES.system;
            const isUnread = isInAppUnread(n.status);
            return (
              <li
                key={n.id}
                onClick={() => {
                  if (isUnread) void markRead(n.id);
                }}
                className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition ${
                  isUnread
                    ? 'border-cyan-500/20 bg-cyan-950/20 hover:bg-cyan-950/30'
                    : 'border-slate-800 bg-slate-950/70 hover:bg-slate-900/70'
                }`}
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-base ${style.bg}`}
                >
                  {style.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <p className={`truncate text-sm font-semibold ${isUnread ? 'text-white' : 'text-slate-300'}`}>
                      {n.payload?.title || 'إشعار عيادة'}
                    </p>
                    <span className="shrink-0 text-[11px] text-slate-500">{formatDateTime(n.created_at)}</span>
                  </div>
                  {n.payload?.body ? (
                    <p className="mt-1 text-xs leading-relaxed text-slate-400">{n.payload.body}</p>
                  ) : null}
                  {n.payload?.link ? (
                    <a
                      href={n.payload.link}
                      onClick={(e) => e.stopPropagation()}
                      className="mt-1.5 inline-block text-[11px] font-semibold text-cyan-400 hover:text-cyan-300"
                    >
                      عرض التفاصيل ←
                    </a>
                  ) : null}
                </div>
                {isUnread ? <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-cyan-400" /> : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

