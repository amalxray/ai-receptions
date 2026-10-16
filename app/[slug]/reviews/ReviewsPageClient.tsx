'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import ReviewPromptModal from '@/components/public/ReviewPromptModal';
import { toast } from '@/components/ui/Toast';

/**
 * Phase 3b — client island on /{slug}/reviews + main public page.
 * "قيّمنا" button (pulsing gradient) + "انسخ رابط التقييم" + shared modal (source='public').
 */
export default function ReviewsPageClient({ clinicSlug }: { clinicSlug: string }) {
  const [open, setOpen] = useState(false);

  async function copyReviewsLink() {
    try {
      await navigator.clipboard.writeText(`https://${clinicSlug}.dentairec.com/reviews`);
      toast.success('تم نسخ رابط التقييم');
    } catch {
      toast.error('تعذر نسخ الرابط');
    }
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <motion.button
        type="button"
        onClick={() => setOpen(true)}
        animate={{ scale: [1, 1.03, 1] }}
        transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.98 }}
        className="rounded-2xl bg-gradient-to-l from-cyan-500 to-emerald-500 px-6 py-3 text-lg font-bold text-slate-950 transition-all hover:shadow-[0_0_30px_rgba(34,211,238,0.6)]"
      >
        ⭐ قيّمنا
      </motion.button>
      <button
        type="button"
        onClick={() => void copyReviewsLink()}
        className="rounded-2xl border border-slate-700 bg-slate-950 px-6 py-3 text-sm font-semibold text-slate-200 transition-all hover:border-cyan-500/50 hover:text-white"
      >
        🔗 انسخ رابط التقييم
      </button>
      <ReviewPromptModal open={open} clinicSlug={clinicSlug} source="public" onClose={() => setOpen(false)} />
    </div>
  );
}

