import { NextResponse } from 'next/server';
import { featureGateForClinic } from '@/lib/subscription/featureGateServer';
import {
  authorizeClinicRequest,
  roleDenied,
  ADMIN_ROLES,
  DATA_ROLES,
} from '@/lib/services/clinicAuthorization';
import { listClinicBeforeAfter, createClinicBeforeAfter } from '@/lib/services/clinicBeforeAfter';
import { logEvent } from '@/lib/server/logging';
import { writeAuditLog } from '@/lib/services/auditService';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const clinicId = url.searchParams.get('clinic_id');
    if (!clinicId) return NextResponse.json({ error: 'clinic_id is required' }, { status: 400 });

    const authorization = await authorizeClinicRequest(req, clinicId);
    if (!authorization.authorized || roleDenied(authorization, DATA_ROLES)) {
      return NextResponse.json(
        { error: authorization.status === 401 ? 'Unauthorized' : 'Forbidden' },
        { status: authorization.status }
      );
    }


    // Feature gate (v2) — tier-restricted feature.
    const gate = await featureGateForClinic(clinicId, 'before-after');
    if (!gate.allowed) {
      logEvent('feature_gate_denied', { clinic_id: clinicId, feature: 'before-after', plan_id: gate.planId });
      return NextResponse.json(
        { error: 'FEATURE_LOCKED', required_plan: gate.requiredPlan, plan_name_ar: gate.planNameAr },
        { status: 402 }
      );
    }
    const data = await listClinicBeforeAfter(clinicId);
    return NextResponse.json({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logEvent('before_after_get_error', { error: message }, 'error');
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

/**
 * POST /api/clinic/before-after — owner adds a case.
 * multipart/form-data: title (required), description, before (file), after (file),
 * patient_consent ('true' required — service layer hard-refuses otherwise).
 */
export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const clinicId = url.searchParams.get('clinic_id');
    if (!clinicId) return NextResponse.json({ error: 'clinic_id is required' }, { status: 400 });

    const authorization = await authorizeClinicRequest(req, clinicId);
    if (!authorization.authorized || roleDenied(authorization, ADMIN_ROLES)) {
      return NextResponse.json(
        { error: authorization.status === 401 ? 'Unauthorized' : 'Forbidden' },
        { status: authorization.status }
      );
    }

    const form = await req.formData();
    const before = form.get('before');
    const after = form.get('after');
    if (!(before instanceof File) || !(after instanceof File)) {
      return NextResponse.json({ error: 'صورتا «قبل» و«بعد» مطلوبتان' }, { status: 400 });
    }
    const title = String(form.get('title') ?? '').trim();
    const description = String(form.get('description') ?? '').trim();
    const consent = String(form.get('patient_consent') ?? '') === 'true';


    // Feature gate (v2) — tier-restricted feature.
    const gate = await featureGateForClinic(clinicId, 'before-after');
    if (!gate.allowed) {
      logEvent('feature_gate_denied', { clinic_id: clinicId, feature: 'before-after', plan_id: gate.planId });
      return NextResponse.json(
        { error: 'FEATURE_LOCKED', required_plan: gate.requiredPlan, plan_name_ar: gate.planNameAr },
        { status: 402 }
      );
    }
    const result = await createClinicBeforeAfter(clinicId, {
      title,
      description,
      beforeFile: before,
      afterFile: after,
      patient_consent: consent,
    });
    if (!('item' in result)) return NextResponse.json({ error: result.message }, { status: 400 });

    await writeAuditLog({
      clinicId,
      actorUserId: authorization.user?.id ?? null,
      action: 'clinic.before_after.create',
      resourceType: 'clinic',
      resourceId: clinicId,
    });
    return NextResponse.json({ data: result.item }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logEvent('before_after_create_error', { error: message }, 'error');
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}