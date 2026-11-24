'use client';

import { useState } from 'react';
import { Loader2, Mail, Send, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';

type ProspectRow = {
  id: string;
  clinic_name: string;
  doctor_name: string | null;
  phone: string | null;
  email: string | null;
  city: string;
  country: string;
  status: string;
  created_at_label: string;
};

type Props = {
  prospects: ProspectRow[];
  newProspectIds: string[];
  statusLabels: Record<string, string>;
  archiveProspect: (formData: FormData) => Promise<void>;
};

type BatchResult = { sent: number; failed: number };

export default function ProspectEmailTable({ prospects, newProspectIds, statusLabels, archiveProspect }: Props) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [target, setTarget] = useState<ProspectRow | null>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState<'single' | 'ai' | 'batch' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const allSelected = prospects.length > 0 && prospects.every((prospect) => selectedIds.includes(prospect.id));

  function toggleAll() {
    setSelectedIds(allSelected ? [] : prospects.map((prospect) => prospect.id));
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  }

  function openEmail(prospect: ProspectRow) {
    setTarget(prospect);
    setSubject(`اقتراح لتحسين تواصل ${prospect.clinic_name} مع المرضى`);
    setBody('');
    setNotice(null);
    setError(null);
  }

  function closeEmail() {
    if (busy === 'single' || busy === 'ai') return;
    setTarget(null);
    setNotice(null);
    setError(null);
  }

  async function generateDraft() {
    if (!target || busy) return;
    setBusy('ai');
    setError(null);
    try {
      const response = await fetch(`/api/admin/prospects/${target.id}/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, generateDraft: true, preview: true }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'تعذر توليد المسودة.');
      setSubject(payload.draft?.subject || subject);
      setBody(payload.draft?.body || '');
      setNotice('تم توليد المسودة، راجعها قبل الإرسال.');
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'تعذر توليد المسودة.');
    } finally {
      setBusy(null);
    }
  }

  async function sendSingle() {
    if (!target || !body.trim() || busy) return;
    setBusy('single');
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/admin/prospects/${target.id}/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, body }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'فشل إرسال البريد.');
      setTarget(null);
      setNotice(`تم إرسال البريد إلى ${target.email}.`);
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'فشل إرسال البريد.');
    } finally {
      setBusy(null);
    }
  }

  async function sendBatch(ids: string[]) {
    if (ids.length === 0 || busy) return;
    setBusy('batch');
    setError(null);
    setNotice(null);
    try {
      const response = await fetch('/api/admin/prospects/batch-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      const payload = await response.json().catch(() => ({})) as Partial<BatchResult> & { error?: string };
      if (!response.ok) throw new Error(payload.error || 'فشل الإرسال الجماعي.');
      setSelectedIds([]);
      setNotice(`تم إرسال ${payload.sent ?? 0}، وفشل ${payload.failed ?? 0}.`);
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'فشل الإرسال الجماعي.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-800 p-4">
        <label className="inline-flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-4 w-4 accent-amber-400" />
          تحديد الكل
        </label>
        {selectedIds.length > 0 && (
          <button type="button" onClick={() => void sendBatch(selectedIds)} disabled={busy !== null} className="inline-flex items-center gap-2 rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-amber-300 disabled:opacity-50">
            {busy === 'batch' && <Loader2 className="h-4 w-4 animate-spin" />}
            إرسال المحدد ({selectedIds.length})
          </button>
        )}
        <button type="button" onClick={() => void sendBatch(newProspectIds.slice(0, 50))} disabled={busy !== null || newProspectIds.length === 0} className="inline-flex items-center gap-2 rounded-xl border border-amber-400/40 px-4 py-2.5 text-sm font-semibold text-amber-200 hover:bg-amber-400/10 disabled:opacity-50">
          <Send className="h-4 w-4" />
          إرسال لكل الجدد ({Math.min(newProspectIds.length, 50)})
        </button>
        {notice && <span role="status" className="text-sm text-emerald-300">{notice}</span>}
        {error && <span role="alert" className="text-sm text-red-300">{error}</span>}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] text-right text-sm">
          <thead className="bg-slate-950/60 text-xs text-slate-400">
            <tr>
              <th scope="col" className="w-12 px-4 py-3"><span className="sr-only">تحديد</span></th>
              <th scope="col" className="px-4 py-3 font-medium">الاسم</th>
              <th scope="col" className="px-4 py-3 font-medium">المدينة</th>
              <th scope="col" className="px-4 py-3 font-medium">الهاتف</th>
              <th scope="col" className="px-4 py-3 font-medium">البريد</th>
              <th scope="col" className="px-4 py-3 font-medium">الحالة</th>
              <th scope="col" className="px-4 py-3 font-medium">التاريخ</th>
              <th scope="col" className="px-4 py-3 font-medium">إجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {prospects.map((prospect) => {
              const blocked = !prospect.email || prospect.status === 'converted' || prospect.status === 'rejected';
              return (
                <tr key={prospect.id} className="text-slate-200">
                  <td className="px-4 py-3"><input type="checkbox" checked={selectedIds.includes(prospect.id)} onChange={() => toggleSelected(prospect.id)} className="h-4 w-4 accent-amber-400" aria-label={`تحديد ${prospect.clinic_name}`} /></td>
                  <td className="px-4 py-3 font-medium text-white">{prospect.clinic_name}</td>
                  <td className="px-4 py-3">{prospect.city}, {prospect.country}</td>
                  <td className="px-4 py-3" dir="ltr">{prospect.phone || '—'}</td>
                  <td className="px-4 py-3" dir="ltr">{prospect.email || '—'}</td>
                  <td className="px-4 py-3"><span className="rounded-full border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs">{statusLabels[prospect.status] ?? prospect.status}</span></td>
                  <td className="px-4 py-3 text-slate-400">{prospect.created_at_label}</td>
                  <td className="flex gap-2 px-4 py-3">
                    {!blocked && <button type="button" onClick={() => openEmail(prospect)} className="inline-flex items-center gap-1 rounded-lg border border-cyan-400/30 px-3 py-1.5 text-xs text-cyan-200 hover:bg-cyan-400/10"><Mail className="h-3.5 w-3.5" /> إرسال</button>}
                    {prospect.status !== 'archived' && <form action={archiveProspect}><input type="hidden" name="id" value={prospect.id} /><button type="submit" className="rounded-lg border border-red-500/30 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/10">حذف</button></form>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {target && (
        <div className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-slate-950/80 p-4 backdrop-blur-sm">
          <button type="button" aria-label="إغلاق إرسال البريد" onClick={closeEmail} className="absolute inset-0 cursor-default" />
          <section role="dialog" aria-modal="true" aria-labelledby="prospect-email-title" className="relative z-10 w-full max-w-2xl rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <h2 id="prospect-email-title" className="text-lg font-bold text-white">إرسال بريد إلى {target.clinic_name}</h2>
            <p className="mt-1 text-sm text-slate-400" dir="ltr">{target.email}</p>
            <div className="mt-5 space-y-4">
              <label className="block space-y-2 text-sm text-slate-300"><span>الموضوع</span><input value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={300} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white outline-none focus:border-cyan-400" /></label>
              <label className="block space-y-2 text-sm text-slate-300"><span>نص الرسالة</span><textarea value={body} onChange={(event) => setBody(event.target.value)} rows={9} maxLength={20_000} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white outline-none focus:border-cyan-400" /></label>
              {notice && <p role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">{notice}</p>}
              {error && <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}
              <div className="flex flex-wrap justify-end gap-3">
                <button type="button" onClick={() => void generateDraft()} disabled={busy !== null} className="inline-flex items-center gap-2 rounded-xl border border-violet-400/40 px-4 py-2.5 text-sm font-semibold text-violet-200 hover:bg-violet-400/10 disabled:opacity-50"><Sparkles className="h-4 w-4" /> توليد بالـ AI</button>
                <button type="button" onClick={closeEmail} disabled={busy !== null} className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50">إلغاء</button>
                <button type="button" onClick={() => void sendSingle()} disabled={busy !== null || !body.trim()} className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-5 py-2.5 text-sm font-bold text-slate-950 hover:bg-cyan-300 disabled:opacity-50">{busy === 'single' && <Loader2 className="h-4 w-4 animate-spin" />} إرسال البريد</button>
              </div>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
