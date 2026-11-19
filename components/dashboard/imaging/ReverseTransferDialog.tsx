'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  getMedicalClientUploadId,
  startMedicalTusUpload,
} from '@/lib/services/medicalFileTusUpload';

type PartnerClinic = {
  id: string;
  name: string;
  relationship?: { status: string } | null;
};

type MedicalFileOption = {
  id: string;
  original_filename: string | null;
  mime_type: string;
  medical_category: string | null;
};

type Props = {
  clinicId: string;
  sourcePatientId: string;
  patientName: string;
  patientPhone: string | null;
  authHeaders: () => Promise<Record<string, string>>;
  onClose: () => void;
  onDone?: (message: string) => void;
};

async function responseJson(response: Response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error ?? 'تعذر إكمال التحويل');
  return body;
}

function getUploadMimeType(file: File): string {
  if (file.type) return file.type;
  const extension = file.name.toLowerCase().split('.').pop();
  if (extension === 'dcm') return 'application/dicom';
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  if (extension === 'gif') return 'image/gif';
  return 'application/octet-stream';
}

async function readMagicBytes(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export default function ReverseTransferDialog({
  clinicId,
  sourcePatientId,
  patientName,
  patientPhone,
  authHeaders,
  onClose,
  onDone,
}: Props) {
  const [clinics, setClinics] = useState<PartnerClinic[] | null>(null);
  const [files, setFiles] = useState<MedicalFileOption[]>([]);
  const [filesCursor, setFilesCursor] = useState<{ created_at: string; id: string } | null>(null);
  const [loadingMoreFiles, setLoadingMoreFiles] = useState(false);
  const [targetClinicId, setTargetClinicId] = useState('');
  const [patientNameToSend, setPatientNameToSend] = useState(patientName);
  const [patientPhoneToSend, setPatientPhoneToSend] = useState(patientPhone ?? '');
  const [sourceKind, setSourceKind] = useState<'existing' | 'device'>('existing');
  const [sourceFileId, setSourceFileId] = useState('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const acceptedClinics = useMemo(
    () => (clinics ?? []).filter((clinic) => clinic.relationship?.status === 'accepted'),
    [clinics],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const headers = await authHeaders();
        const [clinicResponse, filesResponse] = await Promise.all([
          fetch(
            `/api/clinic/partner-orgs?clinic_id=${encodeURIComponent(clinicId)}&activity=clinic`,
            { headers },
          ),
          fetch(
            `/api/clinic/medical-files/list?clinic_id=${encodeURIComponent(clinicId)}&patient_id=${encodeURIComponent(sourcePatientId)}&limit=100`,
            { headers },
          ),
        ]);
        const [clinicBody, filesBody] = await Promise.all([
          responseJson(clinicResponse),
          responseJson(filesResponse),
        ]);
        if (cancelled) return;
        setClinics(Array.isArray(clinicBody.data) ? clinicBody.data : []);
        setFiles(
          (Array.isArray(filesBody.data) ? filesBody.data : []).filter(
            (file: MedicalFileOption) =>
              file.mime_type?.startsWith('image/') || file.mime_type === 'application/dicom',
          ),
        );
        setFilesCursor(filesBody.next_cursor ?? null);
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'تعذر تحميل بيانات التحويل');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authHeaders, clinicId, sourcePatientId]);

  const loadMoreFiles = async () => {
    if (!filesCursor || loadingMoreFiles) return;
    setLoadingMoreFiles(true);
    try {
      const headers = await authHeaders();
      const params = new URLSearchParams({
        clinic_id: clinicId,
        patient_id: sourcePatientId,
        limit: '100',
        cursor_created_at: filesCursor.created_at,
        cursor_id: filesCursor.id,
      });
      const body = await responseJson(await fetch(`/api/clinic/medical-files/list?${params.toString()}`, { headers }));
      const page = (Array.isArray(body.data) ? body.data : []).filter(
        (file: MedicalFileOption) => file.mime_type?.startsWith('image/') || file.mime_type === 'application/dicom',
      );
      setFiles((previous) => [...previous, ...page]);
      setFilesCursor(body.next_cursor ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'تعذر تحميل ملفات إضافية');
    } finally {
      setLoadingMoreFiles(false);
    }
  };

  const submit = async () => {
    if (!targetClinicId) {
      setError('اختر العيادة المستهدفة');
      return;
    }
    if (patientNameToSend.trim().length < 2 || patientPhoneToSend.trim().length < 5) {
      setError('أدخل اسم المريض ورقم هاتف صحيحين');
      return;
    }
    if (sourceKind === 'existing' && !sourceFileId) {
      setError('اختر صورة من ملفات المريض');
      return;
    }
    if (sourceKind === 'device' && !uploadedFile) {
      setError('اختر صورة من الجهاز');
      return;
    }

    setBusy(true);
    setError(null);
    setUploadProgress(null);
    try {
      const headers = await authHeaders();
      let fileId = sourceFileId;
      if (sourceKind === 'device' && uploadedFile) {
        const mimeType = getUploadMimeType(uploadedFile);
        const clientUploadId = await getMedicalClientUploadId(
          clinicId,
          sourcePatientId,
          uploadedFile,
          `reverse-referral:${targetClinicId}`,
        );
        const magic = await readMagicBytes(uploadedFile);
        const startResponse = await fetch(
          `/api/clinic/reverse-referrals/upload-start?clinic_id=${encodeURIComponent(clinicId)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...headers },
            body: JSON.stringify({
              target_clinic_id: targetClinicId,
              patient_id: sourcePatientId,
              client_upload_id: clientUploadId,
              filename: uploadedFile.name,
              mime_type: mimeType,
              size_bytes: uploadedFile.size,
              magic,
            }),
          },
        );
        const startBody = await responseJson(startResponse);
        if (startBody.data?.already_confirmed && typeof startBody.data.confirmed_file_id === 'string') {
          fileId = startBody.data.confirmed_file_id;
        } else {
          if (typeof startBody.data?.storage_path !== 'string') throw new Error('تعذر تجهيز مسار رفع الملف');
          if (startBody.data?.upload_required !== false) {
            setUploadProgress(1);
            const tusUpload = startMedicalTusUpload({
              file: uploadedFile,
              endpoint: String(startBody.data?.resumable_endpoint ?? ''),
              storagePath: String(startBody.data?.storage_path ?? ''),
              clientUploadId: String(startBody.data?.client_upload_id ?? clientUploadId),
              onProgress: setUploadProgress,
            });
            await tusUpload.promise;
          }

          setUploadProgress(98);
          const confirmResponse = await fetch(
            `/api/clinic/reverse-referrals/upload-confirm?clinic_id=${encodeURIComponent(clinicId)}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', ...headers },
              body: JSON.stringify({
                target_clinic_id: targetClinicId,
                patient_id: sourcePatientId,
                storage_path: startBody.data?.storage_path,
                filename: uploadedFile.name,
                mime_type: mimeType,
                size_bytes: uploadedFile.size,
                magic,
              }),
            },
          );
          const confirmBody = await responseJson(confirmResponse);
          if (typeof confirmBody.data?.id !== 'string') throw new Error('تعذر تأكيد حفظ الملف');
          fileId = confirmBody.data.id;
          setUploadProgress(100);
        }
      }

      const form = new FormData();
      form.set('target_clinic_id', targetClinicId);
      form.set('source_patient_id', sourcePatientId);
      form.set('from_patient_name', patientNameToSend.trim());
      form.set('from_patient_phone', patientPhoneToSend.trim());
      form.set('notes', notes.trim());
      form.set('file_id', fileId);

      const response = await fetch(
        `/api/clinic/reverse-referrals?clinic_id=${encodeURIComponent(clinicId)}`,
        { method: 'POST', headers, body: form },
      );
      await responseJson(response);
      onDone?.('تم إرسال التحويل إلى العيادة بانتظار القبول');
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'تعذر إرسال التحويل العكسي');
    } finally {
      setBusy(false);
      setUploadProgress(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="إعادة تحويل المريض إلى عيادة"
    >
      <div className="my-6 w-full max-w-xl rounded-2xl border border-slate-800 bg-slate-950 p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-white">إعادة تحويل إلى عيادة</h2>
            <p className="mt-1 text-sm text-slate-400">
              أرسل بيانات المريض والصورة إلى العيادة؛ تتم مطابقة ملفه عند قبول التحويل.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-800 hover:text-white"
            aria-label="إغلاق"
            disabled={busy}
          >
            ✕
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm text-slate-300">العيادة المستهدفة</span>
            <select
              value={targetClinicId}
              onChange={(event) => setTargetClinicId(event.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white"
              disabled={clinics === null || busy}
            >
              <option value="">{clinics === null ? 'جارٍ التحميل…' : 'اختر العيادة المرتبطة'}</option>
              {acceptedClinics.map((clinic) => (
                <option key={clinic.id} value={clinic.id}>{clinic.name}</option>
              ))}
            </select>
            {clinics !== null && acceptedClinics.length === 0 && (
              <span className="mt-1 block text-xs text-amber-400">
                لا توجد علاقة مقبولة مع عيادة؛ أنشئ العلاقة أولاً من صفحة الشركاء.
              </span>
            )}
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-slate-300">اسم المريض (إلزامي)</span>
            <input
              value={patientNameToSend}
              onChange={(event) => setPatientNameToSend(event.target.value)}
              maxLength={200}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white"
              disabled={busy}
              required
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-slate-300">رقم الهاتف (إلزامي)</span>
            <input
              value={patientPhoneToSend}
              onChange={(event) => setPatientPhoneToSend(event.target.value)}
              maxLength={40}
              inputMode="tel"
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white"
              disabled={busy}
              required
            />
          </label>

          <fieldset className="space-y-3 rounded-xl border border-slate-800 p-3">
            <legend className="px-1 text-sm text-slate-300">مصدر الصورة</legend>
            <div className="flex flex-wrap gap-4 text-sm text-slate-200">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={sourceKind === 'existing'}
                  onChange={() => setSourceKind('existing')}
                  disabled={busy}
                />
                اختيار من ملفات المريض
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={sourceKind === 'device'}
                  onChange={() => setSourceKind('device')}
                  disabled={busy}
                />
                رفع صورة من الجهاز
              </label>
            </div>
            {sourceKind === 'existing' ? (
              <>
                <select
                  value={sourceFileId}
                  onChange={(event) => setSourceFileId(event.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white"
                  disabled={busy}
                >
                  <option value="">{files.length ? 'اختر صورة أو دراسة' : 'لا توجد صور متاحة لهذا المريض'}</option>
                  {files.map((file) => (
                    <option key={file.id} value={file.id}>
                      {file.original_filename ?? file.medical_category ?? 'صورة طبية'}
                    </option>
                  ))}
                </select>
                {filesCursor && (
                  <button
                    type="button"
                    onClick={() => void loadMoreFiles()}
                    disabled={busy || loadingMoreFiles}
                    className="mt-2 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 disabled:opacity-50"
                  >
                    {loadingMoreFiles ? 'جارٍ التحميل...' : 'تحميل المزيد'}
                  </button>
                )}
              </>
            ) : (
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,application/dicom,.dcm"
                onChange={(event) => setUploadedFile(event.target.files?.[0] ?? null)}
                className="block w-full text-sm text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-800 file:px-3 file:py-2 file:text-white"
                disabled={busy}
              />
            )}
          </fieldset>

          <label className="block">
            <span className="mb-1 block text-sm text-slate-300">ملاحظات (اختياري)</span>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={2}
              maxLength={2000}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white"
              disabled={busy}
            />
          </label>

          {uploadProgress !== null && (
            <div className="space-y-1" role="status" aria-live="polite">
              <p className="text-xs text-slate-400">رفع الصورة الطبية {uploadProgress}%</p>
              <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                <div className="h-full rounded-full bg-cyan-400 transition-all" style={{ width: `${uploadProgress}%` }} />
              </div>
            </div>
          )}
          {error && <p className="text-sm text-red-400" role="alert">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50"
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={busy || !targetClinicId}
              className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-500 disabled:opacity-50"
            >
              {busy ? 'جارٍ الإرسال…' : 'إرسال التحويل'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
