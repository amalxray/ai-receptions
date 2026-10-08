-- Preserve the clinical category selected during medical-file upload.
-- `file_type` remains the storage/MIME type; it is not a clinical category.

alter table public.medical_files
  add column if not exists medical_category text not null default 'other';

alter table public.medical_upload_sessions
  add column if not exists medical_category text not null default 'other';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'medical_files_medical_category_check'
      and conrelid = 'public.medical_files'::regclass
  ) then
    alter table public.medical_files
      add constraint medical_files_medical_category_check
      check (medical_category in ('panorama', 'cbct', 'dicom', 'report', 'other'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'medical_upload_sessions_medical_category_check'
      and conrelid = 'public.medical_upload_sessions'::regclass
  ) then
    alter table public.medical_upload_sessions
      add constraint medical_upload_sessions_medical_category_check
      check (medical_category in ('panorama', 'cbct', 'dicom', 'report', 'other'));
  end if;
end $$;

-- Preserve categories for older files whose names already indicate their type.
update public.medical_files
set medical_category = case
  when lower(coalesce(original_filename, '')) like '%pano%'
    or lower(coalesce(original_filename, '')) like '%panoramic%'
    or lower(coalesce(original_filename, '')) like '%opg%'
    or coalesce(original_filename, '') like '%بانوراما%' then 'panorama'
  when lower(coalesce(original_filename, '')) like '%cbct%'
    or lower(coalesce(original_filename, '')) like '%cone beam%'
    or lower(coalesce(original_filename, '')) like '%3d%'
    or coalesce(original_filename, '') like '%مخروطي%' then 'cbct'
  when file_type = 'medical_image'
    or lower(coalesce(original_filename, '')) like '%.dcm' then 'dicom'
  when file_type in ('pdf', 'medical_report')
    or lower(coalesce(original_filename, '')) like '%report%'
    or coalesce(original_filename, '') like '%تقرير%' then 'report'
  else 'other'
end
where medical_category = 'other';

create index if not exists idx_medical_files_clinic_category
  on public.medical_files (clinic_id, medical_category)
  where deleted_at is null;
