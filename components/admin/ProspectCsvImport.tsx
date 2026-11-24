'use client';

import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { Download, FileSpreadsheet, Loader2, Upload, X } from 'lucide-react';
import { useRouter } from 'next/navigation';

type ImportError = { row: number; reason: string };
type ImportResult = { inserted: number; skipped: number; errors: ImportError[] };

const TEMPLATE_HEADERS = [
  'clinic_name',
  'doctor_name',
  'phone',
  'email',
  'website',
  'address',
  'city',
  'country',
  'notes',
];

const TEMPLATE_EXAMPLE = [
  'عيادة الشفاء',
  'د. أحمد محمد',
  '0599000000',
  'clinic@example.com',
  'https://example.com',
  'شارع الجامعة',
  'نابلس',
  'PS',
  'مثال فقط',
];

function csvEscape(value: string) {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function downloadTemplate() {
  const csv = `${TEMPLATE_HEADERS.join(',')}\r\n${TEMPLATE_EXAMPLE.map(csvEscape).join(',')}\r\n`;
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'prospects-template.csv';
  link.click();
  URL.revokeObjectURL(url);
}

export default function ProspectCsvImport() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  function chooseFile(candidate: File | undefined) {
    if (!candidate) return;
    if (!candidate.name.toLocaleLowerCase().endsWith('.csv')) {
      setMessage('يرجى اختيار ملف CSV فقط.');
      setFile(null);
      return;
    }
    setFile(candidate);
    setMessage(null);
    setResult(null);
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    chooseFile(event.target.files?.[0]);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    chooseFile(event.dataTransfer.files?.[0]);
  }

  function close() {
    if (uploading) return;
    setOpen(false);
    setFile(null);
    setMessage(null);
    setResult(null);
    setProgress(0);
    if (inputRef.current) inputRef.current.value = '';
  }

  function upload() {
    if (!file || uploading) return;

    const formData = new FormData();
    formData.append('file', file);
    const request = new XMLHttpRequest();
    setUploading(true);
    setProgress(0);
    setMessage(null);
    setResult(null);

    request.upload.onprogress = (event) => {
      if (event.lengthComputable) setProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onerror = () => {
      setUploading(false);
      setMessage('تعذر الاتصال بالخادم. حاول مرة أخرى.');
    };
    request.onload = () => {
      setUploading(false);
      setProgress(100);
      let payload: { error?: string } & Partial<ImportResult> = {};
      try {
        payload = JSON.parse(request.responseText) as typeof payload;
      } catch {
        setMessage('استجابة غير صالحة من الخادم.');
        return;
      }
      if (request.status < 200 || request.status >= 300) {
        setMessage(payload.error ?? 'فشل استيراد الملف.');
        return;
      }
      setResult({
        inserted: payload.inserted ?? 0,
        skipped: payload.skipped ?? 0,
        errors: payload.errors ?? [],
      });
      router.refresh();
    };
    request.open('POST', '/api/admin/prospects/import');
    request.send(formData);
  }

  return (
    <>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-400/40 bg-cyan-400/10 px-5 py-3 text-sm font-bold text-cyan-100 transition hover:bg-cyan-400/20"
        >
          <Upload className="h-4 w-4" />
          استيراد CSV
        </button>
        <button
          type="button"
          onClick={downloadTemplate}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 px-5 py-3 text-sm font-bold text-slate-200 transition hover:bg-slate-800"
        >
          <Download className="h-4 w-4" />
          تنزيل نموذج CSV
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-slate-950/80 p-4 backdrop-blur-sm">
          <button
            type="button"
            aria-label="إغلاق استيراد CSV"
            onClick={close}
            className="absolute inset-0 cursor-default"
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="csv-import-title"
            className="relative z-10 w-full max-w-2xl rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="csv-import-title" className="text-lg font-bold text-white">استيراد العيادات من CSV</h2>
                <p className="mt-1 text-sm text-slate-400">حتى 500 صف. الصفوف غير الصالحة ستُتخطى مع ذكر السبب.</p>
              </div>
              <button type="button" onClick={close} disabled={uploading} aria-label="إغلاق" className="text-slate-400 hover:text-white disabled:opacity-50">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleDrop}
              className="mt-6 rounded-2xl border-2 border-dashed border-slate-700 bg-slate-950/60 p-8 text-center transition hover:border-cyan-400/60"
            >
              <FileSpreadsheet className="mx-auto h-10 w-10 text-cyan-300" />
              <p className="mt-3 text-sm text-slate-200">اسحب ملف CSV إلى هنا</p>
              <p className="mt-1 text-xs text-slate-500">أو</p>
              <button type="button" onClick={() => inputRef.current?.click()} className="mt-3 rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">
                اختر ملفاً
              </button>
              <input ref={inputRef} type="file" accept=".csv,text/csv" onChange={handleFileChange} className="sr-only" />
              {file && <p className="mt-4 truncate text-sm text-cyan-200">{file.name}</p>}
            </div>

            {uploading && (
              <div className="mt-5" aria-live="polite">
                <div className="mb-2 flex justify-between text-xs text-slate-400"><span>جارٍ رفع الملف…</span><span>{progress}%</span></div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-cyan-400 transition-all" style={{ width: `${progress}%` }} /></div>
              </div>
            )}

            {message && <p role="alert" className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{message}</p>}

            {result && (
              <div className="mt-5 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4" role="status">
                <p className="font-semibold text-emerald-200">أُضيف {result.inserted}، تُخطي {result.skipped}</p>
                {result.errors.length > 0 && (
                  <ul className="mt-3 max-h-40 space-y-1 overflow-y-auto text-sm text-red-200">
                    {result.errors.map((error) => <li key={`${error.row}-${error.reason}`}>الصف {error.row}: {error.reason}</li>)}
                  </ul>
                )}
              </div>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={close} disabled={uploading} className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50">إغلاق</button>
              <button type="button" onClick={upload} disabled={!file || uploading} className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-5 py-2.5 text-sm font-bold text-slate-950 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50">
                {uploading && <Loader2 className="h-4 w-4 animate-spin" />}
                رفع واستيراد
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
