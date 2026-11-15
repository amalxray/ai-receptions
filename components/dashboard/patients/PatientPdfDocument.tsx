'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';

pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

type PatientPdfDocumentProps = {
  fileUrl: string;
};

export default function PatientPdfDocument({ fileUrl }: PatientPdfDocumentProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [pageCount, setPageCount] = useState(0);

  const updateWidth = useCallback(() => {
    if (containerRef.current) {
      setContainerWidth(containerRef.current.clientWidth);
    }
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(container);
    return () => observer.disconnect();
  }, [updateWidth]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full overflow-auto bg-slate-950"
      aria-label="عارض ملف PDF"
    >
      <Document
        file={fileUrl}
        onLoadSuccess={({ numPages }) => {
          setPageCount(numPages);
        }}
        loading={
          <div className="flex min-h-full items-center justify-center p-6 text-sm text-slate-300" role="status">
            جارٍ تحميل مستند PDF...
          </div>
        }
        error={
          <div className="flex min-h-full items-center justify-center p-6 text-center text-sm text-rose-300" role="alert">
            تعذر عرض ملف PDF
          </div>
        }
        className="w-full"
      >
        <div className="flex w-full flex-col items-center">
          {Array.from({ length: pageCount }, (_, index) => (
            <Page
              key={`page-${index + 1}`}
              pageNumber={index + 1}
              width={containerWidth || undefined}
              renderAnnotationLayer
              renderTextLayer
              className="pdf-preview-page w-full"
            />
          ))}
        </div>
      </Document>
    </div>
  );
}
