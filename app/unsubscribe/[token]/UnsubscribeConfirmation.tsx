'use client';

import { useState } from 'react';

export default function UnsubscribeConfirmation({ token }: { token: string }) {
  const [complete, setComplete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function unsubscribe() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/unsubscribe/${encodeURIComponent(token)}`, { method: 'POST' });
      const result: unknown = await response.json();
      if (!response.ok) {
        const message = typeof result === 'object' && result !== null && 'error' in result &&
          typeof result.error === 'string'
          ? result.error
          : 'تعذّر إلغاء الاشتراك. يرجى المحاولة لاحقاً.';
        throw new Error(message);
      }
      setComplete(true);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'تعذّر إلغاء الاشتراك.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 space-y-4">
      {complete ? (
        <p role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-200">
          تم إلغاء الاشتراك بنجاح.
        </p>
      ) : (
        <>
          <p>هل تريد إلغاء الاشتراك من رسائل العيادات المحتملة؟</p>
          {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
          <button
            type="button"
            onClick={unsubscribe}
            disabled={busy}
            className="rounded-xl bg-red-500 px-5 py-3 font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? 'جارٍ إلغاء الاشتراك…' : 'تأكيد إلغاء الاشتراك'}
          </button>
        </>
      )}
    </div>
  );
}
