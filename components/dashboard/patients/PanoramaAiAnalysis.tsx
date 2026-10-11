'use client';

import { useEffect, useState } from 'react';
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
  const [enabled, setEnabled] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadPreview() {
      try {
        const statusResponse = await fetch('/api/ai/panorama-analyze', { cache: 'no-store' });
        if (!statusResponse.ok) return;
        const statusPayload: unknown = await statusResponse.json();
        if (!isRecord(statusPayload) || statusPayload.enabled !== true) return;
        if (active) setEnabled(true);

        const headers = await authHeaders();
        const imageResponse = await fetch(
          `/api/clinic/medical-files/${encodeURIComponent(medicalFileId)}?clinic_id=${encodeURIComponent(clinicId)}`,
          { headers }
        );
        const imagePayload: unknown = await imageResponse.json();
        if (
          !imageResponse.ok ||
          !isRecord(imagePayload) ||
          !isRecord(imagePayload.data) ||
          typeof imagePayload.data.signed_url !== 'string'
        ) {
          throw new Error('Image preview URL was not returned.');
        }
        if (active) setImageUrl(imagePayload.data.signed_url);
      } catch (caught) {
        console.error(
          '[panorama-analyze] image preview initialization failed:',
          caught instanceof Error ? caught.message : 'Unknown error'
        );
        if (active) {
          setEnabled(true);
          setError('تعذر تحميل صورة البانوراما للمعاينة.');
        }
      } finally {
        if (active) setLoadingPreview(false);
      }
    }

    void loadPreview();
    return () => {
      active = false;
    };
  }, [authHeaders, clinicId, medicalFileId]);

  if (!enabled) return null;

  return (
    <section className="mt-4 border-t border-slate-800/80 pt-4" aria-label="تحليل صورة البانوراما">
      {imageUrl ? (
        <AiXrayAnalyzer
          clinicId={clinicId}
          patientId={patientId}
          medicalFileId={medicalFileId}
          authHeaders={authHeaders}
          imageUrl={imageUrl}
          imageAlt={filename}
        />
      ) : (
        error ? (
          <p className="text-sm text-rose-300" role="alert">
            {error}
          </p>
        ) : loadingPreview ? (
          <p className="text-sm text-slate-300" role="status">
            جارٍ تحميل صورة البانوراما...
          </p>
        ) : null
      )}
    </section>
  );
}
