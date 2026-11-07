'use client';

import { useEffect, useMemo, useState } from 'react';

type PartnerClinic = {
  id: string;
  name: string;
  relationship?: { status: string } | null;
};

type PatientOption = { id: string; name: string; phone: string | null };

type MedicalFileOption = {
  id: string;
  original_filename: string | null;
  mime_type: string;
  medical_category: string | null;
  file_type: string;
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
  const [targetClinicId, setTargetClinicId] = useState('');
  const [search, setSearch] = useState('');
  const [searched, setSearched] = useState(false);
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<PatientOption | null>(null);
  const [newPatientName, setNewPatientName] = useState(patientName);
  const [newPatientPhone, setNewPatientPhone] = useState(patientPhone ?? '');
  const [sourceKind, setSourceKind] = useState<'existing' | 'device'>('existing');
  const [sourceFileId, setSourceFileId] = useState('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
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
            `/api/clinic/medical-files/list?clinic_id=${encodeURIComponent(clinicId)}&patient_id=${encodeURIComponent(sourcePatientId)}`,
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
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'تعذر تحميل بيانات التحويل');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authHeaders, clinicId, sourcePatientId]);

  const searchPatients = async () => {
    if (!targetClinicId || search.trim().length < 2) {
      setError('اختر العيادة وأدخل حرفين على الأقل للبحث');
      return;
    }
    setError(null);
    setSelectedPatient(null);
    setSearched(false);
    try {
      const headers = await authHeaders();
      const response = await fetch(
        `/api/clinic/reverse-referrals/patients?clinic_id=${encodeURIComponent(clinicId)}&target_clinic_id=${encodeURIComponent(targetClinicId)}&q=${encodeURIComponent(search.trim())}`,
        { headers },
      );
      const body = await responseJson(response);
      setPatients(Array.isArray(body.data) ? body.data : []);
      setSearched(true);
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : 'تعذر البحث عن المريض');
    }
  };

  const createPatient = async () => {
    if (!targetClinicId || newPatientName.trim().length < 2) {
      setError('أدخل اسم المريض بشكل صحيح');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const headers = await authHeaders();
      const response = await fetch(
        `/api/clinic/reverse-referrals/patients?clinic_id=${encodeURIComponent(clinicId)}`,
        {
          method: 'POST',
          headers: { ...headers, 'content-type': 'application/json' },
          body: JSON.stringify({
            clinic_id: targetClinicId,
            source_patient_id: sourcePatientId,
            name: newPatientName.trim(),
            phone: newPatientPhone.trim(),
          }),
        },
      );
      const body = await responseJson(response);
      setSelectedPatient(body.data as PatientOption);
      setPatients([]);
      setSearched(false);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'تعذر إنشاء ملف المريض');
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!targetClinicId || !selectedPatient) {
      setError('اختر المريض في العيادة المستهدفة أولاً');
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
    try {
      const headers = await authHeaders();
      const form = new FormData();
      form.set('target_clinic_id', targetClinicId);
      form.set('source_patient_id', sourcePatientId);
      form.set('patient_id_to', selectedPatient.id);
      form.set('notes', notes.trim());
      if (sourceKind === 'existing') form.set('file_id', sourceFileId);
      if (sourceKind === 'device' && uploadedFile) form.set('file', uploadedFile);

      const response = await fetch(
        `/api/clinic/reverse-referrals?clinic_id=${encodeURIComponent(clinicId)}`,
        { method: 'POST', headers, body: form },
      );
      await responseJson(response);
      onDone?.('تم إرسال التحويل العكسي وإرفاق الصورة بملف المريض');
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'تعذر إرسال التحويل العكسي');
    } finally {
      setBusy(false);
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
            <p className="mt-1 text-sm text-slate-400">المريض في مركز التصوير: {patientName}</p>
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
              onChange={(event) => {
                setTargetClinicId(event.target.value);
                setPatients([]);
                setSearched(false);
                setSelectedPatient(null);
              }}
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

          <div className="space-y-2">
            <label className="block">
              <span className="mb-1 block text-sm text-slate-300">ابحث عن المريض بالاسم أو الهاتف</span>
              <input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setSearched(false);
                  setPatients([]);
                  setSelectedPatient(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void searchPatients();
                  }
                }}
                maxLength={100}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white"
                disabled={!targetClinicId || busy}
              />
            </label>
            <button
              type="button"
              onClick={() => void searchPatients()}
              disabled={!targetClinicId || busy}
              className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-50"
            >
              بحث عن المريض
            </button>
            {patients.length > 0 && (
              <div className="space-y-2 rounded-xl border border-slate-800 p-3">
                {patients.map((patient) => (
                  <button
                    key={patient.id}
                    type="button"
                    onClick={() => setSelectedPatient(patient)}
                    className={`block w-full rounded-lg border p-3 text-right text-sm ${
                      selectedPatient?.id === patient.id
                        ? 'border-cyan-500 bg-cyan-500/10 text-white'
                        : 'border-slate-800 text-slate-300 hover:bg-slate-900'
                    }`}
                  >
                    <span className="font-semibold">{patient.name}</span>
                    {patient.phone ? <span className="mr-2 text-slate-400">{patient.phone}</span> : null}
                  </button>
                ))}
              </div>
            )}
            {searched && patients.length === 0 && (
              <div className="space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
                <p className="text-sm text-amber-200">لم يُعثر على مريض مطابق في العيادة المستهدفة.</p>
                <label className="block">
                  <span className="mb-1 block text-xs text-slate-300">اسم المريض الجديد</span>
                  <input
                    value={newPatientName}
                    onChange={(event) => setNewPatientName(event.target.value)}
                    maxLength={200}
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
                    disabled={busy}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-slate-300">رقم الهاتف (اختياري)</span>
                  <input
                    value={newPatientPhone}
                    onChange={(event) => setNewPatientPhone(event.target.value)}
                    maxLength={40}
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
                    disabled={busy}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void createPatient()}
                  disabled={busy}
                  className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100 hover:bg-amber-500/20 disabled:opacity-50"
                >
                  إنشاء مريض جديد بهذا الاسم
                </button>
              </div>
            )}
            {selectedPatient && (
              <p className="text-sm text-emerald-300">المريض المختار: {selectedPatient.name}</p>
            )}
          </div>

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
              disabled={busy || !selectedPatient || !targetClinicId}
              className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-500 disabled:opacity-50"
            >
              {busy ? 'جارٍ الإرسال…' : 'إرسال التحويل وإرفاق الصورة'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
