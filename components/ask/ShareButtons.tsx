'use client';

import { useState } from 'react';

const BASE = 'https://ai-receptions.vercel.app';

/** Share row: native share, WhatsApp, Facebook, X — with clipboard fallback. */
export default function ShareButtons({ url, title, compact = false }: { url: string; title: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  const full = url.startsWith('http') ? url : `${BASE}${url}`;

  const share = async () => {
    if (navigator.share) {
      await navigator.share({ title, url: full }).catch(() => {});
    } else {
      await navigator.clipboard.writeText(full);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const btn = 'rounded-full bg-white/10 px-3 py-1.5 text-xs text-slate-200 hover:bg-white/20 transition';

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={() => void share()} className={compact ? btn : 'rounded-full bg-cyan-500/20 px-4 py-1.5 text-xs font-bold text-cyan-200 hover:bg-cyan-500/30'}>
        {copied ? '✓ نُسخ الرابط' : '📤 مشاركة'}
      </button>
      <a href={`https://wa.me/?text=${encodeURIComponent(title + ' — ' + full)}`} target="_blank" rel="noopener noreferrer" className={btn}>💬 واتساب</a>
      <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(full)}`} target="_blank" rel="noopener noreferrer" className={btn}>📘 فيسبوك</a>
      <a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(full)}`} target="_blank" rel="noopener noreferrer" className={btn}>🐦 X</a>
    </div>
  );
}
