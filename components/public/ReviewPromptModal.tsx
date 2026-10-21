'use client';

import React, { useEffect, useState } from 'react';

type ReviewPromptModalProps = {
  /** Show/hide the modal. Parent owns visibility. */
  open: boolean;
  /** Clinic slug for POST /api/public/reviews. If missing, renders nothing (fail-silent). */
  clinicSlug: string | null | undefined;
  /** Review source recorded server-side. */
  source: 'form' | 'chat' | 'public' | 'booking';
  /** Pre-fill the author name (e.g. from the booking form). */
  patientName?: string;
  /** Close the modal (parent also flips its visibility state). */
  onClose: () => void;
};

/**
 * Phase 3a — shared post-booking review prompt (RTL).
 * Used by the booking form and the chat booking confirmation flow.
 * Posts to the existing POST /api/public/reviews endpoint — no new API.
 * Parent controls `open`; this component owns form state + submission only.
 */
export default function ReviewPromptModal({ open, clinicSlug, source, patientName = '', onClose }: ReviewPromptModalProps) {
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [authorName, setAuthorName] = useState(patientName);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setRating(0);
    setHovered(0);
    setAuthorName(patientName);
    setComment('');
    setSubmitting(false);
    setDone(false);
    setError(null);
  }, [open, patientName]);

  // Fail-silent: no slug → no modal (Chat often only has a uuid clinicId).
  if (!open || !clinicSlug) return null;

  const highlighted = hovered > 0 ? hovered : rating;

  async function handleSubmit() {
    if (rating === 0 || !authorName.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/public/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinic_slug: clinicSlug,
          rating,
          author_name: authorName.trim(),
          comment: comment.trim() || null,
          source,
        }),
      });
      if (res.status === 429) {
        setError('تم إرسال تقييم كثيراً. حاول لاحقاً.');
        return;
      }
      if (!res.ok) {
        setError('تعذر حفظ التقييم. حاول مرة أخرى.');
        return;
      }
      setDone(true);
    } catch {
      setError('تعذر حفظ التقييم. حاول مرة أخرى.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="review-prompt-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
      onClick={onClose}
    >
      <div
        dir="rtl"
        className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
                {done ? (
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-2xl text-emerald-600">✓</div>
            <h2 id="review-prompt-title" className="text-xl font-bold text-slate-900">شكراً لتقييمك!</h2>
            <p className="mt-2 text-sm text-slate-600">رأيك يساعدنا على تحسين خدمتنا.</p>
            <button
              type="button"
              onClick={onClose}
              className="mt-6 w-full rounded-full bg-slate-900 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-700"
            >
              إغلاق
            </button>
          </div>
        ) : (
          <>
            <h2 id="review-prompt-title" className="text-xl font-bold text-slate-900">كيف كانت تجربة الحجز؟</h2>
            <p className="mt-1 text-sm text-slate-600">قيّم تجربتك من 1 إلى 5 نجوم</p>
            <div dir="ltr" className="mt-4 flex items-center justify-center gap-1" role="radiogroup" aria-label="التقييم بالنجوم">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  role="radio"
                  aria-checked={rating === star}
                  aria-label={`${star} من 5 نجوم`}
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHovered(star)}
                  onMouseLeave={() => setHovered(0)}
                  className="p-1 text-3xl transition hover:scale-110"
                >
                  <span className={star <= highlighted ? 'text-amber-400' : 'text-slate-300'}>★</span>
                </button>
              ))}
            </div>
            {!(source === 'booking' && patientName.trim()) && (
              <>
                <label htmlFor="review-prompt-name" className="mt-4 block text-sm font-semibold text-slate-700">الاسم</label>
                <input
                  id="review-prompt-name"
                  type="text"
                  value={authorName}
                  onChange={(e) => setAuthorName(e.target.value)}
                  maxLength={100}
                  placeholder="اسمك الكريم"
                  className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-800 outline-none focus:border-amber-400 focus:bg-white"
                />
              </>
            )}
            <label htmlFor="review-prompt-comment" className="mt-3 block text-sm font-semibold text-slate-700">
              تعليق <span className="font-normal text-slate-400">(اختياري)</span>
            </label>
            <textarea
              id="review-prompt-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={1000}
              rows={3}
              placeholder="شاركنا رأيك..."
              className="mt-1 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-800 outline-none focus:border-amber-400 focus:bg-white"
            />
            {error && (
              <p role="alert" className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
                {error}
              </p>
            )}
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={rating === 0 || !authorName.trim() || submitting}
                className="flex-1 rounded-full bg-amber-400 px-6 py-3 text-sm font-bold text-slate-900 hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? 'جارٍ الإرسال...' : 'إرسال التقييم'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-slate-200 px-6 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                تخطي
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
