import { NextResponse } from 'next/server';
import { authorizeClinicRequest, roleDenied, EXPENSE_RECORD_ROLES } from '@/lib/services/clinicAuthorization';
import { permissionDenied } from '@/lib/services/permissionGate';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { deleteExpenseAttachment, getExpenseAttachmentSignedUrl, updateExpenseAttachment } from '@/lib/services/accounting';

const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png']);

export async function GET(req: Request, { params }: { params: Promise<{ expenseId: string }> }) {
  try {
    const { expenseId } = await params;
    const url = new URL(req.url);
    const clinicId = url.searchParams.get('clinic_id');
    if (!clinicId) {
      return NextResponse.json({ error: 'clinic_id required' }, { status: 400 });
    }

    const authorization = await authorizeClinicRequest(req, clinicId);
    const denied = roleDenied(authorization, EXPENSE_RECORD_ROLES);
    if (denied) {
      return NextResponse.json({ error: denied.status === 401 ? 'Unauthorized' : 'Forbidden' }, { status: denied.status });
    }
    const permBlocked = await permissionDenied(req, clinicId, 'manage_expenses', { allowedRoles: EXPENSE_RECORD_ROLES });
    if (permBlocked) return permBlocked;

    const { data: expense, error: expenseError } = await supabaseAdmin
      .from('clinic_expenses')
      .select('attachment_url')
      .eq('clinic_id', clinicId)
      .eq('id', expenseId)
      .maybeSingle();

    if (expenseError) throw new Error(expenseError.message);
    if (!expense) return NextResponse.json({ error: 'Expense not found' }, { status: 404 });

    const signedUrl = await getExpenseAttachmentSignedUrl(clinicId, expenseId, expense.attachment_url ?? null, 3600);
    return NextResponse.json({ data: { signedUrl, path: expense.attachment_url ?? null, expiresIn: 3600 } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /EXPENSE_NOT_FOUND|Expense not found/.test(message) ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ expenseId: string }> }) {
  try {
    const { expenseId } = await params;
    const url = new URL(req.url);
    const isDelete = req.method === 'DELETE' || url.searchParams.get('action') === 'delete';
    const clinicId = url.searchParams.get('clinic_id');
    if (!clinicId) {
      return NextResponse.json({ error: 'clinic_id required' }, { status: 400 });
    }

    const authorization = await authorizeClinicRequest(req, clinicId);
    const denied = roleDenied(authorization, EXPENSE_RECORD_ROLES);
    if (denied) {
      return NextResponse.json({ error: denied.status === 401 ? 'Unauthorized' : 'Forbidden' }, { status: denied.status });
    }
    const permBlocked = await permissionDenied(req, clinicId, 'manage_expenses', { allowedRoles: EXPENSE_RECORD_ROLES });
    if (permBlocked) return permBlocked;

    if (isDelete) {
      await deleteExpenseAttachment({
        clinicId,
        expenseId,
        actorUserId: authorization.user?.id ?? null,
      });
      return NextResponse.json({ data: { removed: true } });
    }

    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file required' }, { status: 400 });
    }
    if (file.size <= 0) {
      return NextResponse.json({ error: 'ملف فارغ' }, { status: 400 });
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      return NextResponse.json({ error: 'حجم الملف يجب أن يكون أقل من 5 MB' }, { status: 400 });
    }
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return NextResponse.json({ error: 'نوع الملف غير مدعوم. استخدم PDF أو JPG أو PNG' }, { status: 400 });
    }

    const { data: currentExpense, error: expenseError } = await supabaseAdmin
      .from('clinic_expenses')
      .select('status, attachment_url')
      .eq('clinic_id', clinicId)
      .eq('id', expenseId)
      .maybeSingle();

    if (expenseError) throw new Error(expenseError.message);
    if (!currentExpense) return NextResponse.json({ error: 'Expense not found' }, { status: 404 });
    if (currentExpense.status === 'voided') {
      return NextResponse.json({ error: 'المصروف مُلغى ولا يمكن إرفاق ملف.' }, { status: 400 });
    }

    const safeName = (file.name || `receipt-${Date.now()}`).replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `${clinicId}/${expenseId}/${Date.now()}-${safeName}`;

    const { error: uploadError } = await supabaseAdmin.storage.from('expense-attachments').upload(storagePath, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || 'application/octet-stream',
    });

    if (uploadError) throw new Error(uploadError.message);

    const updated = await updateExpenseAttachment({
      clinicId,
      expenseId,
      path: storagePath,
      actorUserId: authorization.user?.id ?? null,
    });

    const previousPath = currentExpense.attachment_url as string | null | undefined;
    if (previousPath) {
      const { error: cleanupError } = await supabaseAdmin.storage.from('expense-attachments').remove([previousPath]);
      if (cleanupError) throw new Error(cleanupError.message);
    }

    const signedUrl = await getExpenseAttachmentSignedUrl(clinicId, expenseId, storagePath, 3600);

    return NextResponse.json({ data: { signedUrl, path: storagePath, expiresIn: 3600, updated } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /EXPENSE_NOT_FOUND|Expense not found/.test(message) ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ expenseId: string }> }) {
  return POST(req, { params });
}
