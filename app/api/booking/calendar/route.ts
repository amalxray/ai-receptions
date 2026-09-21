import { NextResponse } from 'next/server';
import { z } from 'zod';
import { loadProviderSchedule } from '@/lib/services/bookingService';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { logEvent } from '@/lib/server/logging';
import { daysInMonth, ISO_MONTH_RE } from '@/lib/booking/calendar';

/**
 * GET /api/booking/calendar — the days a provider CANNOT work in a month.
 *
 * Public + read-only. Powers the disabled days of the booking calendar so a
 * patient stops tapping a day whose only possible answer is
 * "لا توجد أوقات متاحة في هذا التاريخ" (#39 iOS follow-up: the native date input
 * could not even be opened on iOS, and it knew nothing about closures).
 *
 * Two independent sources, both owner-managed:
 * - `clinic_holidays` + `provider_vacations` → absolute closed days
 * - `provider_schedules.enabled`             → the provider's weekly pattern
 *
 * Deliberately FAIL-OPEN: a missing schedule or a holiday query error returns an
 * EMPTY closed set rather than masking days. `getAvailableSlots` stays the single
 * source of truth for what is actually bookable, so a broken probe degrades to
 * the old behaviour instead of blanking the calendar.
 */
const calendarSchema = z.object({
  clinic_id: z.string().uuid(),
  provider_id: z.string().uuid(),
  month: z.string().regex(ISO_MONTH_RE, 'month must be YYYY-MM'),
});

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const parsed = calendarSchema.safeParse({
      clinic_id: url.searchParams.get('clinic_id'),
      provider_id: url.searchParams.get('provider_id'),
      month: url.searchParams.get('month'),
    });

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request parameters', details: parsed.error.errors }, { status: 400 });
    }

    const { clinic_id, provider_id, month } = parsed.data;

    // Also verifies the provider belongs to this clinic (throws nothing, returns null).
    const schedule = await loadProviderSchedule(clinic_id, provider_id);
    if (!schedule) {
      return NextResponse.json({ error: 'Provider not found for this clinic' }, { status: 404 });
    }

    const days = daysInMonth(month);
    if (days.length === 0) {
      return NextResponse.json({ error: 'Invalid request parameters' }, { status: 400 });
    }

    // Weekly pattern. An empty set means "no schedule configured" → unknown, so
    // the client masks nothing (fail-open).
    const workingWeekdays = Array.from(
      new Set(schedule.days.filter((day) => day.enabled).map((day) => day.weekday))
    ).sort((a, b) => a - b);
    const scheduleKnown = workingWeekdays.length > 0;

    const vacations = new Set((schedule.vacationDates ?? []).map((date) => String(date).slice(0, 10)));

    const { data: holidayRows, error: holidayError } = await supabaseAdmin
      .from('clinic_holidays')
      .select('holiday_date')
      .eq('clinic_id', clinic_id)
      .gte('holiday_date', days[0])
      .lte('holiday_date', days[days.length - 1]);

    if (holidayError) {
      // Fail-open — vacations and the weekly pattern still apply.
      logEvent('booking_calendar_holidays_error', { clinic_id, error: holidayError.message }, 'error');
    }

    const holidays = new Set((holidayRows ?? []).map((row) => String(row.holiday_date).slice(0, 10)));
    const closedDays = days.filter((iso) => holidays.has(iso) || vacations.has(iso));

    return NextResponse.json({
      data: {
        month,
        closed_days: closedDays,
        working_weekdays: scheduleKnown ? workingWeekdays : [],
        schedule_known: scheduleKnown,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logEvent('booking_calendar_error', { error: message }, 'error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
