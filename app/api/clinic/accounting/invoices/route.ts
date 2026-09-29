import { NextResponse } from 'next/server';
import { authorizeClinicRequest, roleDenied, INVOICE_CREATE_ROLES, FINANCE_READ_ROLES, FINANCE_ADMIN_ROLES } from '@/lib/services/clinicAuthorization';
import { permissionDenied } from '@/lib/services/permissionGate';
import { issueInvoice, listInvoices } from '@/lib/services/accounting';

/**
 * B50 — Arabic copy for the machine codes `issueInvoice` throws. The owner must
 * never read `violates foreign key constraint` again: the API answers with the
 * reason AND the next step.
 */
const INVOICE_ERROR_AR: Record<string, string> = {
  SERVICE_NOT_IN_CATALOG:
    'الخدمة المختارة ليست ضمن كتالوج خدمات هذا المركز. حدّث الصفحة ثم اختر الخدمة من جديد، أو اكتب وصف البند يدويًا بدون ربطه بالكتالوج.',
  INVOICE_LINK_INVALID: 'تعذّر ربط الفاتورة بالسجل المطلوب. أعد تحميل الصفحة وحاول مرة أخرى.',
  PATIENT_NOT_FOUND: 'الملف المطلوب غير موجود في هذا المركز. تحقّق من المريض ثم أعد المحاولة.',
  INVOICE_SAVE_FAILED: 'تعذّر حفظ الفاتورة. أعد المحاولة بعد تحديث الصفحة.',
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body?.clinic_id) return NextResponse.json({ error: 'clinic_id required' }, { status: 400 });
    const authorization = await authorizeClinicRequest(req, body.clinic_id);
    const denied = roleDenied(authorization, INVOICE_CREATE_ROLES);
    if (denied) return NextResponse.json({ error: denied.status === 401 ? 'Unauthorized' : 'Forbidden' }, { status: denied.status });
    const permBlocked = await permissionDenied(req, body.clinic_id, 'manage_invoices', { allowedRoles: INVOICE_CREATE_ROLES });
    if (permBlocked) return permBlocked;

    const { patient_id, appointment_id, items, discount, tax, notes, due_at, payer_type, payer_ref } = body;
    // D-B3 — Discount authorization: any commercial discount on issuance
    // requires FINANCE_ADMIN (owner/accountant). No hard-coded limits.
    if ((discount ?? 0) > 0) {
      const moneyDenied = roleDenied(authorization, FINANCE_ADMIN_ROLES);
      if (moneyDenied) {
        return NextResponse.json({ error: 'DISCOUNT_AUTHORIZATION_REQUIRED' }, { status: moneyDenied.status });
      }
    }
    const result = await issueInvoice({
      clinicId: body.clinic_id,
      patientId: patient_id,
      appointmentId: appointment_id ?? null,
      items: Array.isArray(items) ? items : [],
      discount: discount ?? 0,
      tax: tax ?? 0,
      notes: notes ?? null,
      dueAt: due_at ?? null,
      payerType: payer_type ?? null,
      payerRef: payer_ref ?? null,
      actorUserId: authorization.user?.id ?? null,
    });
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // B50 — a resolvable catalog mismatch is a 400 with an actionable Arabic
    // message, not a 500 that leaks the constraint name.
    if (INVOICE_ERROR_AR[message]) {
      return NextResponse.json({ error: INVOICE_ERROR_AR[message], code: message }, { status: 400 });
    }
    const status = /INVOICE_ITEMS_REQUIRED|ITEM_DESCRIPTION_REQUIRED|INVALID_QUANTITY|INVALID_UNIT_PRICE|INVOICE_TOTAL_NEGATIVE|ITEM_PRICE_INVALID|DISCOUNT_INVALID|TAX_INVALID|INVALID_PAYER_TYPE|PROVIDER_NOT_FOUND/.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const clinicId = url.searchParams.get('clinic_id');
    if (!clinicId) return NextResponse.json({ error: 'clinic_id required' }, { status: 400 });
    const authorization = await authorizeClinicRequest(req, clinicId);
    const denied = roleDenied(authorization, FINANCE_READ_ROLES);
    if (denied) return NextResponse.json({ error: denied.status === 401 ? 'Unauthorized' : 'Forbidden' }, { status: denied.status });
    // #43 — flexible layer on top of the legacy role matrix (never replaces it).
    const permBlocked = await permissionDenied(req, clinicId, 'view_financial', { allowedRoles: FINANCE_READ_ROLES });
    if (permBlocked) return permBlocked;
    const data = await listInvoices(clinicId, url.searchParams.get('patient_id'));
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}