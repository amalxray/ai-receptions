-- ============================================================================
-- CLINIC PUBLIC MEDIA — category support (Phase 2: gallery enhancements)
-- ============================================================================
-- Adds an owner-managed category to each public gallery item so the public
-- page can group/filter the gallery (العيادة / الطاقم / المعدات / حالات / أخرى).
-- Idempotent + reversible. Default 'other' keeps existing rows valid.
-- ============================================================================

alter table clinic_public_media
  add column if not exists category text not null default 'other';

do $$
begin
  -- Replace any prior check constraint with the canonical whitelist.
  alter table clinic_public_media drop constraint if exists clinic_public_media_category_check;
  alter table clinic_public_media add constraint clinic_public_media_category_check
    check (category in ('clinic', 'team', 'equipment', 'cases', 'other'));
end $$;

comment on column clinic_public_media.category is
  'Owner-managed gallery category: clinic | team | equipment | cases | other.';
