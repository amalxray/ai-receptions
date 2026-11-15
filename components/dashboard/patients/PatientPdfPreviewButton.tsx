'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { createPortal } from 'react-dom';
import { Eye, Loader2, X } from 'lucide-react';

const PatientPdfDocument = dynamic(() => import('./PatientPdfDocument'), {
  ssr: false,
});

type PdfFileLike = {
  file_type?: string | null;
  mime_type?: string | null;
  original_filename?: string | null;
};

type PatientPdfPreviewButtonProps = {
  fileId: string;
  filename: string;
  clinicId: string;
  authHeaders: () => Promise<Record<string, string>>;
};

export function isPdfMedicalFile(file: PdfFileLike): boolean {
  return (
    file.file_type?.toLowerCase() === 'pdf' ||
    file.mime_type?.toLowerCase().includes('application/pdf') === true ||
    file.original_filename?.toLowerCase().endsWith('.pdf') === true
  );
}

export default function PatientPdfPreviewButton({
  fileId,
  filename,
  clinicId,
  authHeaders,
}: PatientPdfPreviewButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const triggerButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setIsOpen(false);
        setSignedUrl(null);
        setError(null);
        triggerButtonRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const openPreview = async () => {
    setIsOpen(true);
    setSignedUrl(null);
    setError(null);
    setLoading(true);

    try {
      const headers = await authHeaders();
      const response = await fetch(
        `/api/clinic/medical-files/${encodeURIComponent(fileId)}?clinic_id=${encodeURIComponent(clinicId)}`,
        { headers },
      );
      const json = await response.json().catch(() => null);
      if (!response.ok || typeof json?.data?.signed_url !== 'string') {
        throw new Error(json?.error || 'تعذر إنشاء رابط معاينة صالح');
      }
      setSignedUrl(json.data.signed_url);
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : 'تعذرت معاينة الملف');
    } finally {
      setLoading(false);
    }
  };

  const closePreview = () => {
    setIsOpen(false);
    setSignedUrl(null);
    setError(null);
    triggerButtonRef.current?.focus();
  };

  return (
    <>
      <button
        ref={triggerButtonRef}
        type="button"
        onClick={() => void openPreview()}
        className="flex items-center gap-1 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-200 transition hover:border-cyan-400/50 hover:bg-cyan-500/20"
        title="معاينة PDF"
        aria-label={`معاينة PDF: ${filename}`}
      >
        <Eye className="h-3.5 w-3.5" aria-hidden="true" />
        <span>معاينة</span>
      </button>

      {isOpen && createPortal(
        <div
          className="fixed inset-0 z-[70] h-[100dvh] w-screen bg-slate-950"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closePreview();
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby={`pdf-preview-title-${fileId}`}
            className="flex h-full w-full flex-col overflow-hidden bg-slate-900"
          >
            <header className="flex min-h-12 flex-shrink-0 items-center justify-between gap-3 border-b border-slate-800 px-4 py-2">
              <h2
                id={`pdf-preview-title-${fileId}`}
                className="min-w-0 truncate text-sm font-semibold text-white"
                title={filename}
              >
                معاينة PDF — {filename}
              </h2>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={closePreview}
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-slate-300 transition hover:bg-slate-800 hover:text-white"
                aria-label="إغلاق المعاينة"
              >
                <X className="h-5 w-5" />
              </button>
            </header>

            <div className="min-h-0 flex-1 bg-slate-950">
              {loading ? (
                <div className="flex h-full items-center justify-center gap-2 text-sm text-slate-300" role="status">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>جارٍ تجهيز المعاينة...</span>
                </div>
              ) : error ? (
                <div className="flex h-full items-center justify-center p-6 text-center text-sm text-rose-300" role="alert">
                  {error}
                </div>
              ) : signedUrl ? (
                <PatientPdfDocument fileUrl={signedUrl} />
              ) : null}
            </div>
          </section>
        </div>,
        document.body,
      )}
    </>
  );
}
