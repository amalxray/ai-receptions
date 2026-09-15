/**
 * PUBLIC HOURS STATUS — live "open now / closed" for a clinic's public page.
 * GET /api/public/clinic/hours-status?slug={slug}
 *
 * Read-only, public-safe: slug resolves through resolvePublicClinic (deleted
 * clinics and non-active slugs return null → 404). Weekday convention matches
 * provider_schedules: 0=Sunday (same as JS Date.getDay). Schedules are merged
 * per weekday exactly like the public profile aggregation (earliest start /
 * latest end across providers), so the badge never contradicts the hours table.
 * No auth, no PII beyond what the public page already shows.
 */
import { NextResponse } from 'next/server';
import { resolvePublicClinic } from '@/lib/services/clinics';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const DAYS_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const slug = (searchParams.get('slug') ?? '').trim().slice(0, 120);
    if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

    const clinic = await resolvePublicClinic({ slug });
    if (!clinic) return NextResponse.json({ error: 'Clinic not found' }, { status: 404 });

    const { data: scheduleRows, error } = await supabaseAdmin
      .from('provider_schedules')
      .select('weekday, start_time, end_time')
      .eq('clinic_id', clinic.id)
      .eq('enabled', true);
    if (error) throw new Error(error.message);

    // Merge per weekday (same policy as clinicPublicProfile workingHours).
    const byWeekday = new Map<number, { start: string; end: string }>();
    for (const row of scheduleRows ?? []) {
      if (typeof row.weekday !== 'number' || !row.start_time || !row.end_time) continue;
      const existing = byWeekday.get(row.weekday);
      if (!existing) {
        byWeekday.set(row.weekday, { start: row.start_time, end: row.end_time });
      } else {
        if (row.start_time < existing.start) existing.start = row.start_time;
        if (row.end_time > existing.end) existing.end = row.end_time;
      }
    }

    const now = new Date();
    const today = now.getDay();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const todaySchedule = byWeekday.get(today) ?? null;
    const isOpen = Boolean(
      todaySchedule && currentTime >= todaySchedule.start && currentTime < todaySchedule.end
    );

    // Next opening: today (before opening time) → غداً → first scheduled day after.
    let nextOpening: { day: string; time: string } | null = null;
    if (!isOpen) {
      for (let i = 0; i <= 7 && !nextOpening; i++) {
        const wd = (today + i) % 7;
        const sched = byWeekday.get(wd);
        if (!sched) continue;
        if (i === 0 && currentTime >= sched.start) continue; // today's window already passed/ongoing
        nextOpening = {
          day: i === 0 ? 'اليوم' : i === 1 ? 'غداً' : DAYS_AR[wd],
          time: sched.start.slice(0, 5),
        };
      }
    }

    return NextResponse.json({
      data: {
        isOpen,
        todaySchedule: todaySchedule
          ? { start: todaySchedule.start.slice(0, 5), end: todaySchedule.end.slice(0, 5) }
          : null,
        nextOpening,
        currentTime,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error' },
      { status: 500 }
    );
  }
}