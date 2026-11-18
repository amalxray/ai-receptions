-- Add optional reviewer classification without rewriting existing reviews.
alter table public.clinic_reviews
  add column if not exists reviewer_category text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'clinic_reviews_reviewer_category_check'
      and conrelid = 'public.clinic_reviews'::regclass
  ) then
    alter table public.clinic_reviews
      add constraint clinic_reviews_reviewer_category_check
      check (reviewer_category is null or reviewer_category in ('dentist', 'reviewer', 'other'));
  end if;
end $$;
