'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  Activity,
  AlertCircle,
  RotateCcw,
  ScanLine,
  Sparkles,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch';

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

interface CategoryStyle {
  color: string;
  softColor: string;
  label: string;
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

const categoryStyles: Record<string, CategoryStyle> = {
  caries: { color: '#ef4444', softColor: 'rgba(239, 68, 68, 0.14)', label: 'Caries' },
  crown: { color: '#3b82f6', softColor: 'rgba(59, 130, 246, 0.14)', label: 'Crown' },
  'root canal': { color: '#10b981', softColor: 'rgba(16, 185, 129, 0.14)', label: 'Root Canal' },
  implant: { color: '#a855f7', softColor: 'rgba(168, 85, 247, 0.14)', label: 'Implant' },
  filling: { color: '#f59e0b', softColor: 'rgba(245, 158, 11, 0.14)', label: 'Filling' },
  'impacted tooth': {
    color: '#06b6d4',
    softColor: 'rgba(6, 182, 212, 0.14)',
    label: 'Impacted tooth',
  },
  'missing teeth': {
    color: '#64748b',
    softColor: 'rgba(100, 116, 139, 0.14)',
    label: 'Missing teeth',
  },
};

const fallbackColors = [
  '#f97316',
  '#a855f7',
  '#14b8a6',
  '#eab308',
  '#ec4899',
  '#0ea5e9',
  '#84cc16',
  '#6366f1',
];

function getCategoryStyle(className: string, classId: number): CategoryStyle {
  const normalizedClass = className.trim().toLowerCase();
  const matchingCategory = Object.keys(categoryStyles).find((category) =>
    normalizedClass.includes(category),
  );

  if (matchingCategory) return categoryStyles[matchingCategory];

  const color = fallbackColors[Math.abs(classId) % fallbackColors.length];
  return { color, softColor: `${color}24`, label: className };
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
  const [activePrediction, setActivePrediction] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.25);
  const [zoom, setZoom] = useState(1);
  const [hiddenCategories, setHiddenCategories] = useState<string[]>([]);
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
    setZoom(1);
    setHiddenCategories([]);
    if (imageRef.current?.complete && imageRef.current.naturalWidth > 0) {
      updateImageSize();
    }
  }, [displayedImageUrl, updateImageSize]);

  const analyzeImage = async () => {
    if (isAnalyzing || !consent || (!imageFile && !imageUrl)) return;

    setIsAnalyzing(true);
    setError(null);
    setPredictions([]);
    setHasAnalyzed(false);
    setActivePrediction(null);
    setHiddenCategories([]);

    try {
      const headers = await authHeaders();
      const formData = new FormData();
      formData.set('clinic_id', clinicId);
      formData.set('patient_id', patientId);
      formData.set('medical_file_id', medicalFileId);
      formData.set('consent', 'true');
      formData.set('confidence_threshold', String(confidenceThreshold));

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

  const categories = Array.from(new Set(predictions.map((prediction) => prediction.class_name))).sort(
    (left, right) => left.localeCompare(right),
  );
  const visiblePredictions = predictions
    .map((prediction, index) => ({ prediction, index }))
    .filter(({ prediction }) => !hiddenCategories.includes(prediction.class_name));
  const sortedVisiblePredictions = [...visiblePredictions].sort(
    (left, right) => right.prediction.confidence - left.prediction.confidence,
  );

  const toggleCategory = (className: string) => {
    setHiddenCategories((current) =>
      current.includes(className)
        ? current.filter((category) => category !== className)
        : [...current, className],
    );
    setActivePrediction(null);
  };

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
    <section
      className={`space-y-4 text-slate-100 ${className}`}
      aria-label="تحليل الأشعة بالذكاء الاصطناعي"
      dir="rtl"
    >
      {!hasAnalyzed && (
        <div className="space-y-3 rounded-2xl border border-amber-300/30 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
          <p>
            ⚠️ إخلاء مسؤولية: أداة مساعدة آلية، وليست تشخيصاً طبياً معتمداً.
          </p>
          <p>
            🔒 الخصوصية: تُرسل صورة الأشعة عبر اتصال مشفّر إلى خادم التحليل، ولا تُحفظ هناك.
            تبقى الصورة الأصلية ضمن ملف المريض، وتُحفظ نتيجة التحليل في سجله.
          </p>
          <label className="flex cursor-pointer items-start gap-2">
            <input
              type="checkbox"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
              className="mt-1 accent-indigo-600"
            />
            <span>
              ✅ الموافقة: أقرّ بحصولي على موافقة المريض (أو وليه) قبل التحليل.
            </span>
          </label>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">محطة تحليل الأشعة</h2>
          <p className="mt-1 text-sm text-slate-500">
            كبّر الصورة بعجلة الفأرة أو اللمس، واسحبها لفحص التفاصيل.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
            حساسية التحليل
            <select
              value={confidenceThreshold}
              onChange={(event) => setConfidenceThreshold(Number(event.target.value))}
              disabled={isAnalyzing}
              className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/30 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value={0.4}>فحص سريع (حالات واضحة فقط - ثقة 40%+)</option>
              <option value={0.25}>فحص متوازن (موصى به - ثقة 25%+)</option>
              <option value={0.15}>فحص دقيق (اكتشافات أكثر - ثقة 15%+)</option>
            </select>
          </label>
          <button
            type="button"
            onClick={analyzeImage}
            disabled={isAnalyzing || !consent}
            className="group inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-600 px-5 py-2.5 font-bold text-white shadow-lg shadow-indigo-600/20 transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-indigo-600/25 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isAnalyzing ? (
              <ScanLine className="h-5 w-5 animate-pulse" aria-hidden="true" />
            ) : (
              <Sparkles
                className="h-5 w-5 transition-transform group-hover:rotate-12"
                aria-hidden="true"
              />
            )}
            <span>{isAnalyzing ? 'جارٍ تحليل الصورة...' : 'تحليل بالذكاء الاصطناعي'}</span>
          </button>
        </div>
      </div>

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

      <div
        className="grid grid-cols-1 items-stretch gap-4 xl:grid-cols-[minmax(13rem,1fr)_minmax(0,3fr)_minmax(16rem,1fr)]"
        style={{ direction: 'ltr' }}
      >
        <aside
          className="rounded-2xl border border-slate-700 bg-slate-900 p-4 shadow-lg"
          dir="rtl"
          aria-label="تصفية فئات الاكتشاف"
        >
          <div className="mb-4 flex items-center justify-between gap-2">
            <div>
              <h3 className="font-bold text-white">الفئات</h3>
              <p className="mt-1 text-xs text-slate-400">{categories.length} فئات مكتشفة</p>
            </div>
            <span className="rounded-lg bg-slate-800 px-2 py-1 text-xs tabular-nums text-slate-300">
              {visiblePredictions.length}/{predictions.length}
            </span>
          </div>

          {categories.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-700 p-3 text-xs leading-5 text-slate-400">
              ستظهر الفئات التي يرصدها النموذج هنا بعد اكتمال التحليل.
            </p>
          ) : (
            <ul className="max-h-[22rem] space-y-1 overflow-y-auto xl:max-h-[38rem]">
              {categories.map((category) => {
                const representative = predictions.find(
                  (prediction) => prediction.class_name === category,
                );
                const style = getCategoryStyle(category, representative?.class_id ?? 0);
                const checked = !hiddenCategories.includes(category);
                const count = predictions.filter(
                  (prediction) => prediction.class_name === category,
                ).length;

                return (
                  <li key={category}>
                    <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 transition hover:bg-slate-800">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleCategory(category)}
                        className="h-4 w-4 shrink-0 accent-cyan-400"
                        aria-label={`إظهار فئة ${style.label}`}
                      />
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: style.color }}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1 truncate text-sm text-slate-200">
                        {style.label}
                      </span>
                      <span className="text-xs tabular-nums text-slate-400">{count}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        <div
          className="relative min-w-0 overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 shadow-xl"
          dir="ltr"
          aria-label="عارض صورة الأشعة"
        >
          <TransformWrapper
            key={displayedImageUrl}
            initialScale={1}
            minScale={1}
            maxScale={5}
            centerOnInit
            fitOnInit="contain"
            wheel={{ step: 0.12 }}
            pinch={{ step: 5, allowPanning: true }}
            panning={{ velocityDisabled: true }}
            onTransform={(_ref, state) => setZoom(state.scale)}
          >
            {({ zoomIn, zoomOut, resetTransform, state }) => (
              <>
                <TransformComponent
                  wrapperClass="!h-[min(72vh,52rem)] !min-h-[24rem] !w-full touch-none"
                  contentClass="!relative !h-auto !w-full"
                >
                  <div className="relative w-full">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      ref={imageRef}
                      src={displayedImageUrl}
                      alt={imageAlt}
                      onLoad={updateImageSize}
                      onError={onImageError}
                      draggable={false}
                      className="block h-auto w-full select-none"
                    />

                    {imageSize.width > 0 &&
                      imageSize.height > 0 &&
                      visiblePredictions.length > 0 && (
                        <div
                          className="pointer-events-none absolute inset-0"
                          aria-hidden="true"
                        >
                          {visiblePredictions.map(({ prediction, index }) => {
                            const style = getCategoryStyle(
                              prediction.class_name,
                              prediction.class_id,
                            );
                            const isActive = activePrediction === index;

                            return (
                              <div
                                key={`${prediction.class_name}-${prediction.class_id}-${index}`}
                                className="absolute rounded-sm border-2 transition-opacity duration-150"
                                style={{
                                  left: `${(prediction.x / imageSize.width) * 100}%`,
                                  top: `${(prediction.y / imageSize.height) * 100}%`,
                                  width: `${(prediction.width / imageSize.width) * 100}%`,
                                  height: `${(prediction.height / imageSize.height) * 100}%`,
                                  borderColor: style.color,
                                  backgroundColor: style.softColor,
                                  opacity:
                                    activePrediction === null || isActive ? 1 : 0.2,
                                  zIndex: isActive ? 2 : 1,
                                  boxShadow: isActive
                                    ? `0 0 0 3px ${style.softColor}, 0 0 18px ${style.color}80`
                                    : 'none',
                                }}
                              >
                                <span
                                  className="absolute -top-5 left-0 whitespace-nowrap rounded-t px-1.5 py-0.5 text-[10px] font-bold leading-none text-white"
                                  style={{ backgroundColor: style.color }}
                                >
                                  {style.label}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                  </div>
                </TransformComponent>

                <div
                  className="absolute right-3 top-3 z-20 inline-flex items-center gap-1 rounded-xl border border-white/15 bg-slate-950/85 p-1 text-white shadow-lg backdrop-blur"
                  dir="ltr"
                  aria-label="أدوات تكبير صورة الأشعة"
                >
                  <button
                    type="button"
                    onClick={() => zoomOut()}
                    disabled={state.scale <= 1}
                    aria-label="تصغير صورة البانوراما"
                    title="تصغير"
                    className="rounded-lg p-2 transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ZoomOut className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <span
                    className="min-w-12 text-center text-xs font-semibold tabular-nums"
                    aria-live="polite"
                  >
                    {Math.round(zoom * 100)}٪
                  </span>
                  <button
                    type="button"
                    onClick={() => zoomIn()}
                    disabled={state.scale >= 5}
                    aria-label="تكبير صورة البانوراما"
                    title="تكبير"
                    className="rounded-lg p-2 transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ZoomIn className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => resetTransform()}
                    disabled={state.scale === 1 && state.positionX === 0 && state.positionY === 0}
                    aria-label="إعادة ضبط عرض الصورة"
                    title="إعادة ضبط"
                    className="rounded-lg p-2 transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>

                <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg border border-white/10 bg-slate-950/75 px-3 py-1.5 text-xs text-slate-200 backdrop-blur">
                  عجلة الفأرة أو اللمس للتكبير · اسحب للتحريك
                </div>

                <AnimatePresence>
                  {isAnalyzing && (
                    <motion.div
                      className="pointer-events-none absolute inset-0 z-10 overflow-hidden"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      role="status"
                      aria-label="جار تحليل صورة الأشعة"
                    >
                      <div className="absolute inset-0 bg-cyan-400/5" />
                      {!prefersReducedMotion && (
                        <>
                          <motion.div
                            className="absolute inset-x-0 h-1 bg-gradient-to-r from-transparent via-cyan-300 to-transparent shadow-[0_0_24px_8px_rgba(34,211,238,0.55)]"
                            initial={{ top: '-2%' }}
                            animate={{ top: '102%' }}
                            transition={{ duration: 1.8, repeat: Infinity, ease: 'linear' }}
                          />
                          <motion.div
                            className="absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-rose-500 to-transparent shadow-[0_0_18px_5px_rgba(244,63,94,0.55)]"
                            initial={{ top: '102%' }}
                            animate={{ top: '-2%' }}
                            transition={{ duration: 1.8, repeat: Infinity, ease: 'linear' }}
                          />
                        </>
                      )}
                      <div className="absolute bottom-14 left-3 inline-flex items-center gap-2 rounded-full border border-cyan-200/30 bg-slate-950/85 px-3 py-2 text-xs font-semibold text-cyan-50 backdrop-blur">
                        <Activity
                          className="h-4 w-4 animate-pulse text-cyan-300"
                          aria-hidden="true"
                        />
                        جار تحليل الأشعة...
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </>
            )}
          </TransformWrapper>
        </div>

        <aside
          className="rounded-2xl border border-slate-700 bg-slate-900 p-4 shadow-lg"
          dir="rtl"
          aria-label="نتائج تحليل الأشعة"
        >
          <div className="mb-4 flex items-center justify-between gap-2">
            <div>
              <h3 className="font-bold text-white">النتائج</h3>
              <p className="mt-1 text-xs text-slate-400">
                مرتبة حسب نسبة الثقة
              </p>
            </div>
            <span className="rounded-lg bg-slate-800 px-2 py-1 text-xs tabular-nums text-slate-300">
              {visiblePredictions.length}
            </span>
          </div>

          {sortedVisiblePredictions.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-700 p-3 text-sm leading-6 text-slate-400">
              {hasAnalyzed
                ? predictions.length > 0
                  ? 'لا توجد نتائج ظاهرة. فعّل فئة واحدة على الأقل من القائمة.'
                  : 'لم يتم رصد أي نتائج في هذه الصورة.'
                : 'ستظهر نتائج الفحص هنا بعد التحليل.'}
            </p>
          ) : (
            <ul className="max-h-[22rem] space-y-2 overflow-y-auto xl:max-h-[42rem]">
              {sortedVisiblePredictions.map(({ prediction, index }) => {
                const style = getCategoryStyle(prediction.class_name, prediction.class_id);
                const confidence = Math.max(0, Math.min(1, prediction.confidence));
                const percentage = Math.round(confidence * 100);

                return (
                  <li key={`${prediction.class_name}-${prediction.class_id}-${index}`}>
                    <button
                      type="button"
                      onMouseEnter={() => setActivePrediction(index)}
                      onMouseLeave={() => setActivePrediction(null)}
                      onFocus={() => setActivePrediction(index)}
                      onBlur={() => setActivePrediction(null)}
                      className={`w-full rounded-xl border p-3 text-start transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                        activePrediction === index
                          ? 'border-cyan-400/60 bg-slate-800'
                          : 'border-slate-700 bg-slate-950/60 hover:border-slate-500'
                      }`}
                      aria-label={`${style.label}، ثقة ${percentage} بالمئة، النتيجة ${index + 1}`}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: style.color }}
                            aria-hidden="true"
                          />
                          <span className="truncate text-sm font-semibold text-slate-100">
                            {style.label}
                          </span>
                        </span>
                        <span
                          className="shrink-0 text-sm font-bold tabular-nums"
                          style={{ color: style.color }}
                        >
                          {percentage}%
                        </span>
                      </span>
                      <span
                        className="mt-2 block h-1.5 overflow-hidden rounded-full bg-slate-700"
                        role="progressbar"
                        aria-label={`نسبة الثقة لفئة ${style.label}`}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={percentage}
                      >
                        <span
                          className="block h-full rounded-full transition-[width]"
                          style={{ width: `${percentage}%`, backgroundColor: style.color }}
                        />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>
      </div>
    </section>
  );
}
