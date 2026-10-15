'use client';

import { useState } from 'react';
import ReviewPromptModal from '@/components/public/ReviewPromptModal';

/**
 * Phase 3b — client island on /{slug}/reviews.
 * "اكتب تقييم" button + shared modal with source='public'.
 */
export default function ReviewsPageClient({ clinicSlug }: { clinicSlug: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full bg-amber-400 px-6 py-2.5 text-sm font-bold text-slate-900 hover:bg-amber-300"
      >
        اكتب تقييم
      </button>
      <ReviewPromptModal open={open} clinicSlug={clinicSlug} source="public" onClose={() => setOpen(false)} />
    </>
  );
}
