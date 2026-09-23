/**
 * Per-provider salary screen — pure helpers (no React).
 *
 * Kept React-free on purpose (same spirit as ./printPayslip.ts) so the merge,
 * validation and error-translation logic can be unit-tested in the node test
 * environment: this repository has no jsdom / Testing Library, so rendering
 * tests are not an option.
 *
 * SCOPE: presentation + client-side validation only. The API (`/api/clinic/
 * payroll/compensations`) and the payroll engine are untouched.
 */

export type CompensationModel = 'commission_percentage' | 'fixed_monthly' | 'hybrid';

/** Row shape returned by GET /api/clinic/providers (active is derived from deleted_at). */
export interface ProviderLite {
  id: string;
  name: string | null;
  title?: string | null;
  provider_type?: string | null;
  active?: boolean;
  deleted_at?: string | null;
}

/** Row shape returned by GET /api/clinic/payroll/compensations. */
export interface CompensationLite {
  id: string;
  provider_id: string;
  model: string;
  commission_percent: number | string | null;
  fixed_monthly_amount: number | string | null;
  effective_from: string;
  effective_to?: string | null;
  status: string;
  notes?: string | null;
}

export interface CompensationRow {
  provider: ProviderLite;
  compensation: CompensationLite | null;
  hasActiveContract: boolean;
}

/** An ACTIVE contract whose provider can no longer be paid (soft-deleted/missing). */
export interface NotPayableContract {
  providerId: string;
  providerName: string | null;
  compensation: CompensationLite;
}

export const COMPENSATION_MODEL_AR: Record<string, string> = {
  fixed_monthly: 'راتب ثابت',
  commission_percentage: 'نسبة من الإيراد',
  hybrid: 'راتب ثابت + نسبة',
};

export const PROVIDER_TYPE_AR: Record<string, string> = {
  dentist: 'طبيب أسنان',
  hygienist: 'أخصائي',
  staff: 'موظف',
};

function n(value: number | string | null | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** 3000 → '3000.00' (mirrors the toFixed(2) style of the payroll pages). */
function money(value: number | string | null | undefined): string {
  return n(value).toFixed(2);
}

/** 25 → '25%', 12.5 → '12.50%'. */
function percent(value: number | string | null | undefined): string {
  const parsed = n(value);
  return `${Number.isInteger(parsed) ? parsed.toFixed(0) : parsed.toFixed(2)}%`;
}

/** One-line Arabic summary, e.g. 'راتب ثابت 3000.00 شهرياً'. */
export function compensationSummary(compensation: CompensationLite): string {
  if (compensation.model === 'fixed_monthly') {
    return `راتب ثابت ${money(compensation.fixed_monthly_amount)} شهرياً`;
  }
  if (compensation.model === 'commission_percentage') {
    return `نسبة ${percent(compensation.commission_percent)} من الإيراد`;
  }
  if (compensation.model === 'hybrid') {
    return `${money(compensation.fixed_monthly_amount)} + ${percent(compensation.commission_percent)} من الإيراد`;
  }
  return '—';
}

/** True only for live providers — a soft-deleted provider must never be offered a salary. */
export function isActiveProvider(provider: ProviderLite): boolean {
  if (provider.deleted_at) return false;
  return provider.active !== false;
}

/**
 * Joins active providers with their ACTIVE contract.
 *
 * Active providers come first (sorted by name). Contracts belonging to
 * inactive or missing providers are returned separately so the screen can say
 * so out loud instead of listing a salary that will never reach a payslip.
 */
export function mergeCompensationState(
  providers: ProviderLite[],
  compensations: CompensationLite[]
): { rows: CompensationRow[]; notPayable: NotPayableContract[] } {
  const byProvider = new Map<string, CompensationLite>();
  for (const compensation of compensations) {
    if (compensation.status !== 'active') continue;
    const current = byProvider.get(compensation.provider_id);
    if (!current || (compensation.effective_from ?? '') > (current.effective_from ?? '')) {
      byProvider.set(compensation.provider_id, compensation);
    }
  }

  const rows: CompensationRow[] = [];
  for (const provider of providers) {
    if (!isActiveProvider(provider)) continue;
    const compensation = byProvider.get(provider.id) ?? null;
    rows.push({ provider, compensation, hasActiveContract: compensation !== null });
  }
  rows.sort((a, b) => (a.provider.name ?? '').localeCompare(b.provider.name ?? '', 'ar'));

  const notPayable: NotPayableContract[] = [];
  // NOTE: forEach instead of `for…of` — this repo's tsconfig target/downlevelIteration
  // does not allow iterating a Map directly.
  byProvider.forEach((compensation, providerId) => {
    const provider = providers.find((p) => p.id === providerId) ?? null;
    if (provider && isActiveProvider(provider)) return;
    notPayable.push({
      providerId,
      providerName: provider?.name ?? null,
      compensation,
    });
  });
  notPayable.sort((a, b) => (a.providerName ?? '').localeCompare(b.providerName ?? '', 'ar'));

  return { rows, notPayable };
}

// ---------------------------------------------------------------------------
// Client-side validation — mirrors the DB CHECKs of 20260906_payroll_foundation
// and the service-side mirror in lib/services/payroll.ts, so the user sees an
// Arabic message instead of a raw Postgres error.
// ---------------------------------------------------------------------------

export type CompensationField = 'provider' | 'model' | 'commission' | 'amount' | 'effective_from';

export interface CompensationFormError {
  field: CompensationField;
  message: string;
}

export interface CompensationFormInput {
  providerId: string;
  model: CompensationModel | '';
  /** Raw input values (strings, exactly as typed). */
  commissionPercent: string;
  fixedMonthlyAmount: string;
  effectiveFrom: string;
}

export function validateCompensationForm(input: CompensationFormInput): CompensationFormError[] {
  const errors: CompensationFormError[] = [];

  if (!input.providerId) errors.push({ field: 'provider', message: 'اختر المنتسب.' });
  if (!input.model) errors.push({ field: 'model', message: 'اختر نموذج الراتب.' });
  if (!input.effectiveFrom) errors.push({ field: 'effective_from', message: 'تاريخ السريان مطلوب.' });

  const commissionRaw = input.commissionPercent.trim();
  const amountRaw = input.fixedMonthlyAmount.trim();
  const needsCommission = input.model === 'commission_percentage' || input.model === 'hybrid';
  const needsAmount = input.model === 'fixed_monthly' || input.model === 'hybrid';

  if (needsCommission) {
    if (commissionRaw === '') {
      errors.push({ field: 'commission', message: 'أدخل النسبة (0–100).' });
    } else if (!Number.isFinite(Number(commissionRaw))) {
      errors.push({ field: 'commission', message: 'النسبة يجب أن تكون رقماً.' });
    } else if (Number(commissionRaw) < 0 || Number(commissionRaw) > 100) {
      errors.push({ field: 'commission', message: 'النسبة يجب أن تكون بين 0 و100.' });
    }
  } else if (commissionRaw !== '') {
    errors.push({ field: 'commission', message: 'النموذج «راتب ثابت» لا يقبل نسبة.' });
  }

  if (needsAmount) {
    if (amountRaw === '') {
      errors.push({ field: 'amount', message: 'أدخل المبلغ الشهري.' });
    } else if (!Number.isFinite(Number(amountRaw))) {
      errors.push({ field: 'amount', message: 'المبلغ يجب أن يكون رقماً.' });
    } else if (Number(amountRaw) < 0) {
      errors.push({ field: 'amount', message: 'المبلغ يجب ألا يكون سالباً.' });
    }
  } else if (amountRaw !== '') {
    errors.push({ field: 'amount', message: 'النموذج «نسبة من الإيراد» لا يقبل مبلغاً شهرياً.' });
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Effective date — the only ambiguous case is a FUTURE date: the screen adds a
// neutral grey note under the field ("سيُحفظ تاريخ السريان للسجل."). The note
// explains nothing about engine internals on purpose (decision: option 2 — no
// permanent disclosure of the current engine behaviour).
// ---------------------------------------------------------------------------

/** Today as 'yyyy-mm-dd' in the browser's local wall clock. */
export function todayIso(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/** True when the ISO date is strictly after `today` (both 'yyyy-mm-dd'). */
export function isFutureDate(value: string, today: string = todayIso()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return value > today;
}

// ---------------------------------------------------------------------------
// Error translation — the API surfaces raw provider/Postgres text; users must
// never read it (the raw string is kept for a support tooltip only).
// ---------------------------------------------------------------------------

export function translateCompensationError(status: number, rawMessage?: string | null): string {
  const raw = (rawMessage ?? '').trim();

  if (status === 401 || /Unauthorized/i.test(raw)) {
    return 'انتهت الجلسة — أعد تسجيل الدخول ثم حاول مجدداً.';
  }
  if (status === 403 || /Forbidden/i.test(raw)) {
    return 'هذا الإجراء متاح للمالك والمحاسب فقط.';
  }
  if (status === 409 || /duplicate key|unique constraint|one_active/i.test(raw)) {
    return 'هذا المنتسب له راتب نشط بالفعل — أنهِ العقد الحالي أولاً ثم أضف العقد الجديد.';
  }
  if (/COMPENSATION_MODEL_FIELDS_MISMATCH/i.test(raw)) {
    return 'الحقول لا تطابق النموذج: «نسبة من الإيراد» تحتاج نسبة فقط، و«راتب ثابت» مبلغاً فقط، و«راتب ثابت + نسبة» يحتاج الاثنين معاً.';
  }
  if (/not-null constraint/i.test(raw) && /effective_from/i.test(raw)) {
    return 'تاريخ السريان مطلوب.';
  }
  if (/violates check constraint/i.test(raw)) {
    return 'قيمة غير صحيحة: النسبة بين 0 و100، والمبالغ غير سالبة، وتاريخ الانتهاء لا يسبق تاريخ السريان.';
  }
  if (status === 400) return 'طلب غير مكتمل — أعد تحميل الصفحة وحاول مرة أخرى.';
  return 'تعذر الحفظ — حاول مرة أخرى.';
}

/**
 * Decision #3: writing a salary is limited to owner | accountant. A manager may
 * read the screen, but sees a disabled button with a stated reason instead of a
 * button that fails with 403.
 */
export function canManageCompensations(role: string | null | undefined): boolean {
  return role === 'owner' || role === 'accountant';
}
