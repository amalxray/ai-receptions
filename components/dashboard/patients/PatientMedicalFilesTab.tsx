'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
// N30 — React is imported explicitly (like SmartPatientProfile / the sessions
// panel) so the component can be server-rendered in unit tests exactly as the
// server ships it.
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  UploadCloud,
  FileText,
  FileSpreadsheet,
  Download,
  Trash2,
  AlertCircle,
  CheckCircle2,
  X,
  FileIcon,
  RefreshCw,
  HardDrive,
} from 'lucide-react';
import SignedImagePreviewButton from '@/components/dashboard/clinic/SignedImagePreviewButton';

export type MedicalFileRow = {
  id: string;
  clinic_id: string;
  patient_id: string;
  imaging_request_id?: string | null;
  file_type: 'image' | 'video' | 'pdf' | 'document' | 'medical_report' | 'medical_image' | string;
  mime_type: string;
  size_bytes: number;
  original_filename: string | null;
  created_at: string | null;
};

export type MedicalCategory = 'all' | 'panorama' | 'cbct' | 'dicom' | 'report' | 'other';

export interface PatientMedicalFilesTabProps {
  clinicId: string;
  patientId: string;
  authHeaders: () => Promise<Record<string, string>>;
  onCountChange?: (count: number) => void;
  /**
   * N30 — `imaging` is the imaging-center reading of the SAME data: study
   * summary tiles (🟦 بانوراما / 🟪 CBCT / 🟩 DICOM / 🟨 تقارير), the
   * «مرتبط بطلب» chip and radiology wording. The default (`dental`) renders the
   * clinic UI unchanged.
   */
  variant?: 'dental' | 'imaging';
  /**
   * `imaging_request_id` → the request it documents, so a study card can say
   * WHICH referral produced it. Supplied by the imaging patient-file tab, which
   * already loads those rows for the 🩹 tab (no second fetch).
   */
  requestsById?: Record<string, { label: string; status: string }>;
}

export function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes >= 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  if (bytes >= 1024) return (bytes / 1024).toFixed(0) + ' KB';
  return bytes + ' B';
}

export function detectFileCategory(
  fileType: string,
  filename?: string | null,
  mime?: string | null
): MedicalCategory {
  const name = (filename || '').toLowerCase();
  const m = (mime || '').toLowerCase();

  if (name.includes('pano') || name.includes('بانوراما') || name.includes('panoramic') || name.includes('opg')) {
    return 'panorama';
  }
  if (name.includes('cbct') || name.includes('3d') || name.includes('مخروطي') || name.includes('cone beam')) {
    return 'cbct';
  }
  if (fileType === 'medical_image' || name.endsWith('.dcm') || m.includes('dicom')) {
    return 'dicom';
  }
  if (fileType === 'pdf' || fileType === 'medical_report' || m.includes('pdf') || name.includes('تقرير') || name.includes('report')) {
    return 'report';
  }
  return 'other';
}

export const CATEGORY_METAS: Record<
  MedicalCategory,
  { label: string; bgBadge: string; textBadge: string; border: string; glow: string; iconBg: string }
> = {
  all: {
    label: 'الكل',
    bgBadge: 'bg-slate-800',
    textBadge: 'text-slate-200',
    border: 'border-slate-800',
    glow: 'hover:shadow-slate-500/10',
    iconBg: 'bg-slate-800 text-slate-300',
  },
  panorama: {
    label: 'بانوراما',
    bgBadge: 'bg-blue-500/15',
    textBadge: 'text-blue-300',
    border: 'border-blue-500/30',
    glow: 'hover:shadow-blue-500/20',
    iconBg: 'bg-blue-500/20 text-blue-300',
  },
  cbct: {
    label: 'CBCT مقطعي',
    bgBadge: 'bg-purple-500/15',
    textBadge: 'text-purple-300',
    border: 'border-purple-500/30',
    glow: 'hover:shadow-purple-500/20',
    iconBg: 'bg-purple-500/20 text-purple-300',
  },
  dicom: {
    label: 'DICOM شعاعي',
    bgBadge: 'bg-emerald-500/15',
    textBadge: 'text-emerald-300',
    border: 'border-emerald-500/30',
    glow: 'hover:shadow-emerald-500/20',
    iconBg: 'bg-emerald-500/20 text-emerald-300',
  },
  report: {
    label: 'تقرير طبي',
    bgBadge: 'bg-amber-500/15',
    textBadge: 'text-amber-300',
    border: 'border-amber-500/30',
    glow: 'hover:shadow-amber-500/20',
    iconBg: 'bg-amber-500/20 text-amber-300',
  },
  other: {
    label: 'صور ومستندات',
    bgBadge: 'bg-slate-700/30',
    textBadge: 'text-slate-300',
    border: 'border-slate-700/50',
    glow: 'hover:shadow-slate-500/10',
    iconBg: 'bg-slate-800 text-slate-300',
  },
};

export default function PatientMedicalFilesTab({
  clinicId,
  patientId,
  authHeaders,
  onCountChange,
  variant = 'dental',
  requestsById,
}: PatientMedicalFilesTabProps) {
  /** N30 — imaging-center reading of the same tab (summaries + request chips). */
  const imagingVariant = variant === 'imaging';
  const [files, setFiles] = useState<MedicalFileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<MedicalCategory>('all');
  const [err, setErr] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadStatusText, setUploadStatusText] = useState<string | null>(null);
  const [uploadFileName, setUploadFileName] = useState<string | null>(null);
  const [uploadFileSize, setUploadFileSize] = useState<number | null>(null);
  const uploadXhrRef = useRef<XMLHttpRequest | null>(null);
  /** Monotonic guard so a stale 1.5s reset timer can never blank a newer upload. */
  const uploadSeqRef = useRef(0);

  const [busyActionId, setBusyActionId] = useState<string | null>(null);
  const [fileToDelete, setFileToDelete] = useState<MedicalFileRow | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  /**
   * Kept inside a ref so a caller passing an inline arrow function does not
   * re-create `loadFiles` on every render (which would cause an endless
   * fetch → setState → render loop).
   */
  const onCountChangeRef = useRef<PatientMedicalFilesTabProps['onCountChange']>(onCountChange);
  useEffect(() => {
    onCountChangeRef.current = onCountChange;
  }, [onCountChange]);

  const loadFiles = useCallback(async () => {
    if (!clinicId || !patientId) return;
    setLoading(true);
    setErr(null);
    try {
      const headers = await authHeaders();
      const res = await fetch(
        `/api/clinic/medical-files/list?clinic_id=${encodeURIComponent(clinicId)}&patient_id=${encodeURIComponent(patientId)}`,
        { headers }
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'تعذر تحميل ملفات المريض');
      const data: MedicalFileRow[] = Array.isArray(json?.data) ? json.data : [];
      setFiles(data);
      onCountChangeRef.current?.(data.length);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'فشل في تحميل الملفات');
    } finally {
      setLoading(false);
    }
  }, [clinicId, patientId, authHeaders]);

  useEffect(() => {
    void loadFiles();
  }, [loadFiles]);

  // Abort an in-flight direct upload when the tab unmounts: switching tabs must
  // never keep streaming gigabytes to storage in the background.
  useEffect(
    () => () => {
      if (uploadXhrRef.current) {
        uploadXhrRef.current.abort();
        uploadXhrRef.current = null;
      }
    },
    []
  );

  const cancelUpload = () => {
    uploadSeqRef.current += 1;
    if (uploadXhrRef.current) {
      uploadXhrRef.current.abort();
      uploadXhrRef.current = null;
    }
    setUploadProgress(null);
    setUploadStatusText(null);
    setUploadFileName(null);
    setUploadFileSize(null);
    setInfoMsg('تم إلغاء عملية الرفع.');
  };

  const handleSmartUpload = async (file: File) => {
    if (!file || !clinicId || !patientId) return;

    const seq = (uploadSeqRef.current += 1);

    setErr(null);
    setInfoMsg(null);
    setUploadFileName(file.name);
    setUploadFileSize(file.size);
    setUploadProgress(1);
    setUploadStatusText('جارٍ طلب تصريح رفع مباشر...');

    try {
      const headers = await authHeaders();

      const startRes = await fetch('/api/clinic/medical-files/upload-start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify({
          clinic_id: clinicId,
          patient_id: patientId,
          filename: file.name,
          mime_type: file.type || 'application/octet-stream',
          size_bytes: file.size,
        }),
      });

      const startJson = await startRes.json().catch(() => null);
      if (!startRes.ok || !startJson?.data?.upload_url) {
        throw new Error(startJson?.error || 'تعذر تجهيز جلسة الرفع');
      }

      const { upload_url, storage_path, file_type } = startJson.data;

      setUploadStatusText('جارٍ إرسال الملف إلى التخزين الآمن...');
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        uploadXhrRef.current = xhr;

        xhr.upload.onprogress = (evt) => {
          if (evt.lengthComputable) {
            const percent = Math.round((evt.loaded / evt.total) * 95);
            setUploadProgress(Math.max(1, percent));
          }
        };

        xhr.onload = () => {
          uploadXhrRef.current = null;
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(`فشل رفع الملف إلى التخزين السحابي (كود ${xhr.status})`));
          }
        };

        xhr.onerror = () => {
          uploadXhrRef.current = null;
          reject(new Error('انقطع الاتصال أثناء الرفع'));
        };

        xhr.onabort = () => {
          uploadXhrRef.current = null;
          reject(new Error('CANCELLED'));
        };

        xhr.open('PUT', upload_url, true);
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
        xhr.send(file);
      });

      setUploadProgress(98);
      setUploadStatusText('جارٍ توثيق الملف والتحقق من سلامته...');

      const confirmRes = await fetch('/api/clinic/medical-files/confirm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify({
          clinic_id: clinicId,
          patient_id: patientId,
          storage_path,
          mime_type: file.type || 'application/octet-stream',
          size_bytes: file.size,
          filename: file.name,
          file_type,
        }),
      });

      const confirmJson = await confirmRes.json().catch(() => null);
      if (!confirmRes.ok || !confirmJson?.data) {
        throw new Error(confirmJson?.error || 'فشل توثيق وحفظ الملف');
      }

      setUploadProgress(100);
      setUploadStatusText('اكتمل الرفع بنجاح!');
      setInfoMsg(`تم إرفاق "${file.name}" بنجاح في ملف المريض.`);

      await loadFiles();
    } catch (e: unknown) {
      if (e instanceof Error && e.message === 'CANCELLED') {
        return;
      }
      setErr(e instanceof Error ? e.message : 'حدث خطأ أثناء الرفع');
    } finally {
      setTimeout(() => {
        // A newer upload (or an explicit cancel) owns the UI now — leave it be.
        if (uploadSeqRef.current !== seq) return;
        setUploadProgress(null);
        setUploadStatusText(null);
        setUploadFileName(null);
        setUploadFileSize(null);
      }, 1500);
    }
  };

  const handleDownload = async (file: MedicalFileRow) => {
    if (!clinicId) return;
    setBusyActionId(file.id);
    setErr(null);
    try {
      const headers = await authHeaders();
      const res = await fetch(
        `/api/clinic/medical-files/${encodeURIComponent(file.id)}?clinic_id=${encodeURIComponent(clinicId)}`,
        { headers }
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.data?.signed_url) {
        throw new Error(json?.error || 'تعذر إنشاء رابط تنزيل صالح');
      }
      window.open(json.data.signed_url, '_blank', 'noopener');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'تعذر تحميل الملف');
    } finally {
      setBusyActionId(null);
    }
  };

  const confirmDelete = async () => {
    if (!fileToDelete || !clinicId) return;
    const fileId = fileToDelete.id;
    setBusyActionId(fileId);
    setErr(null);
    try {
      const headers = await authHeaders();
      const res = await fetch(
        `/api/clinic/medical-files/${encodeURIComponent(fileId)}?clinic_id=${encodeURIComponent(clinicId)}`,
        {
          method: 'DELETE',
          headers,
        }
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'فشل حذف الملف');

      setInfoMsg(`تم حذف الملف "${fileToDelete.original_filename || 'الملف'}" بنجاح.`);
      setFiles((prev) => prev.filter((f) => f.id !== fileId));
      onCountChangeRef.current?.(files.length - 1);
      setFileToDelete(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'تعذر إتمام عملية الحذف');
    } finally {
      setBusyActionId(null);
    }
  };

  const filteredFiles = files.filter((f) => {
    if (filter === 'all') return true;
    const cat = detectFileCategory(f.file_type, f.original_filename, f.mime_type);
    return cat === filter;
  });

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-xl backdrop-blur-md">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              <span>{imagingVariant ? '🩻 الدراسات الشعاعية' : '🖼️ ملفات الأشعة والتحاليل الطبية'}</span>
              <span className="rounded-full bg-cyan-500/20 px-2.5 py-0.5 text-xs font-semibold text-cyan-300 border border-cyan-500/30">
                {files.length} {imagingVariant ? 'دراسة' : 'ملف'}
              </span>
            </h3>
            <p className="mt-1 text-xs text-slate-400">
              {imagingVariant
                ? 'دراسات البانوراما وCBCT والـ DICOM وتقارير الأطباء لهذا المريض — رفع مباشر حتى 2 GiB عبر قنوات مشفرة.'
                : 'ارفع صور البانوراما، دراسات CBCT ثلاثية الأبعاد، ملفات الـ DICOM، والتقارير الطبية حتى 2 GiB عبر قنوات مشفرة.'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void loadFiles()}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-700 hover:text-white transition disabled:opacity-50"
              title="تحديث القائمة"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>تحديث</span>
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadProgress !== null}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-cyan-500/20 hover:from-cyan-500 hover:to-blue-500 transition disabled:opacity-50"
            >
              <UploadCloud className="h-4 w-4" />
              <span>إرفاق ملف جديد</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleSmartUpload(f);
                e.target.value = '';
              }}
            />
          </div>
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            const f = e.dataTransfer.files?.[0];
            if (f) void handleSmartUpload(f);
          }}
          onClick={() => {
            if (uploadProgress === null) fileInputRef.current?.click();
          }}
          className={`mt-4 relative cursor-pointer overflow-hidden rounded-xl border-2 border-dashed p-6 text-center transition-all ${
            isDragging
              ? 'border-cyan-400 bg-cyan-500/10 scale-[1.005]'
              : 'border-slate-800 bg-slate-950/40 hover:border-slate-700 hover:bg-slate-950/70'
          }`}
        >
          {uploadProgress !== null ? (
            <div className="space-y-3 py-2" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between text-xs text-slate-300">
                <span className="font-semibold flex items-center gap-2">
                  <UploadCloud className="h-4 w-4 animate-bounce text-cyan-400" />
                  {uploadFileName} ({uploadFileSize ? formatFileSize(uploadFileSize) : ''})
                </span>
                <span className="font-mono font-bold text-cyan-300">{uploadProgress}%</span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-800">
                <motion.div
                  className="h-full bg-gradient-to-r from-cyan-500 to-blue-500"
                  initial={{ width: 0 }}
                  animate={{ width: `${uploadProgress}%` }}
                  transition={{ ease: 'easeOut', duration: 0.2 }}
                />
              </div>
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-slate-400">{uploadStatusText}</span>
                <button
                  type="button"
                  onClick={cancelUpload}
                  className="text-xs font-semibold text-rose-400 hover:text-rose-300 underline"
                >
                  إلغاء الرفع
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-2">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-400">
                <UploadCloud className="h-6 w-6" />
              </div>
              <p className="text-sm font-semibold text-slate-200">
                اسحب وأفلت صور الأشعة أو ملفات DICOM هنا، أو انقر للاختيار من جهازك
              </p>
              <p className="text-xs text-slate-500">
                يدعم: بانوراما، CBCT، DCM، صور JPG/PNG، مستندات وPDF (رفع مباشر حتى 2 GiB)
              </p>
            </div>
          )}
        </div>
      </div>

      {err && (
        <div className="flex items-center justify-between rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 flex-shrink-0 text-red-400" />
            <span>{err}</span>
          </div>
          <button type="button" onClick={() => setErr(null)} className="text-red-400 hover:text-red-200">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {infoMsg && (
        <div className="flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-400" />
            <span>{infoMsg}</span>
          </div>
          <button type="button" onClick={() => setInfoMsg(null)} className="text-emerald-400 hover:text-emerald-200">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* N30 — imaging summary tiles (🟦 بانوراما / 🟪 CBCT / 🟩 DICOM / 🟨 تقارير).
          A radiology desk reads counts before it reads file names, so the four
          clinical categories are surfaced as one-glance tiles that double as
          filters. Dental clinics never see this block. */}
      {imagingVariant && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {(['panorama', 'cbct', 'dicom', 'report'] as MedicalCategory[]).map((cat) => {
            const meta = CATEGORY_METAS[cat];
            const count = files.filter(
              (f) => detectFileCategory(f.file_type, f.original_filename, f.mime_type) === cat
            ).length;
            const active = filter === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setFilter(active ? 'all' : cat)}
                aria-pressed={active}
                className={`rounded-2xl border ${meta.border} ${meta.bgBadge} p-3 text-right transition-all duration-200 hover:-translate-y-0.5 ${meta.glow} ${
                  active ? 'ring-1 ring-cyan-500/40' : ''
                }`}
              >
                <span className={`text-[11px] font-bold ${meta.textBadge}`}>{meta.label}</span>
                <p className={`mt-1 text-2xl font-bold ${meta.textBadge}`}>{count}</p>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
        {(Object.keys(CATEGORY_METAS) as MedicalCategory[]).map((cat) => {
          const meta = CATEGORY_METAS[cat];
          const count =
            cat === 'all'
              ? files.length
              : files.filter((f) => detectFileCategory(f.file_type, f.original_filename, f.mime_type) === cat).length;
          const active = filter === cat;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setFilter(cat)}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-1.5 font-medium transition ${
                active
                  ? 'bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-500/40 shadow-sm'
                  : 'bg-slate-900/60 text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-slate-800'
              }`}
            >
              <span>{meta.label}</span>
              <span className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${active ? 'bg-cyan-500/40 text-cyan-100' : 'bg-slate-800 text-slate-400'}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-44 animate-pulse rounded-2xl border border-slate-800 bg-slate-900/40 p-4" />
          ))}
        </div>
      ) : filteredFiles.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-12 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-800/80 text-slate-400">
            <HardDrive className="h-7 w-7" />
          </div>
          <h4 className="mt-4 text-base font-bold text-slate-200">
            {filter === 'all'
              ? imagingVariant
                ? '🩻 لا توجد دراسات لهذا المريض بعد'
                : 'لا توجد ملفات أشعة بعد'
              : 'لا توجد ملفات في هذا التصنيف'}
          </h4>
          <p className="mt-1 text-xs text-slate-400 max-w-sm mx-auto">
            {imagingVariant
              ? 'ارفع الدراسة (بانوراما / CBCT / DICOM) أو التقرير المرافق عبر زر «إرفاق ملف جديد» أعلاه.'
              : 'يمكنك إرفاق صور بانوراما أو دراسات DICOM أو تقارير طبية عبر زر الإرفاق أعلاه.'}
          </p>
        </div>
      ) : (
        <motion.div
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
          initial="hidden"
          animate="visible"
          variants={{
            hidden: { opacity: 0 },
            visible: {
              opacity: 1,
              transition: { staggerChildren: 0.05 },
            },
          }}
        >
          <AnimatePresence>
            {filteredFiles.map((file) => {
              const cat = detectFileCategory(file.file_type, file.original_filename, file.mime_type);
              const meta = CATEGORY_METAS[cat];
              const isImage = file.file_type === 'image' || file.mime_type.startsWith('image/');
              const isBusy = busyActionId === file.id;
              /** N30 — which referral produced this study (imaging variant only). */
              const linked =
                imagingVariant && file.imaging_request_id ? requestsById?.[file.imaging_request_id] : undefined;

              return (
                <motion.div
                  key={file.id}
                  layout
                  variants={{
                    hidden: { opacity: 0, y: 12 },
                    visible: { opacity: 1, y: 0 },
                  }}
                  whileHover={{ y: -3 }}
                  className={`group relative flex flex-col justify-between overflow-hidden rounded-2xl border ${meta.border} bg-slate-900/80 p-4 shadow-sm backdrop-blur-sm transition-all duration-200 ${meta.glow} hover:border-opacity-80`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${meta.bgBadge} ${meta.textBadge}`}>
                        {meta.label}
                      </span>
                      <span className="font-mono text-[11px] text-slate-400">
                        {formatFileSize(file.size_bytes)}
                      </span>
                    </div>

                    <div className="mt-3 flex items-start gap-3">
                      <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${meta.iconBg}`}>
                        {cat === 'dicom' || cat === 'cbct' ? (
                          <HardDrive className="h-5 w-5" />
                        ) : cat === 'report' ? (
                          <FileSpreadsheet className="h-5 w-5" />
                        ) : isImage ? (
                          <FileText className="h-5 w-5" />
                        ) : (
                          <FileIcon className="h-5 w-5" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-bold text-slate-100" title={file.original_filename ?? 'بدون اسم'}>
                          {file.original_filename ?? 'ملف طبي بدون اسم'}
                        </p>
                        <p className="mt-1 text-[11px] text-slate-400">
                          {file.created_at ? new Date(file.created_at).toLocaleDateString('ar', { day: 'numeric', month: 'short', year: 'numeric' }) : 'تاريخ غير محدد'}
                        </p>
                        {linked && (
                          <span className="mt-1.5 inline-flex max-w-full items-center gap-1 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-semibold text-cyan-200">
                            <span>🩹</span>
                            <span className="truncate">مرتبط بطلب: {linked.label}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-slate-800/80 pt-3">
                    <div className="flex items-center gap-1.5">
                      {isImage && (
                        <SignedImagePreviewButton
                          fileId={file.id}
                          clinicId={clinicId}
                          filename={file.original_filename ?? 'صورة'}
                          authHeaders={authHeaders}
                        />
                      )}

                      <button
                        type="button"
                        onClick={() => void handleDownload(file)}
                        disabled={isBusy}
                        className="flex items-center gap-1 rounded-full border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-slate-600 hover:bg-slate-700 hover:text-white transition disabled:opacity-50"
                        title="تنزيل الملف"
                      >
                        <Download className="h-3 w-3" />
                        <span>تحميل</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => setFileToDelete(file)}
                      disabled={isBusy}
                      className="rounded-full p-1.5 text-slate-500 hover:bg-rose-500/10 hover:text-rose-400 transition disabled:opacity-50"
                      title="حذف الملف"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </motion.div>
      )}

      {fileToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl"
          >
            <div className="flex items-center gap-3 text-rose-400">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/10">
                <Trash2 className="h-5 w-5" />
              </div>
              <h4 className="text-base font-bold text-slate-100">تأكيد حذف الملف</h4>
            </div>

            <p className="mt-3 text-xs text-slate-300 leading-relaxed">
              هل أنت متأكد من رغبتك في حذف{' '}
              <span className="font-bold text-white">"{fileToDelete.original_filename}"</span>؟
              سيتم نقل الملف لسلة المحذوفات ولن يظهر بعد ذلك في ملف المريض.
            </p>

            <div className="mt-6 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setFileToDelete(null)}
                className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 hover:text-white transition"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={() => void confirmDelete()}
                disabled={busyActionId === fileToDelete.id}
                className="flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-500 transition disabled:opacity-50"
              >
                {busyActionId === fileToDelete.id ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                <span>حذف نهائي</span>
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
0