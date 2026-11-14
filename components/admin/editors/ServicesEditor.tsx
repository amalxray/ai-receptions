'use client';

import { useRef, useState } from 'react';
import ServicesGrid from '@/components/landing/ServicesGrid';
import { normalizeServicesContent, type ServicesContent } from '@/lib/landing/services-content';
import SectionEditorModal from './SectionEditorModal';

type Props = {
  initialContent: Record<string, unknown> | null;
  onClose: () => void;
  onSaved: (content: ServicesContent) => void;
};

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export default function ServicesEditor({ initialContent, onClose, onSaved }: Props) {
  const [draft, setDraft] = useState<ServicesContent>(() => normalizeServicesContent(initialContent));
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<{ index: number; message: string } | null>(null);
  const imageInputRefs = useRef<Array<HTMLInputElement | null>>([]);

  const updateImage = (index: number, image_url: string) => {
    setDraft((current) => ({
      ...current,
      items: current.items.map((service, itemIndex) => itemIndex === index ? { ...service, image_url } : service),
    }));
  };

  const uploadImage = async (index: number, file: File) => {
    if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
      setUploadError({ index, message: 'حجم الصورة يجب ألا يتجاوز 5 ميغابايت.' });
      return;
    }
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setUploadError({ index, message: 'صيغة الصورة غير مدعومة. استخدم JPG أو PNG أو WebP أو GIF.' });
      return;
    }

    setUploadingIndex(index);
    setUploadError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const response = await fetch('/api/admin/upload', { method: 'POST', body: form });
      const body = await response.json().catch(() => null) as { data?: { url?: string }; error?: string } | null;
      if (!response.ok || !body?.data?.url) {
        throw new Error(body?.error ?? 'تعذر رفع الصورة. حاول مرة أخرى.');
      }
      updateImage(index, body.data.url);
    } catch (error) {
      setUploadError({ index, message: error instanceof Error ? error.message : 'تعذر رفع الصورة.' });
    } finally {
      setUploadingIndex(null);
    }
  };

  const save = async () => {
    if (uploadingIndex !== null) throw new Error('انتظر حتى يكتمل رفع الصورة قبل الحفظ.');
    const response = await fetch('/api/admin/landing-page/services', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: draft }),
    });
    const body = await response.json().catch(() => null) as {
      error?: string;
      issues?: Array<{ path: string; message: string }>;
    } | null;
    if (!response.ok) {
      throw new Error(body?.issues?.map((issue) => `${issue.path}: ${issue.message}`).join('، ') || body?.error || 'تعذر حفظ صور الخدمات');
    }
    onSaved(draft);
  };

  return (
    <SectionEditorModal
      title="تحرير صور الخدمات"
      description="ارفع صورة مستقلة لكل خدمة. تُحفظ التغييرات في محتوى الصفحة الرئيسية."
      onClose={onClose}
      onSave={save}
      preview={<ServicesGrid initialServices={draft.items} />}
    >
      <div className="space-y-4">
        {draft.items.map((service, index) => (
          <fieldset key={`${service.title}-${index}`} className="space-y-3 rounded-2xl border border-slate-200 p-4">
            <legend className="px-2 text-sm font-semibold text-slate-800">{service.title}</legend>
            <div className="flex flex-wrap items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div>
                <input
                  ref={(element) => { imageInputRefs.current[index] = element; }}
                  type="file"
                  accept={ACCEPTED_IMAGE_TYPES.join(',')}
                  className="sr-only"
                  aria-label={`رفع صورة لخدمة ${service.title}`}
                  disabled={uploadingIndex !== null}
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    event.currentTarget.value = '';
                    if (file) void uploadImage(index, file);
                  }}
                />
                <button
                  type="button"
                  onClick={() => imageInputRefs.current[index]?.click()}
                  disabled={uploadingIndex !== null}
                  className="rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:cursor-wait disabled:opacity-60"
                >
                  {uploadingIndex === index ? 'جارٍ رفع الصورة…' : service.image_url ? 'استبدال الصورة' : 'رفع صورة'}
                </button>
                <p className="mt-1.5 text-xs text-slate-500">JPG أو PNG أو WebP أو GIF · حتى 5 ميغابايت</p>
                {uploadError?.index === index && <p role="alert" className="mt-2 text-xs text-red-600">{uploadError.message}</p>}
              </div>
              {service.image_url ? (
                <div className="relative">
                  <img src={service.image_url} alt={`معاينة صورة ${service.title}`} className="h-24 w-36 rounded-lg border border-slate-200 object-cover" />
                  <button
                    type="button"
                    onClick={() => updateImage(index, '')}
                    disabled={uploadingIndex !== null}
                    className="mt-1 text-xs font-semibold text-red-600 hover:text-red-700 disabled:opacity-50"
                  >
                    إزالة الصورة
                  </button>
                </div>
              ) : (
                <div className="grid h-24 w-36 place-items-center rounded-lg border border-dashed border-slate-300 text-xs text-slate-400">لا توجد صورة</div>
              )}
            </div>
          </fieldset>
        ))}
      </div>
    </SectionEditorModal>
  );
}
