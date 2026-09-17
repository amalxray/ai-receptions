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
import { getClinicHours, isOpenNow, nextOpening } from '@/lib/services/clinicHours';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const slug = (searchParams.get('slug') ?? '').trim().slice(0, 120);
    if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

    const clinic = await resolvePublicClinic({ slug });
    if (!clinic) return NextResponse.json({ error: 'Clinic not found' }, { status: 404 });

    // SINGLE SOURCE OF TRUTH (F2): hours + "open now" + "next opening" all come
    // from lib/services/clinicHours, which merges provider_schedules per weekday
    // (earliest start / latest end, `shifts` included) and evaluates the clock in
    // the CLINIC's IANA timezone. Previously this route used `now.getHours()` —
    // the SERVER clock (UTC on Vercel) — so an Asia/Hebron clinic reported the
    // wrong status for 3 hours of every day.
    const hours = await getClinicHours(clinic.id);
    const status = await isOpenNow(hours);
    const opening = status.isOpen ? null : await nextOpening(hours);

    return NextResponse.json({
      data: {
        isOpen: status.isOpen,
        todaySchedule: status.day ? { start: status.day.start, end: status.day.end } : null,
        nextOpening: opening ? { day: opening.day, time: opening.time } : null,
        currentTime: status.currentTime,
        timezone: status.timezone,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error' },
      { status: 500 }
    );
  }
}