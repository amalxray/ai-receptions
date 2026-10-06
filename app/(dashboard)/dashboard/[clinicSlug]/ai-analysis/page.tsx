'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { useClinicContext } from '@/lib/useClinicContext';

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/dicom'];
const MAX_FILE_SIZE = 10 * 1024 * 1024;

type DetectionResult = {
  class_name: string;
  confidence: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

type AnalysisResponse = {
  status: string;
  provider: string;
  image_path: string;
  width: number;
  height: number;
  detections: DetectionResult[];
  warning?: string | null;
};

export default function AiAnalysisPage() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { clinicId, authHeaders } = useClinicContext();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onFileSelected = useCallback((nextFile: File | null) => {
    if (!nextFile) return;
    if (!ACCEPTED_TYPES.includes(nextFile.type) && !nextFile.name.toLowerCase().endsWith('.dcm')) {
      setError('نوع الملف غير مدعوم. استخدم JPG أو PNG أو DICOM.');
      return;
    }
    if (nextFile.size > MAX_FILE_SIZE) {
      setError('يجب أن يكون حجم الصورة أقل من 10 MB.');
      return;
    }
    setError(null);
    setFile(nextFile);
    setResult(null);
    if (nextFile.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = () => setPreview(String(reader.result));
      reader.readAsDataURL(nextFile);
    } else {
      setPreview(null);
    }
  }, []);

  const analyze = useCallback(async () => {
    if (!file || !clinicId) return;
    setIsAnalyzing(true);
    setError(null);
    setResult(null);
    try {
      const headers = await authHeaders();
      const form = new FormData();
      form.append('file', file);
      form.append('clinic_id', clinicId);
      const response = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers,
        body: form,
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? 'تعذّر بدء التحليل.');
      setResult(body.data ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّر بدء التحليل.');
    } finally {
      setIsAnalyzing(false);
    }
  }, [authHeaders, clinicId, file]);

  const detections = useMemo<DetectionResult[]>(() => result?.detections ?? [], [result]);

  return (
    <main className="space-y-6">
      <section className="rounded-[2rem] border border-cyan-500/20 bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950/50 p-6 shadow-2xl shadow-cyan-950/20">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-cyan-300">🩻 المختبر الذكي</p>
            <h1 className="mt-2 text-2xl font-black text-white">تحليل الصور الطبية المفتوح المصدر</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">ارفع صورة طبية أو ملف DICOM، ثم شغّل التحليل المحلي بسرعة ودون إرسال البيانات خارج العيادة.</p>
          </div>
          <button
            type="button"
            onClick={analyze}
            disabled={!file || isAnalyzing}
            className="rounded-full bg-cyan-400 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isAnalyzing ? 'جارٍ التحليل...' : 'بدء التحليل'}
          </button>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); inputRef.current?.click(); } }}
          onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(event) => { event.preventDefault(); setIsDragging(false); onFileSelected(event.dataTransfer.files?.[0] ?? null); }}
          className={`flex min-h-96 cursor-pointer flex-col items-center justify-center rounded-[2rem] border-2 border-dashed p-8 text-center transition ${isDragging ? 'border-cyan-400 bg-cyan-500/10' : 'border-slate-700 bg-slate-900/60'}`}
        >
          <input ref={inputRef} type="file" accept=".jpg,.jpeg,.png,.dcm,.dicom,image/jpeg,image/png,image/dicom" className="hidden" onChange={(event) => onFileSelected(event.target.files?.[0] ?? null)} />
          <div className="text-6xl">🩻</div>
          <h2 className="mt-5 text-xl font-bold text-white">اسحب الصورة هنا أو اضغط للرفع</h2>
          <p className="mt-2 text-sm text-slate-400">JPG • PNG • DICOM • حتى 10 MB</p>
          {file && <p className="mt-4 rounded-full bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-200">{file.name}</p>}
        </div>

        <div className="rounded-[2rem] border border-slate-800 bg-slate-900/60 p-6">
          <h2 className="text-lg font-bold text-white">معاينة الصورة</h2>
          {preview ? (
            <img src={preview} alt="معاينة الملف الطبي" className="mt-4 h-80 w-full rounded-2xl border border-slate-700 object-contain bg-slate-950" />
          ) : (
            <div className="mt-4 grid h-80 place-items-center rounded-2xl border border-slate-700 bg-slate-950 text-sm text-slate-500">لم يتم اختيار صورة بعد.</div>
          )}
        </div>
      </section>

      <section className="rounded-[2rem] border border-slate-800 bg-slate-900/60 p-6">
        <h2 className="text-lg font-bold text-white">نتائج التحليل</h2>
        {error && <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">{error}</div>}
        {!error && !result && !isAnalyzing && <p className="mt-4 text-sm text-slate-400">اضغط «بدء التحليل» لتظهر النتائج هنا.</p>}
        {isAnalyzing && <div className="mt-4 h-4 animate-pulse rounded-full bg-cyan-500/20" />}
        {result && (
          <div className="mt-5 space-y-5">
            <div className="flex flex-wrap gap-3 text-sm">
              <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-cyan-200">الحالة: {result.status}</span>
              <span className="rounded-full border border-slate-700 px-3 py-1 text-slate-300">المحرك: {result.provider}</span>
              <span className="rounded-full border border-slate-700 px-3 py-1 text-slate-300">الأبعاد: {result.width} × {result.height}</span>
            </div>
            {detections.length === 0 ? (
              <p className="text-sm text-slate-400">لم يتم اكتشاف مناطق مشتبه بها.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-slate-400">
                    <tr><th className="px-3 py-2 text-right">النوع</th><th className="px-3 py-2 text-right">الثقة</th><th className="px-3 py-2 text-right">الموقع</th></tr>
                  </thead>
                  <tbody>
                    {detections.map((detection, index) => (
                      <tr key={`${detection.class_name}-${index}`} className="border-t border-slate-800 text-slate-200">
                        <td className="px-3 py-2">{String(detection.class_name)}</td>
                        <td className="px-3 py-2">{Math.round(Number(detection.confidence) * 100)}%</td>
                        <td className="px-3 py-2">x {Math.round(Number(detection.x))}, y {Math.round(Number(detection.y))}, w {Math.round(Number(detection.width))}, h {Math.round(Number(detection.height))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {result.warning && <p className="text-sm text-amber-300">{String(result.warning)}</p>}
          </div>
        )}
      </section>
    </main>
  );
}
