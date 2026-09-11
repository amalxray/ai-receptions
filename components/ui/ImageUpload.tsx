'use client';

import { useRef, useState } from 'react';
import { useClinicContext } from '@/lib/useClinicContext';

interface Props {
  value: string | null;
  onChange: (url: string) => void;
  label: string;
  aspect?: 'square' | 'wide';
  /** Optional hint stored as media title for traceability. */
  title?: string;
}

/**
 * IMAGE UPLOAD — picks a local file and uploads it through the guarded
 * /api/clinic/public-media endpoint (tenant-scoped storage path under the
 * clinic-public-media bucket), then reports the returned public_url.
 * Replaces raw "https://…" URL text inputs so owners never paste links.
 */
export default function ImageUpload({ value, onChange, label, aspect = 'square', title }: Props) {
  const { clinicId, authHeaders } = useClinicContext();
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(value ?? null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleUpload(file: File) {
    if (!clinicId) {
      setError('لم يتم تحديد العيادة بعد');
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const headers = await authHeaders();
      const formData = new FormData();
      formData.append('file', file);
      if (title) formData.append('title', title);
      const res = await fetch(`/api/clinic/public-media?clinic_id=${encodeURIComponent(clinicId)}`, {
        method: 'POST',
        headers,
        body: formData,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'فشل رفع الصورة');
      const url = String(json.data?.public_url ?? '');
      if (!url) throw new Error('لم يُعد الرفع رابط الصورة');
      setPreview(url);
      onChange(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل رفع الصورة');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div>
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      <div
        className={`overflow-hidden rounded-xl border border-dashed border-slate-300 bg-slate-50 ${
          aspect === 'square' ? 'h-32 w-32' : 'h-40 w-full'
        }`}
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt={label} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-slate-400">لا توجد صورة</div>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleUpload(f);
        }}
        className="mt-2 block w-full text-xs text-slate-600 file:mr-2 file:rounded-full file:border-0 file:bg-slate-800 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:file:bg-slate-700"
      />
      {uploading && <p className="mt-1 text-xs text-cyan-600">جارٍ الرفع...</p>}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}
