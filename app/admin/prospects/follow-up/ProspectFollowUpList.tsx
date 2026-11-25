'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { buildWhatsAppHref, WHATSAPP_COUNTRY_CALLING_CODES } from '@/lib/utils/whatsapp';
import type { FollowUpProspect, FollowUpStage, PendingFollowUps } from '@/lib/services/prospecting/followUp';

type Props = {
  pending: PendingFollowUps;
};

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function stageLabel(stage: FollowUpStage) {
  return stage === 'stage_1' ? 'المتابعة الأولى' : 'المتابعة الأخيرة';
}

function whatsAppUrl(prospect: FollowUpProspect) {
  const countryCode = WHATSAPP_COUNTRY_CALLING_CODES[prospect.country.toUpperCase()] ?? '970';
  return buildWhatsAppHref(
    prospect.phone,
    `مرحباً فريق ${prospect.clinic_name}، نتابع معكم بخصوص Dentairec. إذا رغبتم بالتعرّف على النظام، يسعدنا ترتيب عرض مختصر يناسبكم.\n\nفريق Dentairec`,
    countryCode,
  );
}

export default function ProspectFollowUpList({ pending: initialPending }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(initialPending);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchProgress, setBatchProgress] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  function removeProspect(id: string, stage: FollowUpStage) {
    setPending((current) => ({
      ...current,
      [stage]: current[stage].filter((prospect) => prospect.id !== id),
    }));
  }

  async function performAction(prospect: FollowUpProspect, action: 'send' | 'skip') {
    setBusyId(prospect.id);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/admin/prospects/follow-up/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: prospect.id, stage: prospect.stage, action }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'تعذّر تنفيذ الإجراء.');
      }

      removeProspect(prospect.id, prospect.stage);
      setNotice(action === 'send' ? `تم إرسال ${stageLabel(prospect.stage)}.` : 'تم تخطي المتابعة.');
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'تعذّر تنفيذ الإجراء.');
    } finally {
      setBusyId(null);
    }
  }

  async function openWhatsApp(prospect: FollowUpProspect) {
    const href = whatsAppUrl(prospect);
    if (!href) {
      setError('لا يوجد رقم هاتف صالح لفتح WhatsApp لهذه العيادة.');
      return;
    }

    const target = window.open(href, '_blank');
    if (!target) {
      setError('تعذّر فتح WhatsApp. اسمح بالنوافذ المنبثقة ثم أعد المحاولة.');
      return;
    }
    target.opener = null;

    setBusyId(prospect.id);
    setError('');
    try {
      const [trackingResponse, skipResponse] = await Promise.all([
        fetch(`/api/admin/prospects/${prospect.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'opened' }),
        }),
        fetch('/api/admin/prospects/follow-up/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: prospect.id, stage: prospect.stage, action: 'skip' }),
        }),
      ]);
      if (!trackingResponse.ok || !skipResponse.ok) {
        const result = await skipResponse.json().catch(() => ({}));
        throw new Error(result.error || 'فُتح WhatsApp لكن تعذّر تسجيل المتابعة.');
      }
      removeProspect(prospect.id, prospect.stage);
      setNotice('تم فتح WhatsApp وتخطي رسالة البريد لهذه المرحلة.');
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'فُتح WhatsApp لكن تعذّر تسجيل المتابعة.');
    } finally {
      setBusyId(null);
    }
  }

  async function sendAllStage1() {
    if (batchBusy || pending.stage_1.length === 0) return;
    setBatchBusy(true);
    setError('');
    setNotice('');
    let sent = 0;
    let failed = 0;
    const prospects = [...pending.stage_1];

    for (let index = 0; index < prospects.length; index += 1) {
      const prospect = prospects[index];
      setBatchProgress(`${index + 1}/${prospects.length}`);
      setBusyId(prospect.id);
      try {
        const response = await fetch('/api/admin/prospects/follow-up/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: prospect.id, stage: 'stage_1', action: 'send' }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.success) {
          failed += 1;
          if (response.status === 429) {
            failed += prospects.length - index - 1;
            break;
          }
          continue;
        }
        sent += 1;
        removeProspect(prospect.id, 'stage_1');
      } catch {
        failed += 1;
      }
      if (index < prospects.length - 1) await wait(1_000);
    }

    setBusyId(null);
    setBatchBusy(false);
    setBatchProgress('');
    setNotice(`اكتمل الإرسال: ${sent} ناجح، ${failed} تعذّر إرسالها.`);
    router.refresh();
  }

  function renderGroup(stage: FollowUpStage, prospects: FollowUpProspect[]) {
    return (
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-white">
            {stageLabel(stage)} <span className="text-sm text-slate-400">({prospects.length})</span>
          </h2>
          {stage === 'stage_1' && prospects.length > 0 && (
            <button
              type="button"
              onClick={() => void sendAllStage1()}
              disabled={batchBusy || busyId !== null}
              className="rounded-xl bg-amber-400 px-4 py-2 text-sm font-bold text-slate-950 disabled:opacity-50"
            >
              {batchBusy ? `جارٍ الإرسال ${batchProgress}` : 'إرسال كل إيميلات المرحلة 1'}
            </button>
          )}
        </div>
        {prospects.length === 0 ? (
          <p className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 text-sm text-slate-400">
            لا توجد عيادات مستحقة لهذه المرحلة حالياً.
          </p>
        ) : (
          <div className="grid gap-3">
            {prospects.map((prospect) => (
              <article key={`${stage}-${prospect.id}`} className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <h3 className="truncate font-bold text-white">{prospect.clinic_name}</h3>
                  <p className="mt-1 text-sm text-slate-400">
                    {prospect.city} · {prospect.email ?? 'لا يوجد بريد'}
                    {prospect.doctor_name ? ` · ${prospect.doctor_name}` : ''}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    مستحقة منذ {new Intl.DateTimeFormat('ar', { dateStyle: 'medium' }).format(new Date(prospect.due_at))}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void openWhatsApp(prospect)}
                    disabled={busyId === prospect.id || batchBusy || !prospect.phone}
                    className="rounded-xl border border-emerald-500/40 px-4 py-2 text-sm text-emerald-200 disabled:opacity-40"
                  >
                    واتساب
                  </button>
                  <button
                    type="button"
                    onClick={() => void performAction(prospect, 'send')}
                    disabled={busyId === prospect.id || batchBusy || !prospect.email}
                    className="rounded-xl bg-amber-400 px-4 py-2 text-sm font-bold text-slate-950 disabled:opacity-50"
                  >
                    {busyId === prospect.id ? 'جارٍ التنفيذ…' : 'إيميل'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void performAction(prospect, 'skip')}
                    disabled={busyId === prospect.id || batchBusy}
                    className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-300 disabled:opacity-50"
                  >
                    تخطّى
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    );
  }

  return (
    <div className="space-y-7">
      {notice && <p role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">{notice}</p>}
      {error && <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}
      {renderGroup('stage_1', pending.stage_1)}
      {renderGroup('stage_2', pending.stage_2)}
    </div>
  );
}
