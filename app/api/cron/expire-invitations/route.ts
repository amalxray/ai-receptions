import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { logEvent } from '@/lib/server/logging';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * EXPIRY SWEEP for team invitations (#38 / migration 20261017).
 *
 * GET /api/cron/expire-invitations  (Authorization: Bearer $CRON_SECRET)
 *
 * Every pending invitation whose `expires_at` has passed becomes 'expired', so a
 * lapsed row can never be opened or accepted — the UI and the accept RPC both
 * refuse it, and the list stops showing it as pending. The heavy lifting is in
 * the SQL function `expire_stale_invitations()`: one conditional UPDATE, so a
 * run that races an extension or an acceptance simply matches zero rows.
 *
 * Scheduled daily at 03:00 UTC in vercel.json; the secret check mirrors
 * /api/cron/notifications (skipped when CRON_SECRET is unset, e.g. local dev).
 */
export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (token !== cronSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const { data, error } = await supabaseAdmin.rpc('expire_stale_invitations');

    if (error) {
      // The sweep function ships with migration 20261017: until it is applied the
      // cron cannot run, and the log must say exactly that.
      const missing = error.code === 'PGRST202' || error.code === '42883' || /could not find the function/i.test(error.message ?? '');
      logEvent(
        'invitation_expiry_sweep_error',
        {
          error: error.message,
          code: error.code,
          ...(missing ? { hint: 'apply migration 20261017_invitation_security.sql' } : {}),
        },
        'error'
      );
      return NextResponse.json({ error: missing ? 'RPC_NOT_DEPLOYED' : 'Internal server error' }, { status: 500 });
    }

    const expired = typeof data === 'number' ? data : 0;
    logEvent('invitation_expiry_sweep', { expired });

    return NextResponse.json({ data: { expired } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logEvent('invitation_expiry_sweep_error', { error: message }, 'error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
