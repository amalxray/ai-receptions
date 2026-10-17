'use client';

import { useCallback, useRef, useState } from 'react';

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/dicom'];
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const TEST_CLINIC_ID = 'test-clinic';
const ENGINE_URL = 'http://127.0.0.1:8000';

type AnalysisResponse = {
  status: string;
  provider: string;
  image_path: string;
  width: number;
  height: number;
  detections: DetectionResult[];
  annotated_image?: string | null;
  annotated_image_mime?: string | null;
  warning?: string | null;
  message?: string;
};

type DetectionResult = {
  class_name: string;
  confidence: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export default function TestAiAnalysisPage() {
  const inputRef = useRef<HTMLInputElement | null>(null);
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

    const reader = new FileReader();
    reader.onload = () => setPreview(String(reader.result));
    reader.readAsDataURL(nextFile);
  }, []);

  const analyze = useCallback(async () => {
    if (!file) return;

    setIsAnalyzing(true);
    setError(null);
    setResult(null);

    try {
      const form = new FormData();
      form.append('file', file, file.name);
      const response = await fetch(`${ENGINE_URL}/analyze`, {
        method: 'POST',
        body: form,
      });

      const contentType = response.headers.get('content-type') ?? '';
      const body = contentType.includes('application/json')
        ? await response.json().catch(() => null)
        : null;

      if (!response.ok) {
        const message = body?.message ?? body?.error ?? 'تعذّر بدء التحليل.';
        throw new Error(message);
      }
      if (body?.status === 'error') {
        throw new Error(body.message ?? 'تعذّر بدء التحليل.');
      }

      const normalized = body ? {
        ...body,
        annotated_image: body.annotated_image ?? null,
      } : null;

      setResult(normalized ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّر بدء التحليل.');
    } finally {
      setIsAnalyzing(false);
    }
  }, [file]);

  const detections = result?.detections ?? [];
  const annotatedImage = result?.annotated_image
    ? `data:${result.annotated_image_mime ?? 'image/png'};base64,${result.annotated_image}`
    : null;

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-white">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="overflow-hidden rounded-[2rem] border border-cyan-500/20 bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950/50 p-6 shadow-2xl shadow-cyan-950/30 sm:p-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div className="max-w-3xl">
              <p className="flex items-center gap-2 text-sm font-semibold text-cyan-300">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.9)]" />
                مسار تجريبي محلي فقط
              </p>
              <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">مختبر تحليل الصور الطبية</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
                ارفع صورة طبية لتشغيل محرك YOLO المحلي، ثم راقب النتيجة مباشرةً مع مربعات الكشف والحروف المصنفة.
              </p>
              <p className="mt-2 text-xs text-slate-400">معرّف العيادة التجريبي: {TEST_CLINIC_ID}</p>
            </div>
            <button
              type="button"
              onClick={analyze}
              disabled={!file || isAnalyzing}
              className="inline-flex items-center justify-center rounded-full bg-cyan-400 px-6 py-3 text-sm font-black text-slate-950 shadow-lg shadow-cyan-500/20 transition hover:-translate-y-0.5 hover:bg-cyan-300 focus:outline-none focus:ring-4 focus:ring-cyan-400/30 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isAnalyzing ? (
                <>
                  <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-slate-950/30 border-t-slate-950" />
                  جارٍ التحليل...
                </>
              ) : (
                'ابدأ التحليل'
              )}
            </button>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                inputRef.current?.click();
              }
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragging(false);
              onFileSelected(event.dataTransfer.files?.[0] ?? null);
            }}
            className={`flex min-h-96 cursor-pointer flex-col items-center justify-center rounded-[2rem] border-2 border-dashed p-8 text-center transition ${isDragging ? 'border-cyan-400 bg-cyan-500/10' : 'border-slate-700 bg-slate-900/60'}`}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.dcm,.dicom,image/jpeg,image/png,image/dicom"
              className="hidden"
              onChange={(event) => onFileSelected(event.target.files?.[0] ?? null)}
            />
            <div className="text-6xl">🩻</div>
            <h2 className="mt-5 text-xl font-bold">اسحب الصورة هنا أو اضغط للرفع</h2>
            <p className="mt-2 text-sm text-slate-400">JPG • PNG • DICOM • حتى 10 MB</p>
            {file && <p className="mt-4 rounded-full bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-200">{file.name}</p>}
          </div>

          <div className="rounded-[2rem] border border-slate-800 bg-slate-900/60 p-6">
            <h2 className="text-lg font-bold">معاينة الصورة</h2>
            {preview ? (
              <img src={preview} alt="معاينة الملف الطبي" className="mt-4 h-80 w-full rounded-2xl border border-slate-700 bg-slate-950 object-contain" />
            ) : (
              <div className="mt-4 grid h-80 place-items-center rounded-2xl border border-slate-700 bg-slate-950 text-sm text-slate-500">
                لم يتم اختيار صورة بعد.
              </div>
            )}
          </div>
        </section>

        <section className="rounded-[2rem] border border-slate-800 bg-slate-900/60 p-6 sm:p-8">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-xl font-bold">نتائج التحليل</h2>
            {result && (
              <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs font-bold text-cyan-200">
                {result.status === 'ok' ? 'تم اكتشاف مناطق' : result.status === 'no_detections' ? 'لا توجد مناطق' : result.status}
              </span>
            )}
          </div>

          {error && (
            <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">
              <div className="font-bold">تعذّر استخدام المحرك المحلي</div>
              <p className="mt-1">{error}</p>
            </div>
          )}

          {!error && !result && !isAnalyzing && (
            <div className="mt-6 flex min-h-40 items-center justify-center rounded-2xl border border-dashed border-slate-700 bg-slate-950/60 text-sm text-slate-400">
              اضغط «ابدأ التحليل» لتظهر النتائج هنا.
            </div>
          )}

          {isAnalyzing && (
            <div className="mt-6 flex min-h-48 flex-col items-center justify-center rounded-2xl border border-cyan-500/20 bg-cyan-500/5">
              <span className="h-12 w-12 animate-spin rounded-full border-4 border-cyan-500/20 border-t-cyan-400" />
              <p className="mt-4 text-sm font-medium text-cyan-200">يجري تحليل الصورة والتعرف على المناطق...</p>
            </div>
          )}

          {result && (
            <div className="mt-5 space-y-5">
              <div className="flex flex-wrap gap-3 text-sm">
                <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-cyan-200">الحالة: {result.status}</span>
                <span className="rounded-full border border-slate-700 px-3 py-1 text-slate-300">المحرك: {result.provider}</span>
                <span className="rounded-full border border-slate-700 px-3 py-1 text-slate-300">الأبعاد: {result.width} × {result.height}</span>
              </div>

              {detections.length === 0 ? (
                <p className="text-sm text-slate-400">لم يتم اكتشاف مناطق مشتبه بها في الصورة الحالية.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="text-slate-400">
                      <tr>
                        <th className="px-3 py-2 text-right">النوع</th>
                        <th className="px-3 py-2 text-right">الثقة</th>
                        <th className="px-3 py-2 text-right">الموقع</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detections.map((detection, index) => (
                        <tr key={`${detection.class_name}-${index}`} className="border-t border-slate-800 text-slate-200">
                          <td className="px-3 py-2">{String(detection.class_name)}</td>
                          <td className="px-3 py-2">{Math.round(Number(detection.confidence) * 100)}%</td>
                          <td className="px-3 py-2">
                            x {Math.round(Number(detection.x))}, y {Math.round(Number(detection.y))}, w {Math.round(Number(detection.width))}, h {Math.round(Number(detection.height))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {annotatedImage && (
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <h3 className="mb-3 text-sm font-bold text-slate-200">الصورة الأصلية</h3>
                    <img src={preview ?? ''} alt="الصورة الطبية الأصلية" className="h-80 w-full rounded-2xl border border-slate-700 bg-slate-950 object-contain" />
                  </div>
                  <div>
                    <h3 className="mb-3 text-sm font-bold text-cyan-200">الصورة المُحللة</h3>
                    <img src={annotatedImage} alt="الصورة الطبية مع المربعات المكتشفة" className="h-80 w-full rounded-2xl border border-cyan-500/30 bg-slate-950 object-contain" />
                  </div>
                </div>
              )}

              {result.warning && <p className="text-sm text-amber-300">{String(result.warning)}</p>}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
