-- Allow reviews submitted from the post-booking confirmation flow.
alter table public.clinic_reviews
  drop constraint if exists clinic_reviews_source_check;

alter table public.clinic_reviews
  add constraint clinic_reviews_source_check
  check (source in ('form', 'chat', 'booking', 'cron', 'public'));
