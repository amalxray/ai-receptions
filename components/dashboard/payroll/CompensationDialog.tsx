'use client';

import { useState } from 'react';
import {
  COMPENSATION_MODEL_AR,
  isFutureDate,
  todayIso,
  validateCompensationForm,
  type CompensationFormError,
  type CompensationModel,
  type ProviderLite,
} from './compensationUi';

export type CompensationPayload = {
  provider_id: string;
  model: CompensationModel;
  commission_percent: number | null;
  fixed_monthly_amount: number | null;
  effective_from: string;
  notes: string | null;
};

/**
 * New salary contract for one provider.
 *
 * Configuration only (D-P1): the model decides which amount fields apply —
 * "نسبة من الإيراد" takes a percent, "راتب ثابت" takes a monthly amount and
 * "راتب ثابت + نسبة" takes both. Validation happens HERE first so the user
 * gets an Arabic message instead of a raw 400/500 from the API.
 */
export default function CompensationDialog({
  open,
  busy,
  providers,
  initialProviderId,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  busy: boolean;
  /** Providers WITHOUT an active contract (the page filters the rest out). */
  providers: ProviderLite[];
  /** Preselects one provider (per-row «إضافة راتب»); null = free choice. */
  initialProviderId?: string | null;
  /** Arabic message coming back from the API (already translated by the page). */
  error?: string | null;
  onClose: () => void;
  onSubmit: (payload: CompensationPayload) => Promise<void> | void;
}) {
  const [providerId, setProviderId] = useState(initialProviderId ?? '');
  const [model, setModel] = useState<CompensationModel | ''>('');
  const [commissionPercent, setCommissionPercent] = useState('');
  const [fixedMonthlyAmount, setFixedMonthlyAmount] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState(todayIso());
  const [notes, setNotes] = useState('');

  if (!open) return null;

  const needsCommission = model === 'commission_percentage' || model === 'hybrid';
  const needsAmount = model === 'fixed_monthly' || model === 'hybrid';

  // Requirements only exist once a model is chosen: that is when the red lines
  // appear, and the save button stays honest (disabled) until they are met.
  const errors = validateCompensationForm({
    providerId,
    model,
    commissionPercent: needsCommission ? commissionPercent : '',
    fixedMonthlyAmount: needsAmount ? fixedMonthlyAmount : '',
    effectiveFrom,
  });
  const showErrors = model !== '';
  const fieldError = (field: CompensationFormError['field']) =>
    showErrors ? errors.find((e) => e.field === field)?.message ?? null : null;

  const submit = () => {
    if (errors.length > 0 || !model) return;
    onSubmit({
      provider_id: providerId,
      model,
      commission_percent: needsCommission ? Number(commissionPercent) : null,
      fixed_monthly_amount: needsAmount ? Number(fixedMonthlyAmount) : null,
      effective_from: effectiveFrom,
      notes: notes.trim() === '' ? null : notes.trim(),
    });
  };

  const inputClass =
    'mt-2 w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-2.5 text-slate-100 outline-none focus:border-cyan-500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <h3 className="text-lg font-semibold text-slate-100">راتب جديد</h3>

        <label className="mt-4 block text-sm text-slate-300">
          المنتسب
          <select
            value={providerId}
            onChange={(e) => setProviderId(e.target.value)}
            className={inputClass}
          >
            <option value="">— اختر —</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>{p.name ?? '—'}</option>
            ))}
          </select>
        </label>
        {providers.length === 0 && (
          <span className="mt-1 block text-xs text-slate-400">
            كل المنتسبين النشطين لهم راتب مُعرَّف — أنهِ عقداً من القائمة لإضافة عقد جديد.
          </span>
        )}
        {fieldError('provider') && <span className="mt-1 block text-xs text-rose-300">{fieldError('provider')}</span>}

        <label className="mt-3 block text-sm text-slate-300">
          نموذج الراتب
          <select
            value={model}
            onChange={(e) => setModel(e.target.value as CompensationModel | '')}
            className={inputClass}
          >
            <option value="">— اختر —</option>
            {Object.entries(COMPENSATION_MODEL_AR).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        {fieldError('model') && <span className="mt-1 block text-xs text-rose-300">{fieldError('model')}</span>}

        {needsCommission && (
          <label className="mt-3 block text-sm text-slate-300">
            النسبة من الإيراد (0–100)
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={commissionPercent}
              onChange={(e) => setCommissionPercent(e.target.value)}
              className={inputClass}
            />
          </label>
        )}
        {fieldError('commission') && <span className="mt-1 block text-xs text-rose-300">{fieldError('commission')}</span>}

        {needsAmount && (
          <label className="mt-3 block text-sm text-slate-300">
            المبلغ الشهري
            <input
              type="number"
              min="0"
              step="0.01"
              value={fixedMonthlyAmount}
              onChange={(e) => setFixedMonthlyAmount(e.target.value)}
              className={inputClass}
            />
          </label>
        )}
        {fieldError('amount') && <span className="mt-1 block text-xs text-rose-300">{fieldError('amount')}</span>}

        <label className="mt-3 block text-sm text-slate-300">
          تاريخ السريان
          <input
            type="date"
            value={effectiveFrom}
            onChange={(e) => setEffectiveFrom(e.target.value)}
            className={inputClass}
          />
        </label>
        {isFutureDate(effectiveFrom) && (
          <span className="mt-1 block text-xs text-slate-400">ملاحظة: سيُحفظ تاريخ السريان للسجل.</span>
        )}
        {fieldError('effective_from') && <span className="mt-1 block text-xs text-rose-300">{fieldError('effective_from')}</span>}

        <label className="mt-3 block text-sm text-slate-300">
          ملاحظة (اختياري)
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={inputClass}
          />
        </label>

        {error && (
          <p className="mt-4 rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-xs text-rose-300">{error}</p>
        )}

        {/* The save button is disabled until the form is valid: say so instead of
            presenting a button that looks broken and has no explanation. */}
        {errors.length > 0 && !error && (
          <p className="mt-4 text-xs text-slate-400">أكمل الحقول المطلوبة لتتمكن من الحفظ.</p>
        )}

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            disabled={busy || errors.length > 0}
            onClick={submit}
            className="rounded-full bg-cyan-500 px-5 py-2 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? 'جارٍ الحفظ…' : 'إضافة الراتب'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-300"
          >
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );
}
