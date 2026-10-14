'use client';

import { useEffect, useRef, useState } from 'react';
import { useClinicContext } from '@/lib/useClinicContext';

interface Props {
  value: string | null;
  onChange: (url: string) => void | Promise<void>;
  label: string;
  aspect?: 'square' | 'wide';
  /** Optional hint stored as media title for traceability. */
  title?: string;
  /** Optional tenant-scoped upload API; defaults to the public media gallery. */
  uploadEndpoint?: string;
  /**
   * Convert the picked image to a square PNG (512×512, center-cropped) in the
   * browser before upload. Used by the LOGO uploader so the PWA apple-touch
   * icon (which requires PNG) uses the clinic logo. Cover/other images leave
   * this off (they keep the original format). Falls back to the original file
   * if canvas conversion is unavailable.
   */
  convertToSquarePng?: boolean;
}

/**
 * Center-crop an image to a square and re-encode it as PNG at `size`×`size`
 * using a canvas. Returns a new PNG File, or null if the browser cannot do it
 * (caller then uploads the original file unchanged).
 */
async function toSquarePng(file: File, size = 512): Promise<File | null> {
  try {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('image decode failed'));
      image.src = dataUrl;
    });
    const side = Math.min(img.width, img.height) || size;
    const sx = (img.width - side) / 2;
    const sy = (img.height - side) / 2;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) return null;
    const base = (file.name || 'logo').replace(/\.[^.]+$/, '');
    return new File([blob], `${base}.png`, { type: 'image/png' });
  } catch {
    return null;
  }
}

/**
 * IMAGE UPLOAD — picks a local file and uploads it through the guarded
 * guarded tenant-scoped upload API, then reports its persisted public URL.
 * Replaces raw "https://…" URL text inputs so owners never paste links.
 */
export default function ImageUpload({ value, onChange, label, aspect = 'square', title, uploadEndpoint = '/api/clinic/public-media', convertToSquarePng = false }: Props) {
  const { clinicId, authHeaders } = useClinicContext();
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(value ?? null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setPreview(value ?? null);
  }, [value]);

  async function handleUpload(file: File) {
    if (!clinicId) {
      setError('لم يتم تحديد العيادة بعد');
      return;
    }
    setUploading(true);
    setError(null);
    try {
      // Logo uploads are converted to a square PNG so the PWA apple-touch icon
      // (PNG-only on iOS) uses the clinic logo. Any failure falls back to the
      // original file so the upload never blocks.
      let fileToUpload = file;
      if (convertToSquarePng) {
        const png = await toSquarePng(file, 512);
        if (png) fileToUpload = png;
      }
      const headers = await authHeaders();
      const formData = new FormData();
      formData.append('file', fileToUpload);
      if (title) formData.append('title', title);
      const res = await fetch(`${uploadEndpoint}?clinic_id=${encodeURIComponent(clinicId)}`, {
        method: 'POST',
        headers,
        body: formData,
      });
      const json = (await res.json()) as {
        data?: { public_url?: string; cover_url?: string; item?: { public_url?: string } };
        error?: string;
      };
      if (!res.ok) throw new Error(json.error || 'فشل رفع الصورة');
      const url = json.data?.item?.public_url ?? json.data?.cover_url ?? json.data?.public_url ?? '';
      if (!url) throw new Error('لم يُعد الرفع رابط الصورة');
      console.log('[ImageUpload] upload succeeded; public URL received', {
        label,
        responseStatus: res.status,
      });
      await onChange(url);
      setPreview(url);
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
        accept="image/jpeg,image/png,image/webp,image/gif"
        disabled={uploading}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) {
            console.log('[ImageUpload] file selected', {
              label,
              name: f.name,
              type: f.type,
              sizeBytes: f.size,
            });
            void handleUpload(f);
          }
        }}
        className="mt-2 block w-full text-xs text-slate-600 file:mr-2 file:rounded-full file:border-0 file:bg-slate-800 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:file:bg-slate-700"
      />
      <p className="mt-1 text-xs text-slate-400">JPG أو PNG أو WebP أو GIF — بحد أقصى 25MB</p>
      {uploading && <p className="mt-1 text-xs text-cyan-600">جارٍ الرفع...</p>}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}
