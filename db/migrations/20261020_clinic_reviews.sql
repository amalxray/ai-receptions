-- ============================================================================
-- PHASE R — CLINIC REVIEWS (patient-submitted ratings for public pages)
-- SAFE: additive-only. One new table; no changes to existing schema.
-- Hybrid publishing (owner decision): clean review -> is_published = true,
-- medical-flagged -> pending clinic moderation. AggregateRating needs >=5.
-- Reversible: see DROP section at the bottom.
-- ============================================================================

create table if not exists clinic_reviews (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics (id) on delete cascade,
  patient_id uuid references patients (id) on delete set null,
  appointment_id uuid references appointments (id) on delete set null,
  rating smallint not null check (rating between 1 and 5),
  author_name text not null check (length(author_name) between 1 and 100),
  comment text check (comment is null or length(comment) <= 1000),
  source text not null check (source in ('form', 'chat', 'cron', 'public')),
  is_published boolean not null default false,
  is_verified boolean not null default false,
  flagged_medical boolean not null default false,
  flag_reason text,
  -- rate-limit fingerprints (SHA-256 hex — never raw PII)
  ip_hash text not null,
  patient_phone_hash text,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  rejected_at timestamptz,
  deleted_at timestamptz
);

comment on table clinic_reviews is
  'Patient reviews for public clinic pages. Hybrid publishing: clean -> published, medical-flagged -> pending moderation. ip_hash/patient_phone_hash are SHA-256 fingerprints for 3-level rate limiting.' ;

create index if not exists idx_clinic_reviews_clinic_published
  on clinic_reviews (clinic_id, is_published desc, created_at desc)
  where deleted_at is null;

create index if not exists idx_clinic_reviews_clinic_flagged
  on clinic_reviews (clinic_id, flagged_medical)
  where deleted_at is null;

create index if not exists idx_clinic_reviews_rate_ip
  on clinic_reviews (ip_hash, created_at desc)
  where deleted_at is null;

create index if not exists idx_clinic_reviews_rate_phone
  on clinic_reviews (patient_phone_hash, created_at desc)
  where deleted_at is null;

create index if not exists idx_clinic_reviews_rate_clinic
  on clinic_reviews (clinic_id, created_at desc)
  where deleted_at is null;

-- RLS ---------------------------------------------------------------------------
alter table clinic_reviews enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'clinic_reviews'
      and policyname = 'clinic_reviews_public_read'
  ) then
    create policy clinic_reviews_public_read
      on clinic_reviews for select
      using (is_published = true and deleted_at is null);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'clinic_reviews'
      and policyname = 'clinic_reviews_tenant_all'
  ) then
    create policy clinic_reviews_tenant_all
      on clinic_reviews for all
      using (
        clinic_id in (select cu.clinic_id from clinic_users cu where cu.user_id = auth.uid())
      )
      with check (
        clinic_id in (select cu.clinic_id from clinic_users cu where cu.user_id = auth.uid())
      );
  end if;
end $$;

-- GRANTs: anon/authenticated may ONLY read (RLS enforces published);
-- no INSERT grant at all -> writes go through service_role (the API routes).
revoke all on clinic_reviews from anon, authenticated;
grant select on clinic_reviews to anon, authenticated;

-- Lesson D10: ALWAYS grant service_role on new tables
grant all on table clinic_reviews to service_role;

-- ============================================================================
-- Reversible
-- ============================================================================
-- drop policy if exists clinic_reviews_public_read on clinic_reviews;
-- drop policy if exists clinic_reviews_tenant_all on clinic_reviews;
-- drop index if exists idx_clinic_reviews_clinic_published;
-- drop index if exists idx_clinic_reviews_clinic_flagged;
-- drop index if exists idx_clinic_reviews_rate_ip;
-- drop index if exists idx_clinic_reviews_rate_phone;
-- drop index if exists idx_clinic_reviews_rate_clinic;
-- drop table if exists clinic_reviews;