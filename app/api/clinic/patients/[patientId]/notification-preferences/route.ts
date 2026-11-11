import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ADMIN_ROLES } from '@/lib/services/clinicAuthorization';
import { permissionDenied } from '@/lib/services/permissionGate';
import {
  getPatientNotificationPreferences,
  upsertPatientNotificationPreferences,
} from '@/lib/services/recallService';
import { logEvent } from '@/lib/server/logging';

/**
 * PHASE 3 — Per-patient notification preferences (owner/manager only).
 * GET: current prefs · PUT: upsert (opt_out, channels, dnd window).
 * Enforced server-side at recall/notification generation — UI never trusted.
 */
export const runtime = 'nodejs';

const prefsSchema = z.object({
  opt_out: z.boolean().optional(),
  channels: z.array(z.enum(['whatsapp', 'telegram', 'sms', 'email'])).min(1).max(4).optional(),
  dnd_start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
  dnd_end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
});

export async function GET(req: Request, { params }: { params: { patientId: string } }) {
  try {
    const url = new URL(req.url);
    const clinicId = url.searchParams.get('clinic_id') ?? '';
    if (!clinicId) return NextResponse.json({ error: 'clinic_id is required' }, { status: 400 });
    const gate = await permissionDenied(req, clinicId, 'view_patients', { allowedRoles: ADMIN_ROLES });
    if (gate) return gate;

    const prefs = await getPatientNotificationPreferences(clinicId, params.patientId);
    return NextResponse.json({ data: prefs });
  } catch (err) {
    logEvent('patient_prefs_get_error', { error: err instanceof Error ? err.message : String(err) }, 'error');
    return NextResponse.json({ error: 'حدث خطأ غير متوقع' }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: { params: { patientId: string } }) {
  try {
    const body = await req.json().catch(() => null);
    const parsed = prefsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body', details: parsed.error.errors }, { status: 400 });
    }
    const url = new URL(req.url);
    const clinicId = url.searchParams.get('clinic_id') ?? '';
    if (!clinicId) return NextResponse.json({ error: 'clinic_id is required' }, { status: 400 });
    const gate = await permissionDenied(req, clinicId, 'manage_patients', { allowedRoles: ADMIN_ROLES });
    if (gate) return gate;

    const prefs = await upsertPatientNotificationPreferences({
      clinicId,
      patientId: params.patientId,
      optOut: parsed.data.opt_out,
      channels: parsed.data.channels,
      dndStart: parsed.data.dnd_start ?? null,
      dndEnd: parsed.data.dnd_end ?? null,
    });
    return NextResponse.json({ data: prefs });
  } catch (err) {
    logEvent('patient_prefs_put_error', { error: err instanceof Error ? err.message : String(err) }, 'error');
    return NextResponse.json({ error: 'حدث خطأ غير متوقع' }, { status: 500 });
  }
}