'use client';

import { useState } from 'react';

export default function AdminNotificationsPage() {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [clinicIds, setClinicIds] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send() {
    setError(null);
    setResult(null);
    if (!title.trim() || !body.trim()) {
      setError('أدخل العنوان والمحتوى');
      return;
    }
    setBusy(true);
    try {
      const clinic_ids = clinicIds.trim()
        ? clinicIds.split(',').map((s) => s.trim()).filter(Boolean)
        : undefined;
      const res = await fetch('/api/admin/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), body: body.trim(), clinic_ids }),
      });
      const b = await res.json();
      if (!res.ok) throw new Error(b.error ?? 'فشل الإرسال');
      setResult(`تم إرسال الإشعار إلى ${b.data?.sent_to} مؤسسة.`);
      setTitle('');
      setBody('');
      setClinicIds('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل الإرسال');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-[2rem] border border-slate-800 bg-slate-900/90 p-6">
      <h2 className="text-lg font-semibold text-white">📢 إرسال إشعار / إعلان</h2>
      <p className="mt-1 text-sm text-slate-400">
        يُرسل لجميع المؤسسات النشطة — أو حدد معرّفات محددة مفصولة بفواصل.
      </p>

      {error && <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</div>}
      {result && <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">{result}</div>}

      <div className="mt-5 space-y-4">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="عنوان الإشعار"
          className="w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-amber-500/70 focus:outline-none"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="محتوى الإشعار..."
          rows={4}
          className="w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-amber-500/70 focus:outline-none"
        />
        <input
          value={clinicIds}
          onChange={(e) => setClinicIds(e.target.value)}
          placeholder="معرّفات عيادات (اختياري، مفصولة بفواصل) — اتركها فارغة للجميع"
          className="w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-xs text-slate-100 focus:border-amber-500/70 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={busy}
          className="rounded-full bg-amber-500 px-6 py-2 text-sm font-bold text-slate-950 transition hover:bg-amber-400 disabled:opacity-50"
        >
          {busy ? 'جارٍ الإرسال...' : 'إرسال الإشعار'}
        </button>
      </div>
    </div>
  );
}