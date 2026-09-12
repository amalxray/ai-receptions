import { NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/services/platformAdmin';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { randomUUID } from 'crypto';

const MIME_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};
const MAX_BYTES = 10 * 1024 * 1024;

/** POST /api/admin/upload — multipart file → public bucket, returns url. */
export async function POST(req: Request) {
  const gate = await requirePlatformAdmin(req);
  if (!gate.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: gate.status });
  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'file required' }, { status: 400 });
    if (file.size <= 0 || file.size > MAX_BYTES) return NextResponse.json({ error: `size must be 1B..${MAX_BYTES}` }, { status: 400 });
    const ext = MIME_EXT[file.type ?? ''] ?? (file.name.includes('.') ? `.${file.name.split('.').pop()?.toLowerCase()}` : null);
    if (!ext || !['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)) {
      return NextResponse.json({ error: 'Unsupported image type' }, { status: 400 });
    }
    const path = `platform/ask/${randomUUID()}${ext}`;
    const { error: upErr } = await supabaseAdmin.storage
      .from('clinic-public-media')
      .upload(path, file, { contentType: file.type ?? 'application/octet-stream', upsert: false });
    if (upErr) return NextResponse.json({ error: `upload failed: ${upErr.message}` }, { status: 400 });
    const publicUrl = `https://ixlsrurenboseoelwixs.supabase.co/storage/v1/object/public/clinic-public-media/${path}`;
    return NextResponse.json({ data: { url: publicUrl, path } }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 });
  }
}