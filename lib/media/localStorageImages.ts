/**
 * Local mirrors for reviewed, non-sensitive public images.
 *
 * The original Supabase objects are intentionally retained. Only exact URLs
 * listed below are redirected to their compressed files under /public.
 */
const LOCAL_STORAGE_IMAGES: Record<string, string> = {
  'clinic-public-media/platform/ask/d0d8ecfb-0426-43c1-9ca8-98f1992ff387.jpg':
    '/images/supabase/clinic-public-media/platform/ask/d0d8ecfb-0426-43c1-9ca8-98f1992ff387.webp',
  'clinic-public-media/platform/ask/d58244ed-dcf5-4322-afb7-695160ce2d05.jpg':
    '/images/supabase/clinic-public-media/platform/ask/d58244ed-dcf5-4322-afb7-695160ce2d05.webp',
  'clinic-public-media/platform/ask/64755e37-3031-427d-9c12-c78aaf7c1a5b.jpg':
    '/images/supabase/clinic-public-media/platform/ask/64755e37-3031-427d-9c12-c78aaf7c1a5b.webp',
  'clinic-public-media/platform/ask/cc54039a-2875-4614-af7b-aafa1ff24804.jpg':
    '/images/supabase/clinic-public-media/platform/ask/cc54039a-2875-4614-af7b-aafa1ff24804.webp',
  'clinic-public-media/platform/ask/c573d366-3d83-4798-b918-df8caeb72863.jpg':
    '/images/supabase/clinic-public-media/platform/ask/c573d366-3d83-4798-b918-df8caeb72863.webp',
  'clinic-public-media/platform/ask/ce4a393b-a763-47b0-ab2b-17b965785bbd.jpg':
    '/images/supabase/clinic-public-media/platform/ask/ce4a393b-a763-47b0-ab2b-17b965785bbd.webp',
  'clinic-public-media/platform/ask/c5bb4464-3075-4147-be5a-b2e24b1142c3.jpg':
    '/images/supabase/clinic-public-media/platform/ask/c5bb4464-3075-4147-be5a-b2e24b1142c3.webp',
  'clinic-public-media/clinic/14f6ad3a-f9bf-4108-a809-7e96ad3e2bf5/public-media/4e48861e-f2d4-4fbc-a42b-723d55065650.png':
    '/images/supabase/clinic-public-media/clinic/14f6ad3a-f9bf-4108-a809-7e96ad3e2bf5/public-media/4e48861e-f2d4-4fbc-a42b-723d55065650.webp',
};

/** Swap a known public Storage URL for its local Vercel public-file mirror. */
export function localStorageImageUrl(value: string | null | undefined): string | null {
  if (!value) return value ?? null;

  let imageUrl: URL;
  try {
    imageUrl = new URL(value);
  } catch {
    return value;
  }

  const configuredOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (configuredOrigin) {
    try {
      if (imageUrl.origin !== new URL(configuredOrigin).origin) return value;
    } catch {
      return value;
    }
  }

  const storagePath = imageUrl.pathname.match(
    /\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+)$/,
  );
  if (!storagePath) return value;

  let objectPath: string;
  try {
    objectPath = decodeURIComponent(storagePath[2]);
  } catch {
    return value;
  }

  const key = `${storagePath[1]}/${objectPath}`;
  return LOCAL_STORAGE_IMAGES[key] ?? value;
}
