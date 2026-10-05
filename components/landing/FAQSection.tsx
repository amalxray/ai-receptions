'use client';

import { useEffect, useState } from 'react';
import { useLandingCopy } from '@/components/landing/LandingContent';

type FaqItem = { id?: string; question: string; answer: string };
type FaqCopyItem = { q: string; a: string };

export default function FAQSection({ previewContent }: { previewContent?: { title: string; items: FaqCopyItem[] } }) {
  const copy = useLandingCopy();
  const [items, setItems] = useState<FaqItem[]>([]);
  const hasCmsOverride = Array.isArray(copy.__cmsOverrides) && copy.__cmsOverrides.includes('faq');

  useEffect(() => {
    if (previewContent || hasCmsOverride) return;
    const controller = new AbortController();
    fetch('/api/public/faq', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('FAQ endpoint unavailable');
        const payload = (await response.json()) as { data?: FaqItem[] };
        if (Array.isArray(payload.data) && payload.data.length > 0) setItems(payload.data);
      })
      .catch(() => {
        // Keep the shipped copy as the resilient fallback if the public FAQ API is unavailable.
      });
    return () => controller.abort();
  }, [hasCmsOverride, previewContent]);

  const activeCopy = previewContent ?? copy.faq;
  const faqItems = previewContent || hasCmsOverride
    ? activeCopy.items.map((item: FaqCopyItem) => ({ question: item.q, answer: item.a }))
    : items.length > 0
      ? items
      : activeCopy.items.map((item: FaqCopyItem) => ({ question: item.q, answer: item.a }));

  return (
    <section id="faq" className="bg-landing-bg-white py-20 lg:py-28">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <h2 className="text-center font-heading text-3xl font-extrabold text-landing-text sm:text-4xl">
          {activeCopy.title}
        </h2>
        <div className="mt-10 space-y-3">
          {faqItems.map((item, index) => (
            <details key={item.id ?? `${item.question}-${index}`} className="group overflow-hidden rounded-2xl border border-landing-indigo/10 bg-white shadow-sm">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-4 text-right">
                <span className="font-heading text-base font-bold text-landing-text">{item.question}</span>
                <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-landing-indigo/20 text-landing-indigo transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="px-6 pb-5 text-sm leading-7 text-landing-text/75">{item.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
