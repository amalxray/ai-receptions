'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  ArrowUpRight,
  Activity,
  AlertCircle,
  Circle as CircleIcon,
  Move,
  MousePointer2,
  Pencil,
  RotateCcw,
  Save,
  ScanLine,
  Search,
  Sparkles,
  Square as SquareIcon,
  Trash2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type Konva from 'konva';
import 'konva/lib/shapes/Arrow';
import 'konva/lib/shapes/Ellipse';
import 'konva/lib/shapes/Rect';
import 'konva/lib/shapes/Transformer';
import { Arrow, Ellipse, Layer, Rect, Stage, Transformer } from 'react-konva/lib/ReactKonvaCore';
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

type DrawingTool = 'select' | 'pan' | 'rectangle' | 'circle' | 'arrow';

interface Annotation {
  id: string;
  tool: Exclude<DrawingTool, 'select'>;
  x: number;
  y: number;
  width: number;
  height: number;
  flipX: boolean;
  flipY: boolean;
  className: string;
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

const annotationTerms = [
  'Caries',
  'Crown',
  'Filling',
  'Implant',
  'Root Canal Treatment',
  'Impacted Tooth',
  'Missing Teeth',
  'Periapical Lesion',
  'Bone Loss',
  'Fracture',
  'Cyst',
  'Root Resorption',
  'Retained Root',
  'Malaligned',
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
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const annotationNodesRef = useRef(new Map<string, Konva.Node>());
  const drawingStartRef = useRef<{ x: number; y: number } | null>(null);
  const annotationSequenceRef = useRef(0);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [hasAnalyzed, setHasAnalyzed] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [activePrediction, setActivePrediction] = useState<number | null>(null);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [drawingTool, setDrawingTool] = useState<DrawingTool>('select');
  const [draftAnnotation, setDraftAnnotation] = useState<Annotation | null>(null);
  const [showTermPicker, setShowTermPicker] = useState(false);
  const [termSearch, setTermSearch] = useState('');
  const [annotationsDirty, setAnnotationsDirty] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
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
    const selectedAnnotation = annotations.find(
      (annotation) => annotation.id === selectedAnnotationId,
    );
    const selectedNode = selectedAnnotation?.tool === 'rectangle'
      ? annotationNodesRef.current.get(selectedAnnotation.id)
      : undefined;
    transformerRef.current?.nodes(selectedNode ? [selectedNode] : []);
    transformerRef.current?.getLayer()?.batchDraw();
  }, [annotations, editMode, selectedAnnotationId]);

  useEffect(() => {
    setPredictions([]);
    setHasAnalyzed(false);
    setError(null);
    setActivePrediction(null);
    setAnnotations([]);
    setSelectedAnnotationId(null);
    setEditMode(false);
    setDrawingTool('select');
    setDraftAnnotation(null);
    setShowTermPicker(false);
    setAnnotationsDirty(false);
    setSaveMessage(null);
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
    setAnnotations([]);
    setSelectedAnnotationId(null);
    setShowTermPicker(false);
    setAnnotationsDirty(false);

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
  const allCategoriesSelected = categories.every(
    (category) => !hiddenCategories.includes(category),
  );

  const createAnnotation = (
    start: { x: number; y: number },
    end: { x: number; y: number },
    tool: Exclude<DrawingTool, 'select'>,
    id: string,
    className: string,
  ): Annotation => ({
    id,
    tool,
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
    flipX: end.x < start.x,
    flipY: end.y < start.y,
    className,
  });

  const markAnnotationsChanged = () => {
    setAnnotationsDirty(true);
    setSaveMessage(null);
  };

  const updateAnnotation = (id: string, changes: Partial<Annotation>) => {
    setAnnotations((current) =>
      current.map((annotation) =>
        annotation.id === id ? { ...annotation, ...changes } : annotation,
      ),
    );
    markAnnotationsChanged();
  };

  const beginDrawing = () => {
    if (!editMode || drawingTool === 'select' || drawingTool === 'pan') return;
    const pointer = stageRef.current?.getPointerPosition();
    if (!pointer) return;

    drawingStartRef.current = pointer;
    const id = `annotation-${++annotationSequenceRef.current}`;
    setDraftAnnotation(
      createAnnotation(pointer, pointer, drawingTool, id, 'Unclassified'),
    );
    setSelectedAnnotationId(null);
    setShowTermPicker(false);
  };

  const moveDrawing = () => {
    const start = drawingStartRef.current;
    const pointer = stageRef.current?.getPointerPosition();
    if (!start || !pointer || !draftAnnotation) return;
    setDraftAnnotation(
      createAnnotation(
        start,
        pointer,
        draftAnnotation.tool,
        draftAnnotation.id,
        draftAnnotation.className,
      ),
    );
  };

  const finishDrawing = () => {
    const start = drawingStartRef.current;
    const pointer = stageRef.current?.getPointerPosition();
    const draft = draftAnnotation;
    drawingStartRef.current = null;
    if (!start || !pointer || !draft) return;

    const annotation = createAnnotation(
      start,
      pointer,
      draft.tool,
      draft.id,
      draft.className,
    );
    setDraftAnnotation(null);
    if (Math.max(annotation.width, annotation.height) < 6) return;

    setAnnotations((current) => [...current, annotation]);
    setSelectedAnnotationId(annotation.id);
    setDrawingTool('select');
    setTermSearch('');
    setShowTermPicker(true);
    markAnnotationsChanged();
  };

  const deleteSelectedAnnotation = () => {
    if (!selectedAnnotationId) return;
    setAnnotations((current) =>
      current.filter((annotation) => annotation.id !== selectedAnnotationId),
    );
    setSelectedAnnotationId(null);
    setShowTermPicker(false);
    markAnnotationsChanged();
  };

  const saveAnnotations = () => {
    try {
      const payload = {
        format: 'ai-receptions-xray-annotations',
        version: 1,
        image: { width: imageSize.width, height: imageSize.height },
        annotations: annotations.map(
          ({ tool, x, y, width, height, flipX, flipY, className }) => ({
            tool,
            x,
            y,
            width,
            height,
            flipX,
            flipY,
            className,
          }),
        ),
      };
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = `xray-annotations-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setAnnotationsDirty(false);
      setSaveMessage('تم تنزيل ملف التعديلات محلياً؛ لم تُحفظ على سجل المريض.');
    } catch (saveError) {
      setSaveMessage(
        saveError instanceof Error
          ? `تعذر حفظ التعديلات: ${saveError.message}`
          : 'تعذر حفظ التعديلات.',
      );
    }
  };

  const annotationTermsWithResults = Array.from(
    new Set([...annotationTerms, ...categories]),
  );
  const filteredAnnotationTerms = annotationTermsWithResults.filter((term) =>
    term.toLowerCase().includes(termSearch.trim().toLowerCase()),
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
            كبّر الصورة تدريجياً، وافحص النتائج أو أضف ملاحظات مرئية على الصورة.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditMode((current) => !current);
            setDrawingTool('select');
            setSelectedAnnotationId(null);
            setShowTermPicker(false);
          }}
          aria-pressed={editMode}
          className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
            editMode
              ? 'border-indigo-300 bg-indigo-50 text-indigo-800'
              : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
          }`}
        >
          <Pencil className="h-4 w-4" aria-hidden="true" />
          {editMode ? 'إنهاء التحرير' : 'تحرير العلامات'}
        </button>
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
        className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-[minmax(12rem,1fr)_minmax(0,3fr)_minmax(16rem,1fr)]"
        style={{ direction: 'ltr' }}
      >
        <aside
          className="min-w-0 rounded-2xl border border-slate-700 bg-slate-900 p-4 shadow-lg flex flex-col"
          dir="rtl"
          aria-label="تصفية فئات الاكتشاف"
        >
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-bold text-white">الفئات</h3>
              <p className="mt-1 text-xs text-slate-400">{categories.length} فئات مكتشفة</p>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setHiddenCategories([])}
                disabled={categories.length === 0 || allCategoriesSelected}
                className="rounded-md px-2 py-1 text-xs font-medium text-cyan-300 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                تحديد الكل
              </button>
              <button
                type="button"
                onClick={() => setHiddenCategories(categories)}
                disabled={categories.length === 0 || !allCategoriesSelected}
                className="rounded-md px-2 py-1 text-xs font-medium text-slate-300 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                إلغاء الكل
              </button>
            </div>
          </div>
          <p className="mb-2 text-xs text-slate-400" aria-live="polite">
            ظاهرة: {visiblePredictions.length}/{predictions.length}
          </p>

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

        <div className="min-w-0 space-y-3" dir="rtl">
          {editMode && (
            <div
              className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-slate-900/90 p-3 shadow-lg backdrop-blur-xl"
              role="toolbar"
              aria-label="أدوات تحرير صورة الأشعة"
            >
              <button
                type="button"
                onClick={() => setDrawingTool('rectangle')}
                aria-pressed={drawingTool === 'rectangle'}
                className={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${
                  drawingTool === 'rectangle'
                    ? 'border-cyan-300 bg-cyan-300/15 text-cyan-100'
                    : 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700'
                }`}
              >
                <SquareIcon className="h-4 w-4" aria-hidden="true" />
                مربع
              </button>
              <button
                type="button"
                onClick={() => setDrawingTool('circle')}
                aria-pressed={drawingTool === 'circle'}
                className={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${
                  drawingTool === 'circle'
                    ? 'border-cyan-300 bg-cyan-300/15 text-cyan-100'
                    : 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700'
                }`}
              >
                <CircleIcon className="h-4 w-4" aria-hidden="true" />
                دائرة
              </button>
              <button
                type="button"
                onClick={() => setDrawingTool('arrow')}
                aria-pressed={drawingTool === 'arrow'}
                className={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${
                  drawingTool === 'arrow'
                    ? 'border-cyan-300 bg-cyan-300/15 text-cyan-100'
                    : 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700'
                }`}
              >
                <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                سهم
              </button>
              <button
                type="button"
                onClick={() => setDrawingTool('select')}
                aria-pressed={drawingTool === 'select'}
                className={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${
                  drawingTool === 'select'
                    ? 'border-cyan-300 bg-cyan-300/15 text-cyan-100'
                    : 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700'
                }`}
              >
                <MousePointer2 className="h-4 w-4" aria-hidden="true" />
                تحديد
              </button>
              <button
                type="button"
                onClick={() => setDrawingTool('pan')}
                aria-pressed={drawingTool === 'pan'}
                className={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${
                  drawingTool === 'pan'
                    ? 'border-cyan-300 bg-cyan-300/15 text-cyan-100'
                    : 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700'
                }`}
              >
                <Move className="h-4 w-4" aria-hidden="true" />
                تحريك
              </button>
              <button
                type="button"
                onClick={deleteSelectedAnnotation}
                disabled={!selectedAnnotationId}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 text-sm font-semibold text-rose-200 transition hover:bg-rose-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                حذف
              </button>
              <button
                type="button"
                onClick={saveAnnotations}
                disabled={!annotationsDirty && annotations.length === 0}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-emerald-300/30 bg-emerald-400/10 px-3 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-400/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Save className="h-4 w-4" aria-hidden="true" />
                حفظ التعديلات
              </button>
            </div>
          )}

          {saveMessage && (
            <p className="rounded-xl border border-cyan-300/20 bg-cyan-950/60 px-4 py-2 text-sm text-cyan-100" role="status">
              {saveMessage}
            </p>
          )}

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
            wheel={{ step: 0.2 }}
            pinch={{ step: 5, allowPanning: true }}
            panning={{
              velocityDisabled: true,
              disabled: editMode && drawingTool !== 'pan',
            }}
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
                    {imageSize.width > 0 && imageSize.height > 0 && (
                      <Stage
                        ref={stageRef}
                        width={imageSize.width}
                        height={imageSize.height}
                        style={{
                          position: 'absolute',
                          inset: 0,
                          width: '100%',
                          height: '100%',
                          cursor: !editMode
                            ? 'default'
                            : drawingTool === 'pan'
                              ? 'grab'
                              : drawingTool === 'select'
                                ? 'default'
                                : 'crosshair',
                        }}
                        listening={editMode && drawingTool !== 'pan'}
                        onMouseDown={(event) => {
                          if (event.target === event.target.getStage()) beginDrawing();
                        }}
                        onMouseMove={moveDrawing}
                        onMouseUp={finishDrawing}
                        onTouchStart={(event) => {
                          if (event.target === event.target.getStage()) beginDrawing();
                        }}
                        onTouchMove={moveDrawing}
                        onTouchEnd={finishDrawing}
                      >
                        <Layer>
                          {[...annotations, ...(draftAnnotation ? [draftAnnotation] : [])].map(
                            (annotation) => {
                              const color = getCategoryStyle(annotation.className, 0).color;
                              const isDraft = annotation.id === draftAnnotation?.id;
                              const shapeProps = {
                                key: annotation.id,
                                x: annotation.x,
                                y: annotation.y,
                                width: annotation.width,
                                height: annotation.height,
                                stroke: color,
                                strokeWidth: 3,
                                opacity: isDraft ? 0.65 : 1,
                                draggable:
                                  editMode &&
                                  drawingTool === 'select' &&
                                  !isDraft,
                                listening:
                                  editMode &&
                                  (drawingTool === 'select' || isDraft),
                                onClick: (event: Konva.KonvaEventObject<MouseEvent>) => {
                                  event.cancelBubble = true;
                                  if (drawingTool === 'select' && !isDraft) {
                                    setSelectedAnnotationId(annotation.id);
                                    setShowTermPicker(false);
                                  }
                                },
                                onTap: (event: Konva.KonvaEventObject<TouchEvent>) => {
                                  event.cancelBubble = true;
                                  if (drawingTool === 'select' && !isDraft) {
                                    setSelectedAnnotationId(annotation.id);
                                    setShowTermPicker(false);
                                  }
                                },
                                onDragEnd: (event: Konva.KonvaEventObject<DragEvent>) => {
                                  updateAnnotation(annotation.id, {
                                    x: event.target.x(),
                                    y: event.target.y(),
                                  });
                                },
                                onTransformEnd: (
                                  event: Konva.KonvaEventObject<Event>,
                                ) => {
                                  const node = event.target;
                                  const scaleX = node.scaleX();
                                  const scaleY = node.scaleY();
                                  node.scaleX(1);
                                  node.scaleY(1);
                                  updateAnnotation(annotation.id, {
                                    x: node.x(),
                                    y: node.y(),
                                    width: Math.max(1, node.width() * Math.abs(scaleX)),
                                    height: Math.max(1, node.height() * Math.abs(scaleY)),
                                    flipX: scaleX < 0 ? !annotation.flipX : annotation.flipX,
                                    flipY: scaleY < 0 ? !annotation.flipY : annotation.flipY,
                                  });
                                },
                              };

                              if (annotation.tool === 'rectangle') {
                                return (
                                  <Rect
                                    {...shapeProps}
                                    ref={(node) => {
                                      if (node) annotationNodesRef.current.set(annotation.id, node);
                                      else annotationNodesRef.current.delete(annotation.id);
                                    }}
                                    fill={`${color}18`}
                                  />
                                );
                              }
                              if (annotation.tool === 'circle') {
                                return (
                                  <Ellipse
                                    {...shapeProps}
                                    ref={(node) => {
                                      if (node) annotationNodesRef.current.set(annotation.id, node);
                                      else annotationNodesRef.current.delete(annotation.id);
                                    }}
                                    x={annotation.x + annotation.width / 2}
                                    y={annotation.y + annotation.height / 2}
                                    radiusX={annotation.width / 2}
                                    radiusY={annotation.height / 2}
                                    fill={`${color}18`}
                                  />
                                );
                              }
                              return (
                                <Arrow
                                  {...shapeProps}
                                  ref={(node) => {
                                    if (node) annotationNodesRef.current.set(annotation.id, node);
                                    else annotationNodesRef.current.delete(annotation.id);
                                  }}
                                  points={[
                                    annotation.flipX ? annotation.width : 0,
                                    annotation.flipY ? annotation.height : 0,
                                    annotation.flipX ? 0 : annotation.width,
                                    annotation.flipY ? 0 : annotation.height,
                                  ]}
                                  pointerLength={Math.max(8, imageSize.width * 0.008)}
                                  pointerWidth={Math.max(8, imageSize.width * 0.008)}
                                  fill={color}
                                />
                              );
                            },
                          )}
                          {editMode &&
                            annotations.some(
                              (annotation) =>
                                annotation.id === selectedAnnotationId &&
                                annotation.tool === 'rectangle',
                            ) && (
                            <Transformer
                              ref={transformerRef}
                              rotateEnabled={false}
                              flipEnabled
                              keepRatio={false}
                              anchorSize={10}
                              anchorFill="#ffffff"
                              anchorStroke="#06b6d4"
                              borderStroke="#06b6d4"
                              boundBoxFunc={(oldBox, newBox) =>
                                newBox.width < 5 || newBox.height < 5 ? oldBox : newBox
                              }
                            />
                          )}
                        </Layer>
                      </Stage>
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
                    onClick={() => zoomOut(0.2, 180)}
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
                    onClick={() => zoomIn(0.2, 180)}
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
                  كل خطوة تكبير 20٪ · عجلة الفأرة أو اللمس للتحريك
                </div>

                {showTermPicker && selectedAnnotationId && (
                  <div
                    className="absolute left-1/2 top-1/2 z-30 w-[min(22rem,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-white/15 bg-slate-900/95 p-4 text-slate-100 shadow-2xl backdrop-blur-xl"
                    dir="rtl"
                    role="dialog"
                    aria-label="اختيار مصطلح للعلامة"
                  >
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <h4 className="font-bold">اختر المصطلح</h4>
                      <button
                        type="button"
                        onClick={() => setShowTermPicker(false)}
                        className="rounded-lg px-2 py-1 text-sm text-slate-300 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                        aria-label="إغلاق اختيار المصطلح"
                      >
                        إغلاق
                      </button>
                    </div>
                    <label className="relative block">
                      <Search
                        className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                        aria-hidden="true"
                      />
                      <input
                        type="search"
                        value={termSearch}
                        onChange={(event) => setTermSearch(event.target.value)}
                        placeholder="ابحث عن مصطلح..."
                        className="min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 py-2 pe-10 ps-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/20"
                      />
                    </label>
                    <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto">
                      {filteredAnnotationTerms.map((term) => (
                        <li key={term}>
                          <button
                            type="button"
                            onClick={() => {
                              updateAnnotation(selectedAnnotationId, { className: term });
                              setShowTermPicker(false);
                            }}
                            className="w-full rounded-lg px-3 py-2 text-start text-sm text-slate-200 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                          >
                            {getCategoryStyle(term, 0).label}
                          </button>
                        </li>
                      ))}
                      {filteredAnnotationTerms.length === 0 && (
                        <li className="px-3 py-2 text-sm text-slate-400">
                          لا توجد مصطلحات مطابقة.
                        </li>
                      )}
                    </ul>
                  </div>
                )}

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
          <div
            className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-slate-900/90 p-4 shadow-lg backdrop-blur-xl sm:flex-row sm:items-end sm:justify-between"
            dir="rtl"
            aria-label="إعدادات تحليل الأشعة"
          >
            <label className="flex min-w-0 flex-1 flex-col gap-2 text-sm font-medium text-slate-200">
              حساسية التحليل
              <select
                value={confidenceThreshold}
                onChange={(event) => setConfidenceThreshold(Number(event.target.value))}
                disabled={isAnalyzing}
                className="min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 shadow-sm outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <option value={0.4}>فحص سريع (ثقة 40٪ فأكثر)</option>
                <option value={0.25}>فحص متوازن (موصى به - ثقة 25٪ فأكثر)</option>
                <option value={0.15}>فحص دقيق (ثقة 15٪ فأكثر)</option>
              </select>
            </label>
            <button
              type="button"
              onClick={analyzeImage}
              disabled={isAnalyzing || !consent}
              className="group inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-600 px-5 py-2.5 font-bold text-white shadow-lg shadow-indigo-600/20 transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-indigo-600/25 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-300 disabled:cursor-not-allowed disabled:opacity-60"
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

        <aside
          className="min-w-0 rounded-2xl border border-slate-700 bg-slate-900 p-4 shadow-lg flex flex-col"
          dir="rtl"
          aria-label="نتائج تحليل الأشعة"
        >
          <div className="mb-4 flex items-center justify-between gap-2">
            <div>
              <h3 className="font-bold text-white">النتائج ({predictions.length})</h3>
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
              {sortedVisiblePredictions.map(({ prediction, index }, resultIndex) => {
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
                          <span className="w-5 shrink-0 text-xs font-semibold tabular-nums text-slate-400">
                            {resultIndex + 1}.
                          </span>
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
