import { NextResponse } from 'next/server';
import { getEmailProvider } from '@/lib/communications/email/provider';
import { logEvent } from '@/lib/server/logging';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALERT_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

function configuredCapacityBytes(): number | null {
  const raw = process.env.SUPABASE_STORAGE_QUOTA_BYTES;
  if (!raw || !/^\d+$/.test(raw)) return null;
  const bytes = Number(raw);
  return Number.isSafeInteger(bytes) && bytes > 0 ? bytes : null;
}

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    logEvent('storage_usage_alert_cron_disabled', { reason: 'CRON_SECRET is not configured' }, 'warn');
    return NextResponse.json({ error: 'Cron authorization is not configured' }, { status: 503 });
  }
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (token !== cronSecret) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { error: pruneError } = await supabaseAdmin.rpc('prune_stale_medical_uploads');
  if (pruneError) {
    logEvent('medical_upload_session_prune_failed', { error: pruneError.message, code: pruneError.code }, 'error');
    return NextResponse.json({ error: 'تعذر تنظيف جلسات الرفع المنتهية' }, { status: 500 });
  }

  const { error: refreshError } = await supabaseAdmin.rpc('refresh_storage_usage_snapshots');
  if (refreshError) {
    logEvent('storage_usage_snapshot_refresh_failed', { error: refreshError.message, code: refreshError.code }, 'error');
    return NextResponse.json({ error: 'تعذر تحديث لقطة استهلاك التخزين' }, { status: 500 });
  }

  const [limitsResult, usageResult, clinicsResult, projectResult] = await Promise.all([
    supabaseAdmin.from('clinic_storage_limits')
      .select('clinic_id, soft_limit_bytes, warning_percent, notification_email, last_alert_sent_at'),
    supabaseAdmin.from('clinic_storage_usage_snapshots')
      .select('clinic_id, total_bytes, unknown_size_object_count, measured_at'),
    supabaseAdmin.from('clinics').select('id, name, email'),
    supabaseAdmin.from('storage_project_usage_snapshots')
      .select('total_bytes, unknown_size_object_count, unclassified_bytes, measured_at, last_alert_sent_at')
      .eq('id', 1)
      .maybeSingle(),
  ]);
  const queryError = limitsResult.error || usageResult.error || clinicsResult.error || projectResult.error;
  if (queryError) {
    logEvent('storage_usage_alert_data_load_failed', { error: queryError.message }, 'error');
    return NextResponse.json({ error: 'تعذر تحميل بيانات تنبيهات التخزين' }, { status: 500 });
  }

  const usageByClinic = new Map((usageResult.data ?? []).map((row) => [row.clinic_id, row]));
  const clinicById = new Map((clinicsResult.data ?? []).map((clinic) => [clinic.id, clinic]));
  const provider = getEmailProvider();
  const deliveryEnabled = provider.name === 'resend';
  const now = Date.now();
  const results: Array<{ clinic_id: string; status: string }> = [];
  let projectStatus = 'not_configured';

  if (!deliveryEnabled) {
    logEvent('storage_usage_alert_delivery_unavailable', { provider: provider.name }, 'warn');
  } else {
    for (const limit of limitsResult.data ?? []) {
      const snapshot = usageByClinic.get(limit.clinic_id);
      const clinic = clinicById.get(limit.clinic_id);
      if (!snapshot || !clinic) {
        results.push({ clinic_id: limit.clinic_id, status: 'usage_or_clinic_missing' });
        continue;
      }

      const threshold = Number(limit.soft_limit_bytes) * Number(limit.warning_percent) / 100;
      if (Number(snapshot.total_bytes) < threshold) {
        results.push({ clinic_id: limit.clinic_id, status: 'below_threshold' });
        continue;
      }
      if (limit.last_alert_sent_at && now - Date.parse(limit.last_alert_sent_at) < ALERT_COOLDOWN_MS) {
        results.push({ clinic_id: limit.clinic_id, status: 'cooldown' });
        continue;
      }

      const recipient = limit.notification_email || clinic.email;
      if (!recipient) {
        results.push({ clinic_id: limit.clinic_id, status: 'recipient_missing' });
        continue;
      }

      try {
        await provider.send({
          to: recipient,
          subject: `تنبيه استخدام التخزين — ${clinic.name}`,
          text: [
            `تجاوز استخدام التخزين ${Number(limit.warning_percent)}% من الحد الاختياري للمنشأة ${clinic.name}.`,
            `الاستخدام المسجل: ${formatBytes(Number(snapshot.total_bytes))}.`,
            `عدد الملفات التي تعذر تحديد حجمها: ${Number(snapshot.unknown_size_object_count)}.`,
            `الحد الاختياري: ${formatBytes(Number(limit.soft_limit_bytes))}.`,
            'هذا تنبيه فقط؛ لا يوقف رفع الملفات.',
          ].join('\n'),
        });
        const { error: updateError } = await supabaseAdmin
          .from('clinic_storage_limits')
          .update({ last_alert_sent_at: new Date().toISOString() })
          .eq('clinic_id', limit.clinic_id);
        if (updateError) throw updateError;
        results.push({ clinic_id: limit.clinic_id, status: 'sent' });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logEvent('clinic_storage_alert_send_failed', { clinic_id: limit.clinic_id, error: message }, 'error');
        results.push({ clinic_id: limit.clinic_id, status: 'send_failed' });
      }
    }

    const capacity = configuredCapacityBytes();
    const project = projectResult.data;
    if (capacity && project) {
      const thresholdPercent = Number(process.env.SUPABASE_STORAGE_ALERT_PERCENT || 80);
      const threshold = Number.isFinite(thresholdPercent) && thresholdPercent >= 1 && thresholdPercent <= 100
        ? thresholdPercent
        : 80;
      if (Number(project.total_bytes) >= capacity * threshold / 100) {
        if (project.last_alert_sent_at && now - Date.parse(project.last_alert_sent_at) < ALERT_COOLDOWN_MS) {
          projectStatus = 'cooldown';
        } else if (!process.env.SUPABASE_STORAGE_ALERT_EMAIL) {
          projectStatus = 'recipient_missing';
        } else {
          try {
            await provider.send({
              to: process.env.SUPABASE_STORAGE_ALERT_EMAIL,
              subject: 'تنبيه اقتراب سعة Supabase Storage من الحد المهيأ',
              text: [
                `الاستخدام الحالي: ${formatBytes(Number(project.total_bytes))}.`,
                `السعة المهيأة: ${formatBytes(capacity)}.`,
                `الحد غير المصنف: ${formatBytes(Number(project.unclassified_bytes))}.`,
                `عدد العناصر التي تعذر تحديد حجمها: ${Number(project.unknown_size_object_count)}.`,
                `تم ضبط التنبيه عند ${threshold}%.`,
              ].join('\n'),
            });
            const { error: updateError } = await supabaseAdmin
              .from('storage_project_usage_snapshots')
              .update({ last_alert_sent_at: new Date().toISOString() })
              .eq('id', 1);
            if (updateError) throw updateError;
            projectStatus = 'sent';
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            logEvent('project_storage_alert_send_failed', { error: message }, 'error');
            projectStatus = 'send_failed';
          }
        }
      } else {
        projectStatus = 'below_threshold';
      }
    }
  }

  const sent = results.filter((result) => result.status === 'sent').length + (projectStatus === 'sent' ? 1 : 0);
  const failed = results.filter((result) => result.status === 'send_failed').length + (projectStatus === 'send_failed' ? 1 : 0);
  logEvent('storage_usage_alerts_processed', {
    sent,
    failed,
    clinics_checked: results.length,
    project_status: projectStatus,
    measured_at: projectResult.data?.measured_at ?? null,
  });

  return NextResponse.json({
    data: {
      measured_at: projectResult.data?.measured_at ?? null,
      clinic_alerts: results,
      project_alert: projectStatus,
      project_capacity_configured: configuredCapacityBytes() !== null,
      email_delivery_enabled: deliveryEnabled,
    },
    ...(failed > 0 ? { warning: 'Some alert emails failed; see server logs for details.' } : {}),
  }, { status: failed > 0 ? 502 : 200 });
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return 'غير متاح';
  if (bytes < 1024) return `${bytes} bytes`;
  const units = ['KiB', 'MiB', 'GiB', 'TiB', 'PiB'];
  let size = bytes / 1024;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(2)} ${units[unitIndex]}`;
}
