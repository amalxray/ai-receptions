'use client';

import { useEffect, useState } from 'react';

export default function FaviconUpdater() {
  const [faviconUrl, setFaviconUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/public/site-identity', {
          cache: 'no-store',
        });
        if (!res.ok) return;
        const body = await res.json();
        const url = body.data?.content?.faviconUrl;
        if (!cancelled && typeof url === 'string' && url.trim().length > 0) {
          setFaviconUrl(url.trim());
        }
      } catch {
        // ignore — keep static fallback
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!faviconUrl) return;
    const link = document.getElementById('dynamic-favicon') as HTMLLinkElement | null;
    if (link) link.href = faviconUrl;
  }, [faviconUrl]);

  return null;
}
