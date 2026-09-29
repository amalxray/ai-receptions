'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, Search, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';

/**
 * N28 — the search bar of the search-only patients page.
 *
 * Owns the 300ms debounce (typing must never fire one request per keystroke) and
 * the click-ripple micro-interaction that the result row and the patient panel
 * reuse from here, so the "one ripple implementation" rule holds without adding
 * an eighth file to this delivery.
 */

export const SEARCH_DEBOUNCE_MS = 300;

type RippleDot = { id: number; x: number; y: number; size: number };

/**
 * Material-style press ripple: `spawn(event)` on pointer-down, `layer` rendered
 * inside the host element (the host needs `relative overflow-hidden` so the dots
 * are clipped to its rounded shape).
 */
export function usePressRipple(): { spawn: (event: PointerEvent<HTMLElement>) => void; layer: ReactNode } {
  const [ripples, setRipples] = useState<RippleDot[]>([]);
  const seq = useRef(0);

  const spawn = useCallback((event: PointerEvent<HTMLElement>) => {
    const host = event.currentTarget as HTMLElement | null;
    if (!host) return;
    const rect = host.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 1.6;
    const id = (seq.current += 1);
    setRipples((current) => [
      ...current,
      { id, x: event.clientX - rect.left - size / 2, y: event.clientY - rect.top - size / 2, size },
    ]);
    window.setTimeout(() => setRipples((current) => current.filter((dot) => dot.id !== id)), 650);
  }, []);

  const layer = (
    <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
      <AnimatePresence>
        {ripples.map((dot) => (
          <motion.span
            key={dot.id}
            initial={{ scale: 0, opacity: 0.3 }}
            animate={{ scale: 1, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.62, ease: 'easeOut' }}
            style={{
              position: 'absolute',
              left: dot.x,
              top: dot.y,
              width: dot.size,
              height: dot.size,
              borderRadius: '9999px',
              background: 'currentColor',
            }}
          />
        ))}
      </AnimatePresence>
    </span>
  );

  return { spawn, layer };
}

type PatientSearchBarProps = {
  /** Debounced value owned by the page (the single source of truth). */
  value: string;
  /** Called 300ms after typing stops, and immediately on Enter / clear. */
  onChange: (value: string) => void;
  loading?: boolean;
  /** Result summary chip, e.g. «3 نتائج» — null hides it. */
  hint?: string | null;
  autoFocus?: boolean;
  /** Escape clears the input (and tells the page to drop the selection). */
  onEscape?: () => void;
  placeholder?: string;
};

export default function PatientSearchBar({
  value,
  onChange,
  loading = false,
  hint = null,
  autoFocus = false,
  onEscape,
  placeholder = 'ابحث بالاسم أو الهاتف أو البريد أو الملاحظة…',
}: PatientSearchBarProps) {
  const [draft, setDraft] = useState(value);
  const [focused, setFocused] = useState(false);
  const lastEmitted = useRef(value);
  const { spawn, layer } = usePressRipple();

  /** External resets (clear / "إضافة مريض" saved) win over the local draft. */
  useEffect(() => {
    setDraft((current) => (current === value ? current : value));
    lastEmitted.current = value;
  }, [value]);

  /** The 300ms debounce: only a real change is emitted, never the mount value. */
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (draft === lastEmitted.current) return;
      lastEmitted.current = draft;
      onChange(draft);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [draft, onChange]);

  const emitNow = useCallback(
    (next: string) => {
      setDraft(next);
      if (next === lastEmitted.current) return;
      lastEmitted.current = next;
      onChange(next);
    },
    [onChange]
  );

  const clear = useCallback(() => {
    emitNow('');
    onEscape?.();
  }, [emitNow, onEscape]);

  return (
    <motion.div
      role="search"
      initial={{ opacity: 0, y: 14, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="relative mx-auto w-full max-w-3xl"
    >
      {/* Ambient halo — warms up while the field is focused. */}
      <motion.span
        aria-hidden
        className="pointer-events-none absolute -inset-3 rounded-[2.5rem] bg-gradient-to-l from-cyan-500/25 via-sky-500/10 to-emerald-500/25 blur-2xl"
        animate={{ opacity: focused ? 0.85 : 0.3, scale: focused ? 1.02 : 0.97 }}
        transition={{ duration: 0.35 }}
      />

      <motion.div
        className="relative overflow-hidden rounded-[2rem] border border-slate-700/70 bg-slate-900/80 shadow-2xl shadow-slate-950/40 backdrop-blur-xl"
        animate={{
          borderColor: focused ? 'rgba(34,211,238,0.65)' : 'rgba(51,65,85,0.7)',
          boxShadow: focused
            ? '0 0 40px -12px rgba(34,211,238,0.55)'
            : '0 18px 40px -24px rgba(2,6,23,0.9)',
        }}
        transition={{ duration: 0.25 }}
      >
        {layer}

        {/* Scanning shimmer while the request is in flight. */}
        <AnimatePresence>
          {loading && (
            <motion.span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 w-1/3 bg-gradient-to-l from-transparent via-cyan-400/20 to-transparent"
              initial={{ x: '-120%', opacity: 0 }}
              animate={{ x: '320%', opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.1, repeat: Infinity, ease: 'linear' }}
            />
          )}
        </AnimatePresence>

        <div className="relative flex items-center gap-3 px-5 py-4">
          <motion.span
            aria-hidden
            className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-cyan-500/25 to-emerald-500/20 text-cyan-200 ring-1 ring-cyan-500/30"
            animate={{ scale: focused ? 1.06 : 1, rotate: focused ? -6 : 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 18 }}
          >
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Search className="h-5 w-5" />}
          </motion.span>

          <label htmlFor="patient-search-input" className="sr-only">
            البحث في المرضى
          </label>
          <input
            id="patient-search-input"
            value={draft}
            autoFocus={autoFocus}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => setDraft(event.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                emitNow(draft);
              }
              if (event.key === 'Escape') clear();
            }}
            placeholder={placeholder}
            className="min-w-0 flex-1 bg-transparent text-lg font-medium text-slate-100 outline-none placeholder:text-slate-500 md:text-xl"
          />

          <AnimatePresence initial={false}>
            {hint && <ResultHint key={hint}>{hint}</ResultHint>}
            {draft.length > 0 && (
              <motion.button
                key="clear"
                type="button"
                aria-label="مسح البحث"
                onClick={clear}
                onPointerDown={spawn}
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.6 }}
                className="relative grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full border border-slate-700 text-slate-400 transition-colors hover:border-red-500/50 hover:text-red-300"
              >
                {layer}
                <X className="h-4 w-4" />
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
}

/** Small chip showing how many patients matched the current query. */
function ResultHint({ children }: { children: ReactNode }) {
  return (
    <motion.span
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      className="shrink-0 rounded-full bg-slate-800/80 px-3 py-1 text-xs font-semibold text-cyan-200 ring-1 ring-cyan-500/25"
    >
      {children}
    </motion.span>
  );
}
