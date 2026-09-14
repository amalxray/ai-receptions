-- ============================================================================
-- 20261009_invoice_slug_numbering.sql — Clinic-scoped invoice numbering.
--
-- PROBLEM: every clinic issued invoices as INV-2026-000001… — the prefix was
-- shared across clinics, so an invoice number alone did not identify its
-- clinic. The per-clinic yearly SEQUENCE (clinic_sequences) was already
-- clinic-scoped; only the FORMAT was not.
--
-- FIX: new format `{clinic_slug}-{seq}` (e.g. amal-clinic-000001,
-- amal-x-ray-center-000001). Both existing overloads of issue_invoice are
-- create-or-replaced (same signatures — backward compatible). If a clinic has
-- no slug, the legacy INV-{year}-{seq} format is used as a safe fallback.
--
-- EXISTING INVOICES ARE NOT TOUCHED (they are referenced by payments/receipts
-- and financial_transactions metadata). Only newly issued invoices use the
-- new format; the per-clinic sequence CONTINUES (no renumbering, no reset).
--
-- UNIQUENESS: clinic_invoices UNIQUE (clinic_id, invoice_number) + clinics.slug
-- UNIQUE ⇒ no collision possible between clinics or formats.
--
-- ROLLBACK: recreate the previous bodies with
--   v_number := format('INV-%s-%s', v_year, lpad(v_seq::text, 6, '0'));
-- ============================================================================

create or replace function public.issue_invoice(
  p_clinic_id      uuid,
  p_patient_id     uuid,
  p_appointment_id uuid,
  p_items          jsonb,
  p_discount       numeric,
  p_tax            numeric,
  p_notes          text,
  p_due_at         timestamptz,
  p_created_by     uuid,
  p_payer_type     text default null,
  p_payer_ref      uuid default null
) returns jsonb
language plpgsql as $$
declare
  v_invoice_id uuid;
  v_number     text;
  v_slug       text;
  v_year       int := extract(year from now())::int;
  v_seq        bigint;
  v_subtotal   numeric(12,2) := 0;
  v_total      numeric(12,2);
  v_item       jsonb;
  v_qty        numeric;
  v_price      numeric;
  v_line       numeric(12,2);
  v_svc        uuid;
  v_provider   uuid;
  v_desc       text;
  v_currency   text;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'INVOICE_ITEMS_REQUIRED';
  end if;
  if p_payer_type is not null
     and p_payer_type not in ('patient', 'insurance', 'employer', 'third_party') then
    raise exception 'INVALID_PAYER_TYPE';
  end if;

  -- D-L1: currency snapshot from clinic_settings at issuance; safe fallback.
  select coalesce(cs.currency, 'ils') into v_currency
    from public.clinic_settings cs
   where cs.clinic_id = p_clinic_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty   := coalesce((v_item->>'quantity')::numeric, 1);
    v_price := (v_item->>'unit_price')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'INVALID_QUANTITY'; end if;
    if v_price is null or v_price < 0 then raise exception 'INVALID_UNIT_PRICE'; end if;
    v_line := round(v_qty * v_price, 2);
    if v_line is null then raise exception 'ITEM_LINE_INVALID'; end if;
    v_subtotal := v_subtotal + v_line;
  end loop;
  v_subtotal := round(v_subtotal, 2);
  v_total := round(v_subtotal - coalesce(p_discount, 0) + coalesce(p_tax, 0), 2);
  if v_total < 0 then raise exception 'INVOICE_TOTAL_NEGATIVE'; end if;

  -- Concurrency-safe per-clinic yearly sequence (never reused, void included).
  v_seq := public.next_clinic_sequence(p_clinic_id, 'invoice', v_year);

  -- 20261009: clinic-scoped format {slug}-{seq} (e.g. amal-clinic-000001);
  -- legacy INV-{year}-{seq} fallback only when the clinic has no slug.
  select c.slug into v_slug from public.clinics c where c.id = p_clinic_id;
  if v_slug is null or length(btrim(v_slug)) = 0 then
    v_number := format('INV-%s-%s', v_year, lpad(v_seq::text, 6, '0'));
  else
    v_number := btrim(v_slug) || '-' || lpad(v_seq::text, 6, '0');
  end if;

  insert into public.clinic_invoices
    (clinic_id, patient_id, appointment_id, invoice_number, status,
     subtotal, discount, tax, total, notes, due_at, currency, payer_type, payer_ref, created_by)
  values
    (p_clinic_id, p_patient_id, p_appointment_id, v_number, 'issued',
     v_subtotal, coalesce(p_discount, 0), coalesce(p_tax, 0), v_total,
     p_notes, p_due_at, v_currency, p_payer_type, p_payer_ref, p_created_by)
  returning id into v_invoice_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty      := coalesce((v_item->>'quantity')::numeric, 1);
    v_price    := (v_item->>'unit_price')::numeric;
    v_svc      := nullif(v_item->>'service_id', '')::uuid;
    v_provider := nullif(v_item->>'provider_id', '')::uuid;
    if v_provider is not null then
      if not exists (
        select 1 from public.providers
        where clinic_id = p_clinic_id and id = v_provider) then
        raise exception 'PROVIDER_NOT_FOUND';
      end if;
    end if;
    v_desc := coalesce(nullif(v_item->>'description', ''), nullif(v_item->>'service', ''));
    if v_desc is null then raise exception 'ITEM_DESCRIPTION_REQUIRED'; end if;
    v_line := round(v_qty * v_price, 2);
    insert into public.invoice_items
      (clinic_id, invoice_id, service_id, provider_id, description, quantity, unit_price, line_total)
    values
      (p_clinic_id, v_invoice_id, v_svc, v_provider, v_desc, v_qty, v_price, v_line);
  end loop;

  insert into public.financial_transactions
    (clinic_id, event_key, event_type, ref_table, ref_id, direction, amount, actor_user_id, metadata)
  values
    (p_clinic_id, 'invoice_issued:' || v_invoice_id::text, 'invoice_issued',
     'clinic_invoices', v_invoice_id, 'in', v_total, p_created_by,
     jsonb_build_object('invoice_number', v_number, 'subtotal', v_subtotal,
                        'total', v_total, 'currency', v_currency,
                        'payer_type', p_payer_type, 'payer_ref', p_payer_ref));

  return jsonb_build_object('invoice_id', v_invoice_id, 'invoice_number', v_number,
                            'subtotal', v_subtotal, 'total', v_total, 'currency', v_currency);
end;
$$;

-- ---------------------------------------------------------------------------
-- 11-arg overload ends here; the 9-arg legacy overload (Phase A) follows with
-- the identical numbering change (slug prefix) and no payer columns.
-- ---------------------------------------------------------------------------

create or replace function public.issue_invoice(
  p_clinic_id      uuid,
  p_patient_id     uuid,
  p_appointment_id uuid,
  p_items          jsonb,
  p_discount       numeric,
  p_tax            numeric,
  p_notes          text,
  p_due_at         timestamptz,
  p_created_by     uuid
) returns jsonb
language plpgsql as $$
declare
  v_invoice_id uuid;
  v_number     text;
  v_slug       text;
  v_year       int := extract(year from now())::int;
  v_seq        bigint;
  v_subtotal   numeric(12,2) := 0;
  v_total      numeric(12,2);
  v_item       jsonb;
  v_qty        numeric;
  v_price      numeric;
  v_line       numeric(12,2);
  v_svc        uuid;
  v_desc       text;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'INVOICE_ITEMS_REQUIRED';
  end if;

  -- Compute totals from items (server is the source of truth).
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty   := coalesce((v_item->>'quantity')::numeric, 1);
    v_price := (v_item->>'unit_price')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'INVALID_QUANTITY'; end if;
    if v_price is null or v_price < 0 then raise exception 'INVALID_UNIT_PRICE'; end if;
    v_subtotal := v_subtotal + round(v_qty * v_price, 2);
  end loop;
  v_subtotal := round(v_subtotal, 2);
  v_total := round(v_subtotal - coalesce(p_discount, 0) + coalesce(p_tax, 0), 2);
  if v_total < 0 then raise exception 'INVOICE_TOTAL_NEGATIVE'; end if;

  -- Concurrency-safe per-clinic yearly sequence (never reused).
  v_seq := public.next_clinic_sequence(p_clinic_id, 'invoice', v_year);

  -- 20261009: clinic-scoped format {slug}-{seq}; legacy INV fallback.
  select c.slug into v_slug from public.clinics c where c.id = p_clinic_id;
  if v_slug is null or length(btrim(v_slug)) = 0 then
    v_number := format('INV-%s-%s', v_year, lpad(v_seq::text, 6, '0'));
  else
    v_number := btrim(v_slug) || '-' || lpad(v_seq::text, 6, '0');
  end if;

  insert into public.clinic_invoices
    (clinic_id, patient_id, appointment_id, invoice_number, status,
     subtotal, discount, tax, total, notes, due_at, created_by)
  values
    (p_clinic_id, p_patient_id, p_appointment_id, v_number, 'issued',
     v_subtotal, coalesce(p_discount, 0), coalesce(p_tax, 0), v_total,
     p_notes, p_due_at, p_created_by)
  returning id into v_invoice_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty   := coalesce((v_item->>'quantity')::numeric, 1);
    v_price := (v_item->>'unit_price')::numeric;
    v_svc   := nullif(v_item->>'service_id', '')::uuid;
    -- Description snapshot: explicit item description, else legacy text service.
    v_desc  := coalesce(nullif(v_item->>'description', ''), nullif(v_item->>'service', ''));
    if v_desc is null then raise exception 'ITEM_DESCRIPTION_REQUIRED'; end if;
    v_line := round(v_qty * v_price, 2);
    insert into public.invoice_items
      (clinic_id, invoice_id, service_id, description, quantity, unit_price, line_total)
    values
      (p_clinic_id, v_invoice_id, v_svc, v_desc, v_qty, v_price, v_line);
  end loop;

  insert into public.financial_transactions
    (clinic_id, event_key, event_type, ref_table, ref_id, direction, amount, actor_user_id, metadata)
  values
    (p_clinic_id, 'invoice_issued:' || v_invoice_id::text, 'invoice_issued',
     'clinic_invoices', v_invoice_id, 'in', v_total, p_created_by,
     jsonb_build_object('invoice_number', v_number, 'subtotal', v_subtotal, 'total', v_total));

  return jsonb_build_object('invoice_id', v_invoice_id, 'invoice_number', v_number,
                            'subtotal', v_subtotal, 'total', v_total);
end;
$$;