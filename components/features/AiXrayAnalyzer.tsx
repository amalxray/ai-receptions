'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Activity, AlertCircle, ChevronDown, RotateCcw, ScanLine, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';

interface Prediction {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
  class_name: string;
  class_id: number;
}

interface InferencePrediction {
  class_id: number;
  class_name: string;
  confidence: number;
  box: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

interface Analysis {
  id: string;
  model_version: string;
  image_width: number;
  image_height: number;
  predictions: InferencePrediction[];
  created_at: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isPrediction(value: unknown): value is InferencePrediction {
  if (!isRecord(value) || !isRecord(value.box)) return false;
  const box = value.box;
  return (
    typeof value.class_id === 'number' &&
    Number.isInteger(value.class_id) &&
    typeof value.class_name === 'string' &&
    typeof value.confidence === 'number' &&
    Number.isFinite(value.confidence) &&
    typeof box.x === 'number' &&
    Number.isFinite(box.x) &&
    typeof box.y === 'number' &&
    Number.isFinite(box.y) &&
    typeof box.width === 'number' &&
    Number.isFinite(box.width) &&
    typeof box.height === 'number' &&
    Number.isFinite(box.height)
  );
}

function isAnalysis(value: unknown): value is Analysis {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.model_version === 'string' &&
    typeof value.image_width === 'number' &&
    Number.isInteger(value.image_width) &&
    value.image_width > 0 &&
    typeof value.image_height === 'number' &&
    Number.isInteger(value.image_height) &&
    value.image_height > 0 &&
    typeof value.created_at === 'string' &&
    Array.isArray(value.predictions) &&
    value.predictions.every(isPrediction)
  );
}

export interface AiXrayAnalyzerProps {
  clinicId: string;
  patientId: string;
  medicalFileId: string;
  authHeaders: () => Promise<Record<string, string>>;
  imageUrl?: string;
  imageFile?: File;
  imageAlt?: string;
  className?: string;
  onImageError?: () => void;
}

const categoryStyles: Record<string, { color: string; softColor: string; label: string }> = {
  caries: { color: '#ef4444', softColor: 'rgba(239, 68, 68, 0.14)', label: 'Caries' },
  crown: { color: '#3b82f6', softColor: 'rgba(59, 130, 246, 0.14)', label: 'Crown' },
  'root canal': { color: '#10b981', softColor: 'rgba(16, 185, 129, 0.14)', label: 'Root Canal' },
  implant: { color: '#a855f7', softColor: 'rgba(168, 85, 247, 0.14)', label: 'Implant' },
  filling: { color: '#f59e0b', softColor: 'rgba(245, 158, 11, 0.14)', label: 'Filling' },
  'impacted tooth': { color: '#06b6d4', softColor: 'rgba(6, 182, 212, 0.14)', label: 'Impacted tooth' },
  'missing teeth': { color: '#64748b', softColor: 'rgba(100, 116, 139, 0.14)', label: 'Missing teeth' },
};

function getCategoryStyle(className: string) {
  const normalizedClass = className.trim().toLowerCase();
  const matchingCategory = Object.keys(categoryStyles).find((category) =>
    normalizedClass.includes(category),
  );

  return matchingCategory
    ? categoryStyles[matchingCategory]
    : { color: '#64748b', softColor: 'rgba(100, 116, 139, 0.14)', label: className };
}

export default function AiXrayAnalyzer({
  clinicId,
  patientId,
  medicalFileId,
  authHeaders,
  imageUrl,
  imageFile,
  imageAlt = 'Dental panoramic X-ray',
  className = '',
  onImageError,
}: AiXrayAnalyzerProps) {
  const prefersReducedMotion = useReducedMotion();
  const imageRef = useRef<HTMLImageElement>(null);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [hasAnalyzed, setHasAnalyzed] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isResultsOpen, setIsResultsOpen] = useState(true);
  const [activePrediction, setActivePrediction] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [fileObjectUrl, setFileObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!imageFile) {
      setFileObjectUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(imageFile);
    setFileObjectUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [imageFile]);

  const displayedImageUrl = imageFile ? fileObjectUrl : imageUrl;

  const updateImageSize = useCallback(() => {
    const image = imageRef.current;
    if (!image) return;
    setImageSize({ width: image.naturalWidth, height: image.naturalHeight });
  }, []);

  useEffect(() => {
    setPredictions([]);
    setHasAnalyzed(false);
    setError(null);
    setActivePrediction(null);
    setConsent(false);
    setIsResultsOpen(true);
  }, [displayedImageUrl]);

  const analyzeImage = async () => {
    if (isAnalyzing || !consent || (!imageFile && !imageUrl)) return;

    setIsAnalyzing(true);
    setError(null);
    setPredictions([]);
    setHasAnalyzed(false);
    setActivePrediction(null);

    try {
      const headers = await authHeaders();
      const formData = new FormData();
      formData.set('clinic_id', clinicId);
      formData.set('patient_id', patientId);
      formData.set('medical_file_id', medicalFileId);
      formData.set('consent', 'true');

      const response = await fetch('/api/ai/panorama-analyze', {
        method: 'POST',
        headers,
        body: formData,
      });
      const payload: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        const message =
          isRecord(payload) && typeof payload.error === 'string'
            ? payload.error
            : 'تعذّر تحليل الصورة. حاول مرة أخرى.';
        throw new Error(message);
      }

      if (!isRecord(payload) || !isAnalysis(payload.data)) {
        throw new Error('استجابة خدمة التحليل غير صالحة.');
      }

      setPredictions(
        payload.data.predictions.map((prediction) => ({
          class_id: prediction.class_id,
          class_name: prediction.class_name,
          confidence: prediction.confidence,
          ...prediction.box,
        })),
      );
      setHasAnalyzed(true);
    } catch (analysisError) {
      setError(
        analysisError instanceof Error
          ? analysisError.message
          : 'حدث خطأ غير متوقع أثناء تحليل الصورة.',
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  const resultCounts = predictions.reduce<Record<string, number>>((counts, prediction) => {
    counts[prediction.class_name] = (counts[prediction.class_name] || 0) + 1;
    return counts;
  }, {});

  if (!displayedImageUrl) {
    return (
      <div
        className={`rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600 ${className}`}
        role="status"
      >
        أضف رابط صورة الأشعة أو ملف الصورة لبدء التحليل.
      </div>
    );
  }

  return (
    <section className={`space-y-4 ${className}`} aria-label="تحليل الأشعة بالذكاء الاصطناعي">
      <div className="relative mx-auto w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 shadow-lg">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imageRef}
          src={displayedImageUrl}
          alt={imageAlt}
          onLoad={updateImageSize}
          onError={onImageError}
          className="block h-auto w-full"
        />

        {imageSize.width > 0 && imageSize.height > 0 && predictions.length > 0 && (
          <div className="pointer-events-none absolute inset-0" aria-hidden="true">
            {predictions.map((prediction, index) => {
              const style = getCategoryStyle(prediction.class_name);
              const isActive = activePrediction === index;
              const isDimmed = activePrediction !== null && !isActive;

              return (
                <div
                  key={`${prediction.class_name}-${prediction.class_id}-${index}`}
                  className="absolute rounded-sm border-2 transition-all duration-200"
                  style={{
                    left: `${(prediction.x / imageSize.width) * 100}%`,
                    top: `${(prediction.y / imageSize.height) * 100}%`,
                    width: `${(prediction.width / imageSize.width) * 100}%`,
                    height: `${(prediction.height / imageSize.height) * 100}%`,
                    borderColor: style.color,
                    backgroundColor: style.softColor,
                    opacity: isDimmed ? 0.16 : 1,
                    zIndex: isActive ? 2 : 1,
                    boxShadow: isActive ? `0 0 0 3px ${style.softColor}, 0 0 18px ${style.color}80` : 'none',
                  }}
                >
                  {!isDimmed && (
                    <span
                      className="absolute -top-5 left-0 whitespace-nowrap rounded-t px-1.5 py-0.5 text-[10px] font-bold leading-none text-white"
                      style={{ backgroundColor: style.color }}
                    >
                      {style.label}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <AnimatePresence>
          {isAnalyzing && (
            <motion.div
              className="pointer-events-none absolute inset-0 overflow-hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              role="status"
              aria-label="جار تحليل صورة الأشعة"
            >
              <div className="absolute inset-0 bg-cyan-400/5" />
              {!prefersReducedMotion && (
                <motion.div
                  className="absolute inset-x-0 h-1 bg-gradient-to-r from-transparent via-cyan-300 to-transparent shadow-[0_0_24px_8px_rgba(34,211,238,0.55)]"
                  initial={{ top: '-2%' }}
                  animate={{ top: '102%' }}
                  transition={{ duration: 1.8, repeat: Infinity, ease: 'linear' }}
                />
              )}
              <div className="absolute bottom-4 left-4 inline-flex items-center gap-2 rounded-full border border-cyan-200/30 bg-slate-950/75 px-3 py-2 text-xs font-semibold text-cyan-50 backdrop-blur">
                <Activity className="h-4 w-4 animate-pulse text-cyan-300" aria-hidden="true" />
                جار تحليل الأشعة...
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {!hasAnalyzed && (
        <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
          <p>
            التحليل مساعد فقط وليس تشخيصاً طبياً. ستُعالج صورة الملف الطبي المحفوظ عبر خدمة
            تحليل خارجية، دون إرسال هوية المريض إلى مزود الاستدلال.
          </p>
          <label className="flex cursor-pointer items-start gap-2">
            <input
              type="checkbox"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
              className="mt-1 accent-indigo-600"
            />
            <span>
              أؤكد إبلاغ المريض أو ممثله القانوني والحصول على موافقته على معالجة الصورة لهذا
              الغرض.
            </span>
          </label>
        </div>
      )}

      <button
        type="button"
        onClick={analyzeImage}
        disabled={isAnalyzing || !consent}
        className="group inline-flex min-h-12 w-full items-center justify-center gap-2.5 rounded-xl bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-600 px-5 py-3 font-bold text-white shadow-lg shadow-indigo-600/20 transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-indigo-600/25 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-300 disabled:cursor-wait disabled:opacity-75 sm:w-auto"
      >
        {isAnalyzing ? (
          <ScanLine className="h-5 w-5 animate-pulse" aria-hidden="true" />
        ) : (
          <Sparkles className="h-5 w-5 transition-transform group-hover:rotate-12" aria-hidden="true" />
        )}
        <span>{isAnalyzing ? 'جارٍ تحليل الصورة...' : 'تحليل بالذكاء الاصطناعي'}</span>
      </button>

      <AnimatePresence initial={false}>
        {error && (
          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            role="alert"
            className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"
          >
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" aria-hidden="true" />
            <span>{error}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {hasAnalyzed && (
          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, height: 0, y: 12 }}
            animate={{ opacity: 1, height: 'auto', y: 0 }}
            exit={{ opacity: 0, height: 0, y: 8 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.28, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <button
                type="button"
                onClick={() => setIsResultsOpen((open) => !open)}
                aria-expanded={isResultsOpen}
                className="flex w-full items-center justify-between gap-4 bg-gradient-to-l from-indigo-50 via-white to-cyan-50 px-5 py-4 text-start transition hover:from-indigo-100 hover:to-cyan-100"
              >
                <span>
                  <span className="block text-base font-bold text-slate-900">نتائج تحليل الأشعة</span>
                  <span className="mt-1 block text-sm text-slate-500">
                    {predictions.length > 0
                      ? `${predictions.length} اكتشاف · مرّر على النتيجة لإبراز موقعها`
                      : 'اكتمل التحليل'}
                  </span>
                </span>
                <ChevronDown
                  className={`h-5 w-5 shrink-0 text-slate-500 transition-transform duration-200 ${isResultsOpen ? 'rotate-180' : ''}`}
                  aria-hidden="true"
                />
              </button>

              <AnimatePresence initial={false}>
                {isResultsOpen && (
                  <motion.div
                    initial={prefersReducedMotion ? false : { opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: prefersReducedMotion ? 0 : 0.22 }}
                    className="overflow-hidden"
                  >
                    <div className="space-y-4 border-t border-slate-100 p-4 sm:p-5">
                      {predictions.length === 0 ? (
                        <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
                          لم يتم رصد أي نتائج في هذه الصورة.
                        </p>
                      ) : (
                        <>
                          <div className="flex flex-wrap gap-2">
                            {Object.entries(resultCounts).map(([category, count]) => {
                              const style = getCategoryStyle(category);
                              return (
                                <span
                                  key={category}
                                  className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold"
                                  style={{
                                    borderColor: `${style.color}40`,
                                    backgroundColor: style.softColor,
                                    color: style.color,
                                  }}
                                >
                                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: style.color }} />
                                  {style.label} <span className="opacity-75">× {count}</span>
                                </span>
                              );
                            })}
                          </div>

                          <ul className="grid gap-2 sm:grid-cols-2">
                            {predictions.map((prediction, index) => {
                              const style = getCategoryStyle(prediction.class_name);
                              const confidence = Math.max(0, Math.min(1, prediction.confidence));

                              return (
                                <li key={`${prediction.class_name}-${prediction.class_id}-${index}`}>
                                  <button
                                    type="button"
                                    onMouseEnter={() => setActivePrediction(index)}
                                    onMouseLeave={() => setActivePrediction(null)}
                                    onFocus={() => setActivePrediction(index)}
                                    onBlur={() => setActivePrediction(null)}
                                    className={`flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-start transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
                                      activePrediction === index
                                        ? 'border-indigo-300 bg-indigo-50 shadow-sm'
                                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                                    }`}
                                    aria-label={`${style.label}, ثقة ${Math.round(confidence * 100)} بالمئة، النتيجة ${index + 1}`}
                                  >
                                    <span className="flex min-w-0 items-center gap-3">
                                      <span
                                        className="h-3 w-3 shrink-0 rounded-full ring-4"
                                        style={{
                                          backgroundColor: style.color,
                                          '--tw-ring-color': style.softColor,
                                        } as CSSProperties}
                                      />
                                      <span className="min-w-0">
                                        <span className="block truncate text-sm font-bold text-slate-800">{style.label}</span>
                                        <span className="mt-0.5 block text-xs text-slate-500">نتيجة {index + 1}</span>
                                      </span>
                                    </span>
                                    <span className="shrink-0 text-sm font-bold tabular-nums" style={{ color: style.color }}>
                                      {Math.round(confidence * 100)}%
                                    </span>
                                  </button>
                                </li>
                              );
                            })}
                          </ul>

                          <div className="flex items-center gap-2 border-t border-slate-100 pt-3 text-xs leading-5 text-slate-500">
                            <RotateCcw className="h-4 w-4 shrink-0" aria-hidden="true" />
                            النتائج مساعدة بصرية أولية وليست تشخيصًا طبيًا؛ يُرجى مراجعتها من قبل طبيب الأسنان.
                          </div>
                        </>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
