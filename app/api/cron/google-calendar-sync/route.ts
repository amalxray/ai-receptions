import { NextResponse } from 'next/server';
import { logEvent } from '@/lib/server/logging';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { syncGoogleCalendarAppointment } from '@/lib/services/googleCalendarSync';

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (token !== cronSecret) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { data: appointments, error } = await supabaseAdmin
      .from('appointments')
      .select('id')
      .eq('needs_google_sync', true)
      .is('google_sync_blocked_at', null)
      .is('google_event_id', null)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(50);
    if (error) throw error;

    let synced = 0;
    let blocked = 0;
    let skipped = 0;
    let failed = 0;
    for (const appointment of appointments ?? []) {
      try {
        const result = await syncGoogleCalendarAppointment(appointment.id);
        if (result === 'synced') synced += 1;
        else if (result === 'blocked') blocked += 1;
        else skipped += 1;
      } catch {
        failed += 1;
      }
    }

    logEvent('google_calendar_retry_cron_finished', {
      found: appointments?.length ?? 0,
      synced,
      blocked,
      skipped,
      failed,
    });
    return NextResponse.json({ data: { found: appointments?.length ?? 0, synced, blocked, skipped, failed } });
  } catch (error) {
    logEvent('google_calendar_retry_cron_failed', {
      error: error instanceof Error ? error.message : 'Unknown cron error',
    }, 'error');
    return NextResponse.json({ error: 'Google Calendar retry job failed' }, { status: 500 });
  }
}
