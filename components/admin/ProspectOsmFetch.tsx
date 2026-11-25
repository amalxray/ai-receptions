'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Loader2, MapPinned, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { COUNTRY_CITIES, type ProspectingCountry } from '@/lib/services/prospecting/cities';
import { createProspectImportMessage } from '@/lib/services/prospecting/import-message';

const OSM_ERROR = 'خدمة OpenStreetMap غير متاحة حالياً. جرّب لاحقاً أو استخدم الإدخال اليدوي/CSV.';
const BATCH_STORAGE_KEY = 'prospect-osm-batch-v1';
const BATCH_DELAY_MS = 1_200;

type SourceReport = { name: string; count: number; error?: string; filtered?: number };
type CityReport = {
  city: string;
  found: number;
  inserted: number;
  skipped_duplicates: number;
  skipped_invalid: number;
  message: string;
  sources: SourceReport[];
  error?: string;
};
type BatchTotals = {
  found: number;
  inserted: number;
  skipped_duplicates: number;
  skipped_invalid: number;
  processedCities: number;
  cityReports: CityReport[];
};
type SavedBatch = {
  country: ProspectingCountry;
  current_index: number;
  totals: BatchTotals;
};
type FetchPayload = {
  found?: number;
  inserted?: number;
  skipped_duplicates?: number;
  skipped_invalid?: number;
  message?: string;
  error?: string;
  sources?: SourceReport[];
};

const EMPTY_TOTALS: BatchTotals = {
  found: 0,
  inserted: 0,
  skipped_duplicates: 0,
  skipped_invalid: 0,
  processedCities: 0,
  cityReports: [],
};

function isProspectingCountry(value: unknown): value is ProspectingCountry {
  return typeof value === 'string' && Object.hasOwn(COUNTRY_CITIES, value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function normalizeSourceReport(value: unknown): SourceReport | null {
  if (!isRecord(value) || typeof value.name !== 'string' || !isFiniteNumber(value.count)) return null;
  return {
    name: value.name,
    count: value.count,
    ...(typeof value.error === 'string' ? { error: value.error } : {}),
    ...(isFiniteNumber(value.filtered) ? { filtered: value.filtered } : {}),
  };
}

function normalizeCityReport(value: unknown): CityReport | null {
  if (!isRecord(value) || typeof value.city !== 'string' || !Array.isArray(value.sources)) return null;
  const sources = value.sources.map(normalizeSourceReport);
  if (sources.some((source) => source === null)) return null;
  const validSources = sources.filter((source): source is SourceReport => source !== null);

  const skippedDuplicates = isFiniteNumber(value.skipped_duplicates)
    ? value.skipped_duplicates
    : isFiniteNumber(value.skipped)
      ? value.skipped
      : 0;
  return {
    city: value.city,
    found: isFiniteNumber(value.found) ? value.found : 0,
    inserted: isFiniteNumber(value.inserted) ? value.inserted : 0,
    skipped_duplicates: skippedDuplicates,
    skipped_invalid: isFiniteNumber(value.skipped_invalid) ? value.skipped_invalid : 0,
    message: typeof value.message === 'string' ? value.message : '',
    sources: validSources,
    ...(typeof value.error === 'string' ? { error: value.error } : {}),
  };
}

function normalizeBatchTotals(value: unknown): BatchTotals | null {
  if (!isRecord(value) || !isFiniteNumber(value.found) || !isFiniteNumber(value.inserted)
    || !isFiniteNumber(value.processedCities) || !Number.isInteger(value.processedCities)
    || !Array.isArray(value.cityReports)) {
    return null;
  }
  const cityReports = value.cityReports.map(normalizeCityReport);
  if (cityReports.some((report) => report === null)) return null;
  const validCityReports = cityReports.filter((report): report is CityReport => report !== null);

  const skippedDuplicates = isFiniteNumber(value.skipped_duplicates)
    ? value.skipped_duplicates
    : isFiniteNumber(value.skipped)
      ? value.skipped
      : null;
  if (skippedDuplicates === null) return null;

  return {
    found: value.found,
    inserted: value.inserted,
    skipped_duplicates: skippedDuplicates,
    skipped_invalid: isFiniteNumber(value.skipped_invalid) ? value.skipped_invalid : 0,
    processedCities: value.processedCities,
    cityReports: validCityReports,
  };
}

function readSavedBatch(): SavedBatch | null {
  try {
    const raw = window.localStorage.getItem(BATCH_STORAGE_KEY);
    if (!raw) return null;
    const saved: unknown = JSON.parse(raw);
    if (!isRecord(saved)) return null;
    const totals = normalizeBatchTotals(saved.totals);
    if (!isProspectingCountry(saved.country)
      || !isFiniteNumber(saved.current_index)
      || !Number.isInteger(saved.current_index)
      || saved.current_index < 0
      || !totals) {
      return null;
    }
    return {
      country: saved.country,
      current_index: saved.current_index,
      totals,
    };
  } catch {
    return null;
  }
}

function csvCell(value: string | number): string {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function downloadBatchCsv(country: ProspectingCountry, reports: CityReport[]) {
  const rows = [
    ['المدينة', 'تم العثور', 'أُضيف', 'موجود مسبقاً', 'مستبعد لمعايير الجودة', 'المصدر', 'نتائج المصدر', 'استبعده المصدر', 'خطأ المصدر/المدينة'],
    ...reports.flatMap((report) => {
      if (report.sources.length === 0) {
        return [[report.city, report.found, report.inserted, report.skipped_duplicates, report.skipped_invalid, '', '', '', report.error ?? '']];
      }
      return report.sources.map((source) => [
        report.city,
        report.found,
        report.inserted,
        report.skipped_duplicates,
        report.skipped_invalid,
        source.name,
        source.count,
        source.filtered ?? 0,
        source.error ?? report.error ?? '',
      ]);
    }),
  ];
  const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}`;
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `prospects-${country}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

export default function ProspectOsmFetch() {
  const router = useRouter();
  const stopRequested = useRef(false);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'single' | 'batch'>('single');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('PS');
  const [batchCountry, setBatchCountry] = useState<ProspectingCountry>('PS');
  const [loading, setLoading] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [persistenceWarning, setPersistenceWarning] = useState<string | null>(null);
  const [sources, setSources] = useState<SourceReport[]>([]);
  const [batchResult, setBatchResult] = useState<{ country: ProspectingCountry; totals: BatchTotals } | null>(null);
  const [savedBatch, setSavedBatch] = useState<SavedBatch | null>(null);

  useEffect(() => {
    const saved = readSavedBatch();
    if (saved) {
      setSavedBatch(saved);
      setBatchCountry(saved.country);
      setOpen(true);
    }
  }, []);

  function clearMessages() {
    setMessage(null);
    setError(null);
    setProgressText(null);
    setSources([]);
    setBatchResult(null);
    setPersistenceWarning(null);
  }

  function close() {
    if (loading) return;
    setOpen(false);
    clearMessages();
    setProgress(0);
  }

  async function submitSingle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!city.trim() || loading) return;

    setLoading(true);
    setProgress(8);
    clearMessages();
    const progressTimer = window.setInterval(() => {
      setProgress((current) => Math.min(current + 4, 90));
    }, 1_000);

    try {
      const response = await fetch('/api/admin/prospects/fetch-osm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ city: city.trim(), country: country.trim().toUpperCase() }),
      });
      const payload: FetchPayload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || OSM_ERROR);

      setProgress(100);
      setMessage(payload.message ?? createProspectImportMessage({
        inserted: payload.inserted ?? 0,
        skippedDuplicates: payload.skipped_duplicates ?? 0,
        skippedInvalid: payload.skipped_invalid ?? 0,
      }));
      setSources(Array.isArray(payload.sources) ? payload.sources : []);
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : OSM_ERROR);
    } finally {
      window.clearInterval(progressTimer);
      setLoading(false);
    }
  }

  function persistBatch(batch: SavedBatch): boolean {
    try {
      window.localStorage.setItem(BATCH_STORAGE_KEY, JSON.stringify(batch));
      return true;
    } catch {
      setPersistenceWarning('تعذر حفظ تقدم البحث في هذا المتصفح؛ إذا أُغلقت الصفحة فلن يمكن استئنافه تلقائياً.');
      return false;
    }
  }

  async function runBatch(initial?: SavedBatch) {
    if (loading) return;
    const selectedCountry = initial?.country ?? batchCountry;
    const cities = COUNTRY_CITIES[selectedCountry].cities;
    let totals: BatchTotals = initial?.totals ?? { ...EMPTY_TOTALS, cityReports: [] };
    const startIndex = Math.min(initial?.current_index ?? 0, cities.length);
    const initialState: SavedBatch = {
      country: selectedCountry,
      current_index: startIndex,
      totals,
    };

    setLoading(true);
    setStopping(false);
    stopRequested.current = false;
    setMode('batch');
    setBatchCountry(selectedCountry);
    setBatchResult(null);
    setSavedBatch(null);
    clearMessages();
    persistBatch(initialState);

    let wasStopped = false;
    let nextIndexToResume = startIndex;
    try {
      for (let index = startIndex; index < cities.length; index += 1) {
        if (stopRequested.current) {
          wasStopped = true;
          break;
        }

        const selectedCity = cities[index].ar;
        setProgressText(`جاري البحث: ${selectedCity} (${index + 1}/${cities.length})`);
        persistBatch({ country: selectedCountry, current_index: index, totals });

        let cityReport: CityReport;
        try {
          const response = await fetch('/api/admin/prospects/fetch-osm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ city: selectedCity, country: selectedCountry }),
          });
          const payload: FetchPayload = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(payload.error || OSM_ERROR);

          cityReport = {
            city: selectedCity,
            found: payload.found ?? 0,
            inserted: payload.inserted ?? 0,
            skipped_duplicates: payload.skipped_duplicates ?? 0,
            skipped_invalid: payload.skipped_invalid ?? 0,
            message: payload.message ?? createProspectImportMessage({
              inserted: payload.inserted ?? 0,
              skippedDuplicates: payload.skipped_duplicates ?? 0,
              skippedInvalid: payload.skipped_invalid ?? 0,
            }),
            sources: Array.isArray(payload.sources) ? payload.sources : [],
          };
        } catch (caughtError) {
          cityReport = {
            city: selectedCity,
            found: 0,
            inserted: 0,
            skipped_duplicates: 0,
            skipped_invalid: 0,
            message: '',
            sources: [],
            error: caughtError instanceof Error ? caughtError.message : OSM_ERROR,
          };
        }

        totals = {
          found: totals.found + cityReport.found,
          inserted: totals.inserted + cityReport.inserted,
          skipped_duplicates: totals.skipped_duplicates + cityReport.skipped_duplicates,
          skipped_invalid: totals.skipped_invalid + cityReport.skipped_invalid,
          processedCities: totals.processedCities + 1,
          cityReports: [...totals.cityReports, cityReport],
        };
        const nextIndex = index + 1;
        nextIndexToResume = nextIndex;
        persistBatch({ country: selectedCountry, current_index: nextIndex, totals });
        setProgressText(`${nextIndex}/${cities.length} — أُضيف ${totals.inserted} عيادة`);

        if (stopRequested.current) {
          wasStopped = true;
          break;
        }
        if (nextIndex < cities.length) await sleep(BATCH_DELAY_MS);
      }

      if (wasStopped) {
        const resumable: SavedBatch = {
          country: selectedCountry,
          current_index: nextIndexToResume,
          totals,
        };
        persistBatch(resumable);
        setSavedBatch(resumable);
        setMessage(`تم إيقاف البحث بعد ${totals.processedCities} من ${cities.length} مدينة. يمكنك استئنافه لاحقاً.`);
        router.refresh();
      } else {
        try {
          window.localStorage.removeItem(BATCH_STORAGE_KEY);
        } catch {
          setPersistenceWarning('اكتمل البحث، لكن تعذر مسح بيانات الاستئناف المحفوظة من المتصفح.');
        }
        setSavedBatch(null);
        setBatchResult({ country: selectedCountry, totals });
        const importMessage = createProspectImportMessage({
          inserted: totals.inserted,
          skippedDuplicates: totals.skipped_duplicates,
          skippedInvalid: totals.skipped_invalid,
        });
        setMessage(`${importMessage} من ${totals.processedCities} مدينة.`);
        router.refresh();
      }
    } finally {
      setLoading(false);
      setStopping(false);
      stopRequested.current = false;
    }
  }

  function submitBatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void runBatch();
  }

  function requestStop() {
    stopRequested.current = true;
    setStopping(true);
    setProgressText('سيتم إيقاف البحث بعد انتهاء طلب المدينة الحالية…');
  }

  function discardSavedBatch() {
    try {
      window.localStorage.removeItem(BATCH_STORAGE_KEY);
      setSavedBatch(null);
      setMessage(null);
      setPersistenceWarning(null);
    } catch {
      setError('تعذر حذف البحث السابق من التخزين المحلي.');
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
          <section role="dialog" aria-modal="true" aria-labelledby="osm-fetch-title" className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="osm-fetch-title" className="text-lg font-bold text-white">جلب من OpenStreetMap</h2>
                <p className="mt-1 text-sm text-slate-400">يمكنك جلب مدينة منفردة أو البحث في مدن دولة بالتتابع.</p>
              </div>
              <button type="button" onClick={close} disabled={loading} aria-label="إغلاق" className="text-slate-400 hover:text-white disabled:opacity-50"><X className="h-5 w-5" /></button>
            </div>

            {savedBatch && !loading && (
              <div className="mt-5 space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
                <p>يوجد بحث سابق غير مكتمل في {COUNTRY_CITIES[savedBatch.country].name_ar} ({savedBatch.current_index}/{COUNTRY_CITIES[savedBatch.country].cities.length}). هل تريد استئنافه؟</p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => void runBatch(savedBatch)} className="rounded-lg bg-amber-300 px-3 py-2 font-bold text-slate-950">استئناف البحث</button>
                  <button type="button" onClick={discardSavedBatch} className="rounded-lg border border-amber-200/30 px-3 py-2">حذف البحث السابق</button>
                </div>
              </div>
            )}

            <div className="mt-5 flex flex-wrap gap-4 text-sm text-slate-200">
              <label className="inline-flex items-center gap-2">
                <input type="radio" name="search-mode" checked={mode === 'single'} onChange={() => setMode('single')} disabled={loading} />
                بحث مدينة واحدة
              </label>
              <label className="inline-flex items-center gap-2">
                <input type="radio" name="search-mode" checked={mode === 'batch'} onChange={() => setMode('batch')} disabled={loading} />
                جلب كل دولة
              </label>
            </div>

            {mode === 'single' ? (
              <form onSubmit={submitSingle} className="mt-5 space-y-4">
                <label className="block space-y-2 text-sm text-slate-300">
                  <span>المدينة *</span>
                  <input value={city} onChange={(event) => setCity(event.target.value)} required maxLength={120} placeholder="مثال: نابلس" className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white outline-none focus:border-violet-400" />
                </label>
                <label className="block space-y-2 text-sm text-slate-300">
                  <span>رمز البلد</span>
                  <input value={country} onChange={(event) => setCountry(event.target.value)} required minLength={2} maxLength={2} pattern="[A-Za-z]{2}" className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white uppercase outline-none focus:border-violet-400" />
                </label>
                <div className="flex justify-end gap-3">
                  <button type="button" onClick={close} disabled={loading} className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50">إغلاق</button>
                  <button type="submit" disabled={loading || !city.trim()} className="inline-flex items-center gap-2 rounded-xl bg-violet-400 px-5 py-2.5 text-sm font-bold text-slate-950 hover:bg-violet-300 disabled:cursor-not-allowed disabled:opacity-50">
                    {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                    جلب العيادات
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={submitBatch} className="mt-5 space-y-4">
                <label className="block space-y-2 text-sm text-slate-300">
                  <span>الدولة</span>
                  <select value={batchCountry} onChange={(event) => setBatchCountry(event.target.value as ProspectingCountry)} disabled={loading || Boolean(savedBatch)} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white outline-none focus:border-violet-400">
                    {Object.entries(COUNTRY_CITIES).map(([code, details]) => (
                      <option key={code} value={code}>{details.name_ar} ({details.cities.length} مدينة)</option>
                    ))}
                  </select>
                </label>

                {loading && (
                  <div aria-live="polite" className="rounded-xl border border-slate-700 bg-slate-950/60 p-3 text-sm text-slate-200">
                    <div className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin text-violet-300" />{progressText}</div>
                  </div>
                )}
                {message && <p role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">{message}</p>}
                {persistenceWarning && <p role="status" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">{persistenceWarning}</p>}
                {error && <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}

                {batchResult && (
                  <div className="space-y-3 rounded-xl border border-slate-700 bg-slate-950/50 p-3 text-sm text-slate-200">
                    <p>
                      الملخص: {createProspectImportMessage({
                        inserted: batchResult.totals.inserted,
                        skippedDuplicates: batchResult.totals.skipped_duplicates,
                        skippedInvalid: batchResult.totals.skipped_invalid,
                      })} من {batchResult.totals.processedCities} مدينة.
                    </p>
                    {batchResult.totals.cityReports.some((report) => report.error || report.sources.some((source) => source.error)) && (
                      <div>
                        <p className="font-semibold text-red-200">المدن التي تعذّر جلبها:</p>
                        <ul className="mt-1 list-inside list-disc text-red-100">
                          {batchResult.totals.cityReports.flatMap((report) => {
                            const errors = report.error
                              ? [report.error]
                              : report.sources.filter((source) => source.error).map((source) => `${source.name}: ${source.error}`);
                            return errors.map((cityError, index) => (
                              <li key={`${report.city}-${index}`}>{report.city}: {cityError}</li>
                            ));
                          }).filter(Boolean)}
                        </ul>
                      </div>
                    )}
                    <button type="button" onClick={() => downloadBatchCsv(batchResult.country, batchResult.totals.cityReports)} className="rounded-lg border border-slate-600 px-3 py-2 font-semibold hover:bg-slate-800">تنزيل تقرير CSV</button>
                  </div>
                )}

                <div className="flex justify-end gap-3">
                  <button type="button" onClick={close} disabled={loading} className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50">إغلاق</button>
                  {loading ? (
                    <button type="button" onClick={requestStop} disabled={stopping} className="rounded-xl border border-red-400/40 bg-red-500/10 px-5 py-2.5 text-sm font-bold text-red-100 disabled:opacity-50">
                      {stopping ? 'جارٍ الإيقاف…' : 'إيقاف البحث'}
                    </button>
                  ) : (
                    <button type="submit" disabled={Boolean(savedBatch)} className="inline-flex items-center gap-2 rounded-xl bg-violet-400 px-5 py-2.5 text-sm font-bold text-slate-950 hover:bg-violet-300 disabled:cursor-not-allowed disabled:opacity-50">
                      جلب كل المدن
                    </button>
                  )}
                </div>
              </form>
            )}

            {mode === 'single' && (
              <div className="mt-4">
                {loading && (
                  <div aria-live="polite">
                    <div className="mb-2 flex justify-between text-xs text-slate-400"><span>جارٍ البحث…</span><span>{progress}%</span></div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-violet-400 transition-all" style={{ width: `${progress}%` }} /></div>
                  </div>
                )}
                {message && <p role="status" className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">{message}</p>}
                {sources.length > 0 && (
                  <ul className="mt-3 space-y-1 rounded-xl border border-slate-700 bg-slate-950/50 p-3 text-sm">
                    {sources.map((source) => (
                      <li key={source.name} className={source.error ? 'text-slate-500' : 'text-slate-200'}>
                        {source.name}: {source.error ? 'فشل' : `${source.count}${source.filtered ? ` (استُبعد ${source.filtered})` : ''}`}
                      </li>
                    ))}
                  </ul>
                )}
                {error && <p role="alert" className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
