'use client';

import { useState } from 'react';
import AiXrayAnalyzer from '@/components/features/AiXrayAnalyzer';

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

export default function PanoramaAiAnalysis({
  clinicId,
  patientId,
  medicalFileId,
  filename,
  authHeaders,
}: PanoramaAiAnalysisProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openAnalysis() {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const statusResponse = await fetch('/api/ai/panorama-analyze', { cache: 'no-store' });
      if (!statusResponse.ok) throw new Error('تعذر التحقق من توفر أداة تحليل البانوراما');
      const statusPayload: unknown = await statusResponse.json();
      if (!isRecord(statusPayload) || statusPayload.enabled !== true) {
        setError('أداة تحليل البانوراما غير مفعّلة لهذا النظام.');
        return;
      }

      const headers = await authHeaders();
      const imageResponse = await fetch(
        `/api/clinic/medical-files/${encodeURIComponent(medicalFileId)}?clinic_id=${encodeURIComponent(clinicId)}&variant=original`,
        { headers, cache: 'no-store' },
      );
      const imagePayload: unknown = await imageResponse.json();
      if (
        !imageResponse.ok ||
        !isRecord(imagePayload) ||
        !isRecord(imagePayload.data) ||
        typeof imagePayload.data.signed_url !== 'string'
      ) {
        throw new Error('تعذر تجهيز الصورة الأصلية للتحليل');
      }
      setImageUrl(imagePayload.data.signed_url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر فتح أداة تحليل البانوراما');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mt-4 border-t border-slate-800/80 pt-4" aria-label="تحليل صورة البانوراما">
      {imageUrl ? (
        <>
          <button
            type="button"
            onClick={() => setImageUrl(null)}
            className="mb-3 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-800"
          >
            إغلاق أداة التحليل
          </button>
          <AiXrayAnalyzer
            clinicId={clinicId}
            patientId={patientId}
            medicalFileId={medicalFileId}
            authHeaders={authHeaders}
            imageUrl={imageUrl}
            imageAlt={filename}
          />
        </>
      ) : (
        <button
          type="button"
          onClick={() => void openAnalysis()}
          disabled={loading}
          className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-500/20 disabled:opacity-50"
        >
          {loading ? 'جارٍ تجهيز أداة التحليل...' : 'فتح أداة تحليل البانوراما'}
        </button>
      )}
      {error && <p className="mt-2 text-xs text-rose-300" role="alert">{error}</p>}
    </section>
  );
}
