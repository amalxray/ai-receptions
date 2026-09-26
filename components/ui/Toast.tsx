'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShineBorder } from '@/components/ui/shine-border';
import { playNotificationChime } from '@/lib/audio/chime';

export type ToastType = 'success' | 'error' | 'info' | 'warning' | 'notification';

export type Toast = {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
  link?: string | null;
  duration?: number;
  /** Overrides the chime policy. Default: chime only for `notification` toasts. */
  chime?: boolean;
};

/**
 * #35 — modern toast visual language: five semantic palettes, each with a
 * conic border (ShineBorder), a soft radial blob and a 5s progress bar.
 */
const typeConfig: Record<
  ToastType,
  { icon: string; borderColors: string[]; blobColor: string; badgeBg: string; textAccent: string }
> = {
  success: {
    icon: '✓',
    borderColors: ['#10B981', '#34D399', '#059669'],
    blobColor: 'rgba(16, 185, 129, 0.18)',
    badgeBg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    textAccent: 'text-emerald-400',
  },
  error: {
    icon: '✕',
    borderColors: ['#EF4444', '#F87171', '#DC2626'],
    blobColor: 'rgba(239, 68, 68, 0.18)',
    badgeBg: 'bg-red-500/20 text-red-300 border-red-500/30',
    textAccent: 'text-red-400',
  },
  info: {
    icon: 'ⓘ',
    borderColors: ['#06B6D4', '#38BDF8', '#0284C7'],
    blobColor: 'rgba(6, 182, 212, 0.18)',
    badgeBg: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
    textAccent: 'text-cyan-400',
  },
  warning: {
    icon: '!',
    borderColors: ['#F59E0B', '#FBBF24', '#D97706'],
    blobColor: 'rgba(245, 158, 11, 0.18)',
    badgeBg: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    textAccent: 'text-amber-400',
  },
  notification: {
    icon: '🔔',
    borderColors: ['#8B5CF6', '#EC4899', '#3B82F6'],
    blobColor: 'rgba(139, 92, 246, 0.22)',
    badgeBg: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    textAccent: 'text-purple-300',
  },
};

// ─── Global toast store ──────────────────────────────────────────────────────
// One store, one viewport. Previously every `useToast()` call owned private
// state that nothing rendered, so toasts silently vanished. The store also
// guarantees a single chime per toast (no duplicates from multiple consumers).
let toastStore: Toast[] = [];
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): Toast[] {
  return toastStore;
}

export function pushToast(toast: Omit<Toast, 'id'>): string {
  const id = `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  toastStore = [...toastStore, { ...toast, id }];
  emit();

  const shouldChime = toast.chime ?? toast.type === 'notification';
  if (shouldChime) {
    try {
      playNotificationChime();
    } catch {
      // Autoplay policy may block the AudioContext until first user gesture.
    }
  }

  if (toast.duration !== Infinity) {
    const dur = toast.duration ?? 5000;
    setTimeout(() => dismissToast(id), dur);
  }

  return id;
}

export function dismissToast(id: string): void {
  const next = toastStore.filter((t) => t.id !== id);
  if (next.length === toastStore.length) return;
  toastStore = next;
  emit();
}


export function useToast() {
  const toasts = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return { toasts, addToast: pushToast, removeToast: dismissToast };
}

/**
 * Single global viewport. Mount ONCE per shell (see app/(dashboard)/layout.tsx).
 * It also bridges `window.dispatchEvent(new CustomEvent('toast:dispatch'))`
 * so non-React code (cron hooks, plain services) can raise a toast.
 */
export function ToastViewport() {
  const toasts = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    function handleDispatch(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (detail && typeof detail === 'object') pushToast(detail as Omit<Toast, 'id'>);
    }
    window.addEventListener('toast:dispatch', handleDispatch);
    return () => window.removeEventListener('toast:dispatch', handleDispatch);
  }, []);

  return <ToastContainer toasts={toasts} removeToast={dismissToast} />;
}

export function ToastContainer({
  toasts,
  removeToast,
}: {
  toasts: Toast[];
  removeToast: (id: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-6 left-6 z-[100] flex flex-col gap-3 pointer-events-none max-w-md w-full"
      dir="rtl"
    >
      <AnimatePresence mode="popLayout">
        {toasts.map((t) => {
          const cfg = typeConfig[t.type] ?? typeConfig.info;
          const durationSec = (t.duration ?? 5000) / 1000;

          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 24, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: -40, scale: 0.94 }}
              transition={{ type: 'spring', stiffness: 320, damping: 26 }}
              className="pointer-events-auto"
            >
              <ShineBorder
                borderWidth={1.5}
                duration={8}
                shineColor={cfg.borderColors}
                className="relative overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-950/95 p-4 shadow-2xl backdrop-blur-xl"
              >
                {/* Soft radial Blob */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute -top-16 -left-16 h-40 w-40 rounded-full blur-3xl"
                  style={{ background: cfg.blobColor }}
                />

                <div className="relative flex items-start gap-3">
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-base ${cfg.badgeBg}`}
                    aria-hidden
                  >
                    {cfg.icon}
                  </span>

                  <div className="min-w-0 flex-1">
                    {t.title ? (
                      <p className={`text-sm font-bold ${cfg.textAccent}`}>{t.title}</p>
                    ) : null}
                    <p className="mt-0.5 text-xs leading-relaxed text-slate-300">{t.message}</p>

                    {t.link ? (
                      <a
                        href={t.link}
                        className="mt-2 inline-block text-xs font-semibold text-cyan-400 underline underline-offset-2 hover:text-cyan-300"
                      >
                        عرض التفاصيل ←
                      </a>
                    ) : null}
                  </div>

                  <button
                    type="button"
                    onClick={() => removeToast(t.id)}
                    aria-label="إغلاق التنبيه"
                    className="rounded-lg p-1 text-sm text-slate-500 transition-colors hover:bg-slate-800/50 hover:text-slate-300"
                  >
                    ✕
                  </button>
                </div>

                {/* Progress bar — 5s by default */}
                {t.duration !== Infinity ? (
                  <div className="relative mt-3 h-1 w-full overflow-hidden rounded-full bg-slate-800/60">
                    <motion.div
                      initial={{ width: '100%' }}
                      animate={{ width: '0%' }}
                      transition={{ duration: durationSec, ease: 'linear' }}
                      className="h-full rounded-full"
                      style={{
                        background: `linear-gradient(to left, ${cfg.borderColors[0]}, ${cfg.borderColors[1] ?? cfg.borderColors[0]})`,
                      }}
                    />
                  </div>
                ) : null}
              </ShineBorder>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

// ─── Convenience API (usable outside React) ─────────────────────────────────
export const toast = {
  success: (message: string, options?: { title?: string; duration?: number }) =>
    pushToast({ type: 'success', message, title: options?.title ?? 'نجاح', duration: options?.duration }),
  error: (message: string, options?: { title?: string; duration?: number }) =>
    pushToast({ type: 'error', message, title: options?.title ?? 'خطأ', duration: options?.duration }),
  info: (message: string, options?: { title?: string; duration?: number }) =>
    pushToast({ type: 'info', message, title: options?.title ?? 'تنبيه', duration: options?.duration }),
  warning: (message: string, options?: { title?: string; duration?: number }) =>
    pushToast({ type: 'warning', message, title: options?.title ?? 'تحذير', duration: options?.duration }),
  /** In-app clinic notification — chimes by default. */
  notification: (title: string, message: string, options?: { link?: string; duration?: number }) =>
    pushToast({
      type: 'notification',
      title,
      message,
      link: options?.link ?? null,
      duration: options?.duration,
    }),
};

