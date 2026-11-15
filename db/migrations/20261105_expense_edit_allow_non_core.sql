create or replace function public.clinic_expenses_guard_update()
returns trigger language plpgsql as $$
begin
  if new.clinic_id is distinct from old.clinic_id
     or new.expense_number is distinct from old.expense_number
     or new.amount is distinct from old.amount
     or new.method is distinct from old.method
     or new.reference is distinct from old.reference
     or new.spent_at is distinct from old.spent_at
     or new.idempotency_key is distinct from old.idempotency_key
     or new.recorded_by is distinct from old.recorded_by
     or new.created_at is distinct from old.created_at then
    raise exception 'clinic_expenses core columns are immutable (void instead)';
  end if;
  if old.status = 'voided' and new.status <> 'voided' then
    raise exception 'EXPENSE_VOIDED_IS_TERMINAL';
  end if;
  if new.status = 'voided' and old.status <> 'voided'
     and (new.voided_at is null
          or new.void_reason is null or length(btrim(new.void_reason)) = 0) then
    raise exception 'VOID_REASON_REQUIRED';
  end if;
  return new;
end;
$$;

drop trigger if exists clinic_expenses_immutable on public.clinic_expenses;
create trigger clinic_expenses_immutable
  before update on public.clinic_expenses
  for each row execute function public.clinic_expenses_guard_update();
