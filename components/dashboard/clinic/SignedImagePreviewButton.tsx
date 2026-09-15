'use client';

import { useState } from 'react';
import ImageMorphViewer, { type ViewingImage } from '@/components/ui/ImageMorphViewer';

/**
 * SIGNED IMAGE PREVIEW BUTTON — dashboard preview for stored medical images.
 * Fetches a short-lived signed URL only when clicked (nothing is preloaded or
 * long-lived), then opens the morph viewer growing from the button's own rect.
 * Used in الملفات الطبية / imaging file lists.
 */
export default function SignedImagePreviewButton({
  fileId,
  clinicId,
  filename,
  authHeaders,
}: {
  fileId: string;
  clinicId: string;
  filename: string;
  authHeaders: () => Promise<Record<string, string>>;
}) {
  const [viewing, setViewing] = useState<ViewingImage | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function open(rect: DOMRect) {
    if (!clinicId || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/clinic/medical-files/${encodeURIComponent(fileId)}?clinic_id=${encodeURIComponent(clinicId)}`, { headers });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.data?.signed_url) throw new Error(body?.error ?? 'تعذر توليد رابط المعاينة');
      setViewing({
        src: String(body.data.signed_url),
        alt: filename,
        rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'حدث خطأ');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={(e) => void open(e.currentTarget.getBoundingClientRect())}
        className="rounded-full border border-emerald-500/40 px-4 py-1.5 text-xs font-semibold text-emerald-200 transition hover:border-emerald-400 disabled:opacity-50"
      >
        {busy ? '…' : 'معاينة'}
      </button>
      {err && <span className="text-xs text-red-400">{err}</span>}
      <ImageMorphViewer viewing={viewing} onClose={() => setViewing(null)} />
    </>
  );
}