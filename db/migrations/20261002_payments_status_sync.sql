-- ============================================================
-- 20261002 — Payments UX + invoice status integrity
--  1) record_payment gains optional p_payment_date (backdated payments).
--     Appended as the LAST parameter with a default so existing callers
--     (named-args RPC from supabase-js) remain 100% compatible.
--  2) payments_sync_invoice_status trigger keeps clinic_invoices.status in
--    sync after every payment insert/update/delete (same rules the app's
--    recompute_invoice_status uses; also invoked there, this covers direct
--    payment mutations e.g. voids/refunds).
-- ROLLBACK:
--   DROP TRIGGER payments_sync_invoice_status ON public.clinic_payments;
--   DROP FUNCTION public.payments_sync_invoice_status();
--   (record_payment overload: CREATE OR REPLACE without p_payment_date)
-- ============================================================

-- 1) record_payment + optional payment date
CREATE OR REPLACE FUNCTION public.record_payment(p_clinic_id uuid, p_invoice_id uuid, p_amount numeric, p_method text, p_reference text, p_idempotency_key uuid, p_recorded_by uuid, p_payer_type text DEFAULT NULL::text, p_payer_ref uuid DEFAULT NULL::uuid, p_payment_date timestamptz DEFAULT NULL::timestamptz)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
  v_invoice    public.clinic_invoices%rowtype;
  v_paid       numeric(12,2);
  v_remaining  numeric(12,2);
  v_payment_id uuid;
  v_receipt    text;
  v_seq        bigint;
  v_year       int := extract(year from coalesce(p_payment_date, now()))::int;
  v_pay_date   timestamptz := coalesce(p_payment_date, now());
begin
  if p_amount is null or p_amount <= 0 then raise exception 'INVALID_AMOUNT'; end if;
  if p_method not in ('cash','card','bank_transfer','insurance','other') then
    raise exception 'INVALID_METHOD';
  end if;
  if p_payer_type is not null
     and p_payer_type not in ('patient', 'insurance', 'employer', 'third_party') then
    raise exception 'INVALID_PAYER_TYPE';
  end if;

  select * into v_invoice from public.clinic_invoices
   where clinic_id = p_clinic_id and id = p_invoice_id;
  if not found then raise exception 'INVOICE_NOT_FOUND'; end if;
  if v_invoice.status = 'voided' then raise exception 'INVOICE_VOIDED'; end if;
  if p_idempotency_key is not null then
    select id into v_payment_id from public.clinic_payments
     where clinic_id = p_clinic_id and idempotency_key = p_idempotency_key
       and status = 'recorded' limit 1;
    if found then
      return jsonb_build_object('payment_id', v_payment_id, 'duplicate', true);
    end if;
  end if;

  select coalesce(sum(case when direction = 'payment' then amount else -amount end), 0)
    into v_paid
    from public.clinic_payments
   where clinic_id = p_clinic_id and invoice_id = p_invoice_id and status = 'recorded';
  v_remaining := round(v_invoice.total - v_paid, 2);

  if p_method in ('cash','card','bank_transfer','insurance') then
    v_seq := public.next_clinic_sequence(p_clinic_id, 'receipt', v_year);
    v_receipt := format('RCP-%s-%s', v_year, lpad(v_seq::text, 6, '0'));
  end if;

  insert into public.clinic_payments
    (clinic_id, invoice_id, direction, amount, method, reference,
     receipt_number, idempotency_key, payer_type, payer_ref, recorded_by, created_at)
  values
    (p_clinic_id, p_invoice_id, 'payment', round(p_amount, 2), p_method,
     p_reference, v_receipt, p_idempotency_key, p_payer_type, p_payer_ref, p_recorded_by, v_pay_date)
  returning id into v_payment_id;

  perform public.recompute_invoice_status(p_clinic_id, p_invoice_id);

  insert into public.financial_transactions
    (clinic_id, event_key, event_type, ref_table, ref_id, direction, amount, actor_user_id, metadata)
  values
    (p_clinic_id, 'payment_recorded:' || v_payment_id::text, 'payment_recorded',
     'clinic_payments', v_payment_id, 'in', round(p_amount, 2), p_recorded_by,
     jsonb_build_object('invoice_id', p_invoice_id, 'method', p_method,
                        'receipt_number', v_receipt,
                        'payment_date', v_pay_date,
                        'backdated', (p_payment_date is not null),
                        'invoice_remaining_before', v_remaining));

  return jsonb_build_object('payment_id', v_payment_id, 'receipt_number', v_receipt,
                            'duplicate', false, 'invoice_remaining_before', v_remaining);
end;
$function$;

GRANT EXECUTE ON FUNCTION public.record_payment(uuid, uuid, numeric, text, text, uuid, uuid, text, uuid, timestamptz) TO service_role;

-- 2) keep invoice status in sync on any direct payment mutation
CREATE OR REPLACE FUNCTION public.payments_sync_invoice_status()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  v_clinic_id uuid;
  v_invoice_id uuid;
begin
  v_clinic_id := coalesce(new.clinic_id, old.clinic_id);
  v_invoice_id := coalesce(new.invoice_id, old.invoice_id);
  perform public.recompute_invoice_status(v_clinic_id, v_invoice_id);
  return null; -- AFTER trigger, no return value used
end;
$function$;

DROP TRIGGER IF EXISTS payments_sync_invoice_status ON public.clinic_payments;
CREATE TRIGGER payments_sync_invoice_status
AFTER INSERT OR UPDATE OR DELETE ON public.clinic_payments
FOR EACH ROW EXECUTE FUNCTION public.payments_sync_invoice_status();
