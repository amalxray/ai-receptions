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
  /**
   * Soft-deleted (or explicitly inactive) provider. It is STILL shown — the screen
   * hides nothing — but it carries the «محذوف» badge and can never be offered a
   * new salary (the DB would accept it, yet no payslip would ever be generated).
   */
  isDeleted: boolean;
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
 * Joins EVERY provider of the clinic with their ACTIVE contract.
 *
 * No provider is filtered out: soft-deleted rows are included and flagged with
 * `isDeleted` so the screen can badge them instead of silently shrinking the
 * list (a counter reading «1 من 2» while the clinic really has 7 providers is a
 * lie). Active providers are listed first, soft-deleted ones last, each group
 * sorted by name.
 *
 * Contracts belonging to inactive or missing providers are ALSO returned
 * separately so the screen can say out loud that no payslip will ever reach
 * them.
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
    const compensation = byProvider.get(provider.id) ?? null;
    rows.push({
      provider,
      compensation,
      hasActiveContract: compensation !== null,
      isDeleted: !isActiveProvider(provider),
    });
  }
  // Active providers first, then the soft-deleted ones; name order inside each group.
  rows.sort((a, b) => {
    if (a.isDeleted !== b.isDeleted) return a.isDeleted ? 1 : -1;
    return (a.provider.name ?? '').localeCompare(b.provider.name ?? '', 'ar');
  });

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

/**
 * Providers that MAY be offered a new salary contract: no active contract AND
 * not soft-deleted. Soft-deleted providers are listed on screen, but the
 * «إضافة راتب» button is disabled for exactly this reason.
 */
export function selectableProviders(rows: CompensationRow[]): ProviderLite[] {
  return rows.filter((row) => !row.hasActiveContract && !row.isDeleted).map((row) => row.provider);
}

// ---------------------------------------------------------------------------
// Arabic counting — the counter and the warning line must read correctly for
// every count, not only the plural the developer happened to test first:
//   0 → لا أحد | 1 → منتسب واحد | 2 → منتسبان | 3-10 → N منتسبين | 11+ → N منتسباً
// ---------------------------------------------------------------------------

/** Standalone provider count phrase: 1 → 'منتسب واحد', 2 → 'منتسبان', … */
export function providersNoun(count: number): string {
  const value = Math.max(0, Math.trunc(count));
  if (value === 0) return 'لا أحد';
  if (value === 1) return 'منتسب واحد';
  if (value === 2) return 'منتسبان';
  return value <= 10 ? `${value} منتسبين` : `${value} منتسباً`;
}

/**
 * The counted noun right after a numeral: «2 منتسبين» … «11 منتسباً».
 * The dual and the sound masculine plural share the spelling «منتسبين» in the
 * genitive, and 11+ returns to the singular accusative «منتسباً».
 */
function nounAfterNumeral(count: number): string {
  return count <= 10 ? 'منتسبين' : 'منتسباً';
}

/**
 * Verb agreeing with the provider count: 1 → له | 2 → لهما | 3+ → لهم.
 *
 * Agreement rule used by salaryCounterLine: the verb follows the noun that
 * comes right before it (Y, the TOTAL), so «2 من 7 منتسبين لهم راتب» uses the
 * plural. The dual «لهما» therefore only appears when the total itself is two.
 */
function theyHave(count: number): string {
  if (count === 1) return 'له';
  if (count === 2) return 'لهما';
  return 'لهم';
}

/**
 * «X من Y منتسبين لهم راتب مُعرَّف.» — the counter above the table.
 *   (1, 7)  → '1 من 7 منتسبين لهم راتب مُعرَّف.'
 *   (2, 7)  → '2 من 7 منتسبين لهم راتب مُعرَّف.'
 *   (2, 2)  → '2 من 2 منتسبين لهما راتب مُعرَّف.'
 *   (0, 7)  → 'لا أحد من 7 منتسبين له راتب مُعرَّف.'
 *   (1, 1)  → '1 من منتسب واحد له راتب مُعرَّف.'
 *   (3, 12) → '3 من 12 منتسباً لهم راتب مُعرَّف.'
 *
 * Y is always printed: the whole point of the fix is that the user sees the real
 * total, never a silently filtered one.
 */
export function salaryCounterLine(withContract: number, total: number): string {
  const x = Math.max(0, Math.trunc(withContract));
  const y = Math.max(0, Math.trunc(total));
  if (y === 0) return 'لا يوجد منتسبون.';
  const noun = y === 1 ? providersNoun(1) : `${y} ${nounAfterNumeral(y)}`;
  // «لا أحد» is grammatically singular, so it takes «له» whatever the total is.
  const verb = x === 0 ? 'له' : theyHave(y);
  return `${x === 0 ? 'لا أحد' : x} من ${noun} ${verb} راتب مُعرَّف.`;
}

/**
 * «منتسب واحد بلا راتب مُعرَّف — لن يظهر في القسائم.» (singular verb)
 * «3 منتسبين بلا راتب مُعرَّف — لن يظهروا في القسائم.» (plural verb)
 * Call it with a positive count; the screen renders it only when it is positive.
 */
export function withoutContractLine(count: number): string {
  const value = Math.max(0, Math.trunc(count));
  const verb = value === 1 ? 'لن يظهر' : 'لن يظهروا';
  return `${providersNoun(value)} بلا راتب مُعرَّف — ${verb} في القسائم.`;
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
