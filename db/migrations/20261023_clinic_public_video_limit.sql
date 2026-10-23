-- Limit owner-uploaded public clinic videos to three per clinic. The advisory
-- transaction lock serializes concurrent metadata inserts for the same tenant.
create index if not exists idx_clinic_public_media_videos
  on clinic_public_media (clinic_id, media_type);

create or replace function enforce_clinic_public_video_limit()
returns trigger
language plpgsql
as $$
declare
  video_count integer;
begin
  if new.media_type <> 'video' then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.media_type = 'video' and old.clinic_id = new.clinic_id then
      return new;
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtext(new.clinic_id::text), hashtext('clinic_public_video_limit'));

  select count(*)::integer
    into video_count
    from clinic_public_media
   where clinic_id = new.clinic_id
     and media_type = 'video'
     and id <> new.id;

  if video_count >= 3 then
    raise exception using
      errcode = '23514',
      message = 'clinic_public_video_limit_reached';
  end if;

  return new;
end;
$$;

drop trigger if exists clinic_public_media_video_limit on clinic_public_media;
create trigger clinic_public_media_video_limit
  before insert or update of media_type, clinic_id
  on clinic_public_media
  for each row
  execute function enforce_clinic_public_video_limit();
