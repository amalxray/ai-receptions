'use client';

import { useState } from 'react';

type Prediction = {
  class_id: number;
  class_name: string;
  confidence: number;
  box: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
};

type Analysis = {
  id: string;
  model_version: string;
  image_width: number;
  image_height: number;
  predictions: Prediction[];
  created_at: string;
};

type PanoramaAiAnalysisProps = {
  clinicId: string;
  patientId: string;
  medicalFileId: string;
  filename: string;
  authHeaders: () => Promise<Record<string, string>>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isPrediction(value: unknown): value is Prediction {
  if (!isRecord(value) || !isRecord(value.box)) return false;
  return (
    typeof value.class_id === 'number' &&
    Number.isInteger(value.class_id) &&
    typeof value.class_name === 'string' &&
    typeof value.confidence === 'number' &&
    Number.isFinite(value.confidence) &&
    ['x', 'y', 'width', 'height'].every(
      (key) => typeof value.box[key] === 'number' && Number.isFinite(value.box[key])
    )
  );
}

function isAnalysis(value: unknown): value is Analysis {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.model_version === 'string' &&
    typeof value.image_width === 'number' &&
    typeof value.image_height === 'number' &&
    typeof value.created_at === 'string' &&
    Array.isArray(value.predictions) &&
    value.predictions.every(isPrediction)
  );
}

export default function PanoramaAiAnalysis({
  clinicId,
  patientId,
  medicalFileId,
  filename,
  authHeaders,
}: PanoramaAiAnalysisProps) {
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);

  async function analyze() {
    if (!consent || busy) return;
    setBusy(true);
    setError(null);
    try {
      const headers = await authHeaders();
      const body = new FormData();
      body.set('clinic_id', clinicId);
      body.set('patient_id', patientId);
      body.set('medical_file_id', medicalFileId);
      body.set('consent', 'true');

      const response = await fetch('/api/ai/panorama-analyze', {
        method: 'POST',
        headers,
        body,
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          isRecord(payload) && typeof payload.error === 'string'
            ? payload.error
            : 'تعذر تحليل الصورة حالياً.';
        throw new Error(message);
      }
      if (!isRecord(payload) || !isAnalysis(payload.data)) {
        throw new Error('استجابة خدمة التحليل غير صالحة.');
      }
      setAnalysis(payload.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'حدث خطأ أثناء تحليل الصورة.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="mt-4 space-y-3 rounded-xl border border-cyan-500/20 bg-slate-950/70 p-3"
      aria-label="تحليل بانوراما بمساعدة الذكاء الاصطناعي"
    >
      <div className="space-y-1 text-xs leading-6 text-slate-300">
        <p className="font-semibold text-cyan-100">تحليل مساعد لصورة البانوراما</p>
        <p>
          تُرسل الصورة إلى خادم تحليل خارجي لمعالجتها، ولا تُرسل إليه بيانات تعريف المريض.
          النتائج مؤشرات مساعدة فقط وليست تشخيصاً أو بديلاً عن مراجعة طبيب مؤهل.
        </p>
        <p>
          قبل المتابعة، اعرض على المريض أو ممثله القانوني غرض المعالجة وسياسة الخصوصية المعتمدة
          في العيادة.
        </p>
      </div>

      {!analysis && (
        <label className="flex cursor-pointer items-start gap-2 text-xs leading-5 text-slate-200">
          <input
            type="checkbox"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
            className="mt-1 accent-cyan-400"
          />
          <span>
            أؤكد أن المريض أو ممثله القانوني وافق على إرسال «{filename}» إلى خدمة التحليل
            الخارجية لهذا الغرض، وأنه أُبلغ بأن النتائج لا تمثل تشخيصاً طبياً.
          </span>
        </label>
      )}

      {error && (
        <p className="text-xs text-rose-300" role="alert">
          {error}
        </p>
      )}

      {analysis ? (
        <div className="space-y-2" aria-live="polite">
          <p className="text-xs font-semibold text-emerald-200">
            اكتمل التحليل — {analysis.predictions.length} نتيجة · {analysis.model_version}
          </p>
          {analysis.predictions.length === 0 ? (
            <p className="text-xs text-slate-300">لم تُكتشف مؤشرات ضمن عتبة النموذج.</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {analysis.predictions.map((prediction, index) => (
                <li
                  key={`${prediction.class_id}-${index}`}
                  className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-200"
                >
                  <span className="font-semibold">{prediction.class_name}</span>
                  <span className="ml-2 text-slate-400">
                    {Math.round(prediction.confidence * 100)}%
                  </span>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={() => void analyze()}
            disabled={busy}
            className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-cyan-500/50 disabled:opacity-50"
          >
            {busy ? 'جارٍ إعادة التحليل...' : 'إعادة التحليل'}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => void analyze()}
          disabled={!consent || busy}
          className="w-full rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2.5 text-xs font-bold text-cyan-100 transition hover:border-cyan-400/50 hover:bg-cyan-500/15 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? 'جارٍ إرسال الصورة وتحليلها...' : 'تأكيد الموافقة وبدء التحليل'}
        </button>
      )}
    </section>
  );
}
