'use client';

import { useCallback, useMemo } from 'react';
import { DayPicker } from 'react-day-picker';
import { ar } from 'react-day-picker/locale';
import 'react-day-picker/style.css';

import {
  fromISODate,
  formatArabicDate,
  isDaySelectable,
  maxBookableISO,
  monthKeyOf,
  startOfDay,
  startOfMonth,
  toISODate,
} from '@/lib/booking/calendar';

/**
 * BOOKING CALENDAR (step 3) — replaces `<input type="date">`.
 *
 * WHY: on iOS Chrome/Safari the native date input showed no placeholder and its
 * picker never opened, so the patient could not leave "اختر التاريخ" (#39).
 * A real, always-rendered calendar removes the dependency on native behaviour
 * entirely and works identically on iPhone / Android / desktop.
 *
 * Mobile-first decisions:
 * - RTL + Arabic locale, Saturday-first week (date-fns `ar`).
 * - Every day cell is a real <button> (≥ 40px, 44px from 375px up) with
 *   `touch-action: manipulation` — no 300ms tap delay, no double-tap zoom.
 * - Closed days (clinic holidays, provider vacations, non-working weekdays) are
 *   disabled so tapping them can never dead-end in "لا توجد أوقات متاحة".
 * - Fully controlled (month + value) so the page can keep the selection in the
 *   URL and survive the mobile reloads that wiped the old flow.
 */
type DatePickerProps = {
  /** Selected day as `YYYY-MM-DD` — the wire format the booking flow speaks. */
  value: string;
  /** Fired with `YYYY-MM-DD`. Never with an empty value. */
  onChange: (iso: string) => void;
  /** Closed days for the visible month (`/api/booking/calendar`). */
  closedDays?: string[];
  /** Weekdays the provider works (0 = Sunday). `null` → unknown, nothing masked. */
  workingWeekdays?: number[] | null;
  /** Visible month as `YYYY-MM` (controlled by the page). */
  month: string;
  onMonthChange: (month: string) => void;
  /** True while the visible month's closures are loading. */
  loading?: boolean;
  /** Optional line under the grid (e.g. "لا توجد أوقات متاحة في هذا اليوم"). */
  hint?: string | null;
};

export function DatePicker({
  value,
  onChange,
  closedDays,
  workingWeekdays,
  month,
  onMonthChange,
  loading = false,
  hint = null,
}: DatePickerProps) {
  const today = useMemo(() => startOfDay(), []);
  const todayISO = toISODate(today);
  const maxISO = useMemo(() => maxBookableISO(today), [today]);
  const selected = fromISODate(value);

  // Never show a month outside [today, +12 months].
  const firstMonth = startOfMonth(today);
  const requestedMonth = fromISODate(`${month}-01`) ?? selected ?? today;
  const visibleMonth = startOfMonth(requestedMonth).getTime() < firstMonth.getTime()
    ? firstMonth
    : startOfMonth(requestedMonth);

  const isDisabled = useCallback(
    (date: Date) =>
      !isDaySelectable({ iso: toISODate(date), todayISO, closedDays, workingWeekdays, maxISO }),
    [todayISO, closedDays, workingWeekdays, maxISO],
  );

  const handleSelect = (date: Date | undefined) => {
    // Tapping the already-selected day must never clear a valid choice.
    if (!date) return;
    onChange(toISODate(date));
  };

  return (
    <div className="booking-calendar mt-4 -mx-3 rounded-3xl border border-slate-800 bg-slate-950/60 p-1 sm:mx-0 sm:p-4" dir="rtl">
      <DayPicker
        mode="single"
        required
        dir="rtl"
        locale={ar}
        aria-label="تقويم اختيار تاريخ الموعد"
        selected={selected ?? undefined}
        onSelect={handleSelect}
        month={visibleMonth}
        onMonthChange={(next) => onMonthChange(monthKeyOf(next))}
        startMonth={firstMonth}
        endMonth={startOfMonth(fromISODate(maxISO) ?? today)}
        disabled={isDisabled}
        showOutsideDays={false}
      />
      <p className="mt-3 text-center text-xs text-slate-400" aria-live="polite">
        {loading
          ? 'جاري تحميل الأيام المتاحة...'
          : selected
            ? `التاريخ المختار: ${formatArabicDate(value)}`
            : 'اضغط على اليوم المناسب لك'}
      </p>
      {hint && <p className="mt-1 text-center text-xs text-amber-300">{hint}</p>}
    </div>
  );
}
