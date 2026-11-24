'use client';

import { useState, type FormEvent } from 'react';
import { Loader2, MapPinned, X } from 'lucide-react';
import { useRouter } from 'next/navigation';

const OSM_ERROR = 'خدمة OpenStreetMap غير متاحة حالياً. جرّب لاحقاً أو استخدم الإدخال اليدوي/CSV.';
type SourceReport = { name: string; count: number; error?: string };

export default function ProspectOsmFetch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('PS');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sources, setSources] = useState<SourceReport[]>([]);

  function close() {
    if (loading) return;
    setOpen(false);
    setMessage(null);
    setError(null);
    setProgress(0);
    setSources([]);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!city.trim() || loading) return;

    setLoading(true);
    setProgress(8);
    setMessage(null);
    setError(null);
    setSources([]);
    const progressTimer = window.setInterval(() => {
      setProgress((current) => Math.min(current + 4, 90));
    }, 1_000);

    try {
      const response = await fetch('/api/admin/prospects/fetch-osm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ city: city.trim(), country: country.trim().toUpperCase() }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || OSM_ERROR);

      setProgress(100);
      setMessage(`أُضيفت ${payload.inserted ?? 0} عيادة (تم العثور على ${payload.found ?? 0}، وتخطّي ${payload.skipped ?? 0}).`);
      setSources(Array.isArray(payload.sources) ? payload.sources : []);
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : OSM_ERROR);
    } finally {
      window.clearInterval(progressTimer);
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center gap-2 rounded-xl border border-violet-400/40 bg-violet-400/10 px-5 py-3 text-sm font-bold text-violet-100 transition hover:bg-violet-400/20"
      >
        <MapPinned className="h-4 w-4" />
        جلب من OpenStreetMap
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-slate-950/80 p-4 backdrop-blur-sm">
          <button type="button" aria-label="إغلاق جلب OpenStreetMap" onClick={close} className="absolute inset-0 cursor-default" />
          <section role="dialog" aria-modal="true" aria-labelledby="osm-fetch-title" className="relative z-10 w-full max-w-lg rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="osm-fetch-title" className="text-lg font-bold text-white">جلب من OpenStreetMap</h2>
                <p className="mt-1 text-sm text-slate-400">قد يستغرق البحث 30 ثانية أو أكثر.</p>
              </div>
              <button type="button" onClick={close} disabled={loading} aria-label="إغلاق" className="text-slate-400 hover:text-white disabled:opacity-50"><X className="h-5 w-5" /></button>
            </div>

            <form onSubmit={submit} className="mt-6 space-y-4">
              <label className="block space-y-2 text-sm text-slate-300">
                <span>المدينة *</span>
                <input value={city} onChange={(event) => setCity(event.target.value)} required maxLength={120} placeholder="مثال: نابلس" className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white outline-none focus:border-violet-400" />
              </label>
              <label className="block space-y-2 text-sm text-slate-300">
                <span>رمز البلد</span>
                <input value={country} onChange={(event) => setCountry(event.target.value)} required minLength={2} maxLength={2} pattern="[A-Za-z]{2}" className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white uppercase outline-none focus:border-violet-400" />
              </label>

              {loading && (
                <div aria-live="polite">
                  <div className="mb-2 flex justify-between text-xs text-slate-400"><span>جارٍ البحث…</span><span>{progress}%</span></div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-violet-400 transition-all" style={{ width: `${progress}%` }} /></div>
                </div>
              )}
              {message && <p role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">{message}</p>}
              {sources.length > 0 && (
                <ul className="space-y-1 rounded-xl border border-slate-700 bg-slate-950/50 p-3 text-sm">
                  {sources.map((source) => (
                    <li key={source.name} className={source.error ? 'text-slate-500' : 'text-slate-200'}>
                      {source.name}: {source.error ? 'فشل' : source.count}
                    </li>
                  ))}
                </ul>
              )}
              {error && <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}

              <div className="flex justify-end gap-3">
                <button type="button" onClick={close} disabled={loading} className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50">إغلاق</button>
                <button type="submit" disabled={loading || !city.trim()} className="inline-flex items-center gap-2 rounded-xl bg-violet-400 px-5 py-2.5 text-sm font-bold text-slate-950 hover:bg-violet-300 disabled:cursor-not-allowed disabled:opacity-50">
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  جلب العيادات
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
