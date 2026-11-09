'use client';

import { useState } from 'react';
import { Facebook, MessageCircle, Share2, Twitter } from 'lucide-react';

export default function SocialShareBar() {
  const [message, setMessage] = useState('');

  const getPageDetails = () => ({
    url: window.location.href,
    title: document.title,
  });

  const sharePage = async () => {
    setMessage('');
    const { url, title } = getPageDetails();

    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }

      await navigator.clipboard.writeText(url);
      setMessage('تم نسخ رابط الصفحة');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setMessage('تعذّرت مشاركة الرابط. يرجى المحاولة مرة أخرى.');
    }
  };

  const openShareWindow = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const buttonClass =
    'group inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-slate-100 shadow-sm backdrop-blur-md transition duration-200 hover:-translate-y-0.5 hover:border-amber-300/50 hover:bg-white/15 hover:text-amber-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300';

  return (
    <section aria-label="مشاركة صفحة المركز" className="mx-auto w-full max-w-5xl px-4 py-4">
      <div className="rounded-3xl border border-white/15 bg-slate-900/75 p-4 shadow-xl shadow-slate-950/15 backdrop-blur-xl sm:flex sm:flex-wrap sm:items-center sm:justify-between sm:gap-5 sm:px-6">
        <p className="mb-3 text-center text-sm font-medium text-slate-300 sm:mb-0 sm:text-right">
          شارك صفحة المركز مع من يهمك
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button type="button" className={buttonClass} onClick={sharePage}>
            <Share2 aria-hidden="true" className="h-4 w-4 transition-transform group-hover:scale-110" />
            مشاركة
          </button>
          <button
            type="button"
            className={buttonClass}
            onClick={() => {
              const { url } = getPageDetails();
              openShareWindow(`https://wa.me/?text=${encodeURIComponent(url)}`);
            }}
          >
            <MessageCircle aria-hidden="true" className="h-4 w-4" />
            واتساب
          </button>
          <button
            type="button"
            className={buttonClass}
            onClick={() => {
              const { url } = getPageDetails();
              openShareWindow(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`);
            }}
          >
            <Facebook aria-hidden="true" className="h-4 w-4" />
            فيسبوك
          </button>
          <button
            type="button"
            className={buttonClass}
            onClick={() => {
              const { url, title } = getPageDetails();
              openShareWindow(
                `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`
              );
            }}
          >
            <Twitter aria-hidden="true" className="h-4 w-4" />
            X
          </button>
        </div>
        <p aria-live="polite" className="mt-2 min-h-5 w-full text-center text-xs text-amber-200">
          {message}
        </p>
      </div>
    </section>
  );
}
