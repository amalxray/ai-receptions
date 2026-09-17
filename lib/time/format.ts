/**
 * 12-HOUR TIME FORMATTING (project-wide utility — Global by Default).
 *
 * User decision: all patient-facing times are displayed in 12-hour Arabic form
 * ("9:00 ص", "2:00 م"). Storage stays 24-hour "HH:MM" everywhere (DB convention
 * unchanged) — only DISPLAY converts. Import from here; never re-implement.
 */

/** "09:00" | "09:00:00" → "9:00 ص". Falls back to the input when unparseable. */
export function format12h(time24: string | null | undefined): string {
  if (!time24) return '';
  const match = /^(\d{1,2}):(\d{2})/.exec(time24.trim());
  if (!match) return time24;
  const hours24 = Number(match[1]);
  const minutes = match[2];
  const period = hours24 < 12 ? 'ص' : 'م';
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${minutes} ${period}`;
}

/** "09:00" + "20:00" → "9:00 ص — 8:00 م". */
export function format12hRange(start: string | null | undefined, end: string | null | undefined): string {
  if (!start && !end) return '';
  if (!start) return format12h(end);
  if (!end) return format12h(start);
  return `${format12h(start)} — ${format12h(end)}`;
}

/** English weekday names, index-aligned with `provider_schedules.weekday` (0 = Sunday). */
const ENGLISH_WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

/** 0 → "Sunday" … 6 → "Saturday" (server-computed day names — never let the LLM compute them). */
export function englishDayName(weekday: number): string {
  return ENGLISH_WEEKDAYS[weekday] ?? '';
}
