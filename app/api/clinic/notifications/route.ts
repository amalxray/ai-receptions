import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { logEvent } from '@/lib/server/logging';
import { IN_APP_UNREAD_STATUSES, IN_APP_READ_STATUS, isInAppUnread } from '@/lib/notification/inAppStatus';

export const dynamic = 'force-dynamic';

const markReadSchema = z.object({
  notificationId: z.string().uuid().optional(),
  markAll: z.boolean().optional(),
});

const createInAppSchema = z.object({
  type: z.string().min(1).max(100).default('system'),
  title: z.string().min(1).max(200),
  body: z.string().max(2000).optional(),
  link: z.string().max(500).optional(),
});

/**
 * Reads the tenant id from the query string. `clinic_id` is the codebase-wide
 * convention; `clinicId` is accepted as a back-compat alias.
 */
function readClinicId(request: NextRequest): string | null {
  const { searchParams } = new URL(request.url);
  return searchParams.get('clinic_id') ?? searchParams.get('clinicId');
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const clinicId = readClinicId(request);
    const limit = Math.min(Number(searchParams.get('limit')) || 20, 50);

    if (!clinicId) {
      return NextResponse.json({ error: 'clinicId is required' }, { status: 400 });
    }

    // Query in-app notifications for this clinic
    const { data: notifications, error } = await supabaseAdmin
      .from('notifications')
      .select('id, clinic_id, type, channel, payload, status, created_at')
      .eq('clinic_id', clinicId)
      .eq('channel', 'inapp')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      logEvent('clinic_inapp_notifications_fetch_failed', { clinicId, error: error.message }, 'error');
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Normalise the two "not seen yet" statuses this table is written with
    // (`unread` from this feature, `pending` from the admin/service producers)
    // into one stable wire contract for the client.
    const normalised = (notifications || []).map((n) => ({
      ...n,
      status: isInAppUnread(n.status) ? 'unread' : 'read',
    }));

    // Calculate unread count — must match the producers, not just our own writes.
    const { count: unreadCount, error: countError } = await supabaseAdmin
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('clinic_id', clinicId)
      .eq('channel', 'inapp')
      .in('status', [...IN_APP_UNREAD_STATUSES])
      .is('deleted_at', null);

    if (countError) {
      logEvent('clinic_inapp_notifications_count_failed', { clinicId, error: countError.message }, 'warn');
    }

    return NextResponse.json({
      notifications: normalised,
      unreadCount: unreadCount ?? 0,
    });
  } catch (err: any) {
    logEvent('clinic_inapp_notifications_error', { error: err?.message }, 'error');
    return NextResponse.json({ error: err?.message || 'Internal Server Error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const clinicId = readClinicId(request);

    if (!clinicId) {
      return NextResponse.json({ error: 'clinicId is required' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const parsed = markReadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid body' }, { status: 400 });
    }

    const { notificationId, markAll } = parsed.data;

    if (markAll) {
      const { error } = await supabaseAdmin
        .from('notifications')
        .update({ status: IN_APP_READ_STATUS, delivered_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('clinic_id', clinicId)
        .eq('channel', 'inapp')
        .in('status', [...IN_APP_UNREAD_STATUSES]);

      if (error) {
        logEvent('clinic_inapp_mark_all_read_failed', { clinicId, error: error.message }, 'error');
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, markedAll: true });
    }

    if (notificationId) {
      const { data, error } = await supabaseAdmin
        .from('notifications')
        .update({ status: IN_APP_READ_STATUS, delivered_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', notificationId)
        .eq('clinic_id', clinicId)
        .eq('channel', 'inapp')
        .select()
        .single();

      if (error) {
        logEvent('clinic_inapp_mark_read_failed', { clinicId, notificationId, error: error.message }, 'error');
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, notification: data });
    }

    return NextResponse.json({ error: 'Either notificationId or markAll must be provided' }, { status: 400 });
  } catch (err: any) {
    logEvent('clinic_inapp_patch_error', { error: err?.message }, 'error');
    return NextResponse.json({ error: err?.message || 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const clinicId = readClinicId(request);

    if (!clinicId) {
      return NextResponse.json({ error: 'clinicId is required' }, { status: 400 });
    }

    const raw = await request.json().catch(() => ({}));
    const parsed = createInAppSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid payload' }, { status: 400 });
    }

    const { type, title, body, link } = parsed.data;

    const { data, error } = await supabaseAdmin
      .from('notifications')
      .insert([
        {
          clinic_id: clinicId,
          channel: 'inapp',
          type,
          status: IN_APP_UNREAD_STATUSES[0],
          payload: {
            title,
            body: body || null,
            link: link || null,
          },
          created_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (error) {
      logEvent('clinic_inapp_create_failed', { clinicId, error: error.message }, 'error');
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, notification: data }, { status: 201 });
  } catch (err: any) {
    logEvent('clinic_inapp_post_error', { error: err?.message }, 'error');
    return NextResponse.json({ error: err?.message || 'Internal Server Error' }, { status: 500 });
  }
}
