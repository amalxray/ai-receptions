import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePlatformAdmin } from '@/lib/services/platformAdmin';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { logEvent } from '@/lib/server/logging';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const limitSchema = z.object({
  clinic_id: z.string().uuid(),
  soft_limit_bytes: z.number().int().positive(),
  warning_percent: z.number().int().min(1).max(100).default(80),
  notification_email: z.string().email().nullable().optional(),
});

function getConfiguredProjectCapacity(): number | null {
  const raw = process.env.SUPABASE_STORAGE_QUOTA_BYTES;
  if (!raw || !/^\d+$/.test(raw)) return null;
  const bytes = Number(raw);
  return Number.isSafeInteger(bytes) && bytes > 0 ? bytes : null;
}

export async function GET(req: Request) {
  const gate = await requirePlatformAdmin(req);
  if (!gate.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: gate.status });

  const [projectResult, clinicsResult, limitsResult, usageResult] = await Promise.all([
    supabaseAdmin.from('storage_project_usage_snapshots')
      .select('total_bytes, object_count, unknown_size_object_count, unclassified_bytes, unclassified_object_count, measured_at')
      .eq('id', 1)
      .maybeSingle(),
    supabaseAdmin.from('clinics').select('id, name'),
    supabaseAdmin.from('clinic_storage_limits')
      .select('clinic_id, soft_limit_bytes, warning_percent, notification_email, last_alert_sent_at'),
    supabaseAdmin.from('clinic_storage_usage_snapshots')
      .select('clinic_id, total_bytes, object_count, unknown_size_object_count, measured_at'),
  ]);
  const queryError = projectResult.error || clinicsResult.error || limitsResult.error || usageResult.error;
  if (queryError) {
    logEvent('storage_usage_admin_read_failed', { error: queryError.message }, 'error');
    return NextResponse.json({ error: 'تعذر تحميل بيانات استخدام التخزين' }, { status: 500 });
  }

  const capacityBytes = getConfiguredProjectCapacity();
  const project = projectResult.data;
  const clinics = clinicsResult.data ?? [];
  const limits = new Map((limitsResult.data ?? []).map((row) => [row.clinic_id, row]));
  const usage = new Map((usageResult.data ?? []).map((row) => [row.clinic_id, row]));

  return NextResponse.json({
    data: {
      project: project ? {
        total_bytes: Number(project.total_bytes),
        object_count: Number(project.object_count),
        unknown_size_object_count: Number(project.unknown_size_object_count),
        unclassified_bytes: Number(project.unclassified_bytes),
        unclassified_object_count: Number(project.unclassified_object_count),
        measured_at: project.measured_at,
        capacity_bytes: capacityBytes,
        percent_used: capacityBytes ? (Number(project.total_bytes) / capacityBytes) * 100 : null,
      } : null,
      project_capacity_configured: capacityBytes !== null,
      clinics: clinics.map((clinic) => {
        const snapshot = usage.get(clinic.id);
        const limit = limits.get(clinic.id);
        const softLimitBytes = limit ? Number(limit.soft_limit_bytes) : null;
        return {
          clinic_id: clinic.id,
          clinic_name: clinic.name,
          usage: snapshot ? {
            total_bytes: Number(snapshot.total_bytes),
            object_count: Number(snapshot.object_count),
            unknown_size_object_count: Number(snapshot.unknown_size_object_count),
            measured_at: snapshot.measured_at,
          } : null,
          limit: limit ? {
            soft_limit_bytes: softLimitBytes,
            warning_percent: limit.warning_percent,
            notification_email: limit.notification_email,
            last_alert_sent_at: limit.last_alert_sent_at,
            percent_used: snapshot && softLimitBytes
              ? (Number(snapshot.total_bytes) / softLimitBytes) * 100
              : null,
          } : null,
        };
      }),
    },
  });
}

export async function PUT(req: Request) {
  const gate = await requirePlatformAdmin(req);
  if (!gate.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: gate.status });

  const body = await req.json().catch(() => null);
  const parsed = limitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'بيانات حد التخزين غير صالحة', details: parsed.error.flatten() }, { status: 400 });
  }

  const { clinic_id, soft_limit_bytes, warning_percent, notification_email } = parsed.data;
  const { data: clinic, error: clinicError } = await supabaseAdmin
    .from('clinics')
    .select('id')
    .eq('id', clinic_id)
    .maybeSingle();
  if (clinicError) {
    logEvent('storage_limit_clinic_lookup_failed', { error: clinicError.message }, 'error');
    return NextResponse.json({ error: 'تعذر التحقق من المنشأة' }, { status: 500 });
  }
  if (!clinic) return NextResponse.json({ error: 'المنشأة غير موجودة' }, { status: 404 });

  const { error } = await supabaseAdmin.from('clinic_storage_limits').upsert({
    clinic_id,
    soft_limit_bytes,
    warning_percent,
    notification_email: notification_email ?? null,
    last_alert_sent_at: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'clinic_id' });
  if (error) {
    logEvent('storage_limit_upsert_failed', { clinic_id, error: error.message }, 'error');
    return NextResponse.json({ error: 'تعذر حفظ حد التخزين' }, { status: 500 });
  }

  logEvent('storage_limit_updated', { clinic_id, soft_limit_bytes, warning_percent });
  return NextResponse.json({ data: { clinic_id, soft_limit_bytes, warning_percent } });
}
