'use client';

import SiteIdentityEditor from '@/components/admin/editors/SiteIdentityEditor';
import { useEffect, useState } from 'react';

export default function SiteIdentityPage() {
  const [content, setContent] = useState<Record<string, unknown> | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/landing-page/site_identity');
        if (!res.ok) return;
        const body = await res.json();
        if (!cancelled) setContent(body.data?.content ?? null);
      } catch {
        // ignore
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="rounded-[2rem] border border-slate-800 bg-slate-900/90 p-6">
      <h2 className="text-lg font-semibold text-white">🖼️ هوية المنصة</h2>
      <p className="mt-1 text-sm text-slate-400">
        تخصيص أيقونة المتصفح (Favicon) التي تظهر في تبويب المتصفح وعلى شاشة iOS الرئيسية.
      </p>
      {content !== null && (
        <SiteIdentityEditor
          initialContent={content}
          onClose={() => {}}
          onSaved={(c) => {
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
          }}
        />
      )}
      {saved && (
        <p className="mt-3 text-sm text-green-500">تم حفظ هوية المنصة بنجاح.</p>
      )}
    </div>
  );
}
