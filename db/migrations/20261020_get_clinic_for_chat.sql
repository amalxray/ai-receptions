-- Consolidates public clinic identity and the read-only chat configuration into
-- one service-role RPC. Keep the returned clinic projection explicitly public.
create or replace function public.get_clinic_for_chat(
  p_slug text default null,
  p_clinic_id uuid default null
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'clinic', jsonb_build_object(
      'id', c.id,
      'slug', c.slug,
      'name', c.name,
      'latitude', c.latitude,
      'longitude', c.longitude,
      'phone', c.phone,
      'city', c.city,
      'area', c.area,
      'address_detail', c.address_detail,
      'address', c.address,
      'website', c.website,
      'settings', c.settings,
      'activity_type', c.activity_type,
      'show_phone', coalesce(c.settings #> '{public_profile,show_phone}' = 'true'::jsonb, false)
    ),
    'services', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'name', s.name,
        'description', s.description,
        'duration_minutes', s.duration_minutes,
        'pricing_type', s.pricing_type,
        'price', s.price,
        'price_min', s.price_min,
        'price_max', s.price_max,
        'price_visible_to_patients', s.price_visible_to_patients,
        'active', s.active,
        'requires_provider', s.requires_provider
      ) order by s.name)
      from public.clinic_services s
      where s.clinic_id = c.id and s.active = true and s.deleted_at is null
    ), '[]'::jsonb),
    'providers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'title', p.title, 'provider_type', p.provider_type
      ) order by p.name)
      from public.providers p
      where p.clinic_id = c.id and p.deleted_at is null
    ), '[]'::jsonb),
    'provider_service_ids', coalesce((
      select jsonb_agg(jsonb_build_object('provider_id', ps.provider_id, 'service_id', ps.service_id))
      from public.provider_services ps
      where ps.clinic_id = c.id
    ), '[]'::jsonb),
    'currency', coalesce(cs.currency, nullif(c.settings->>'currency', '')),
    'schedules', coalesce((
      select jsonb_agg(jsonb_build_object(
        'weekday', sch.weekday,
        'enabled', sch.enabled,
        'start_time', sch.start_time,
        'end_time', sch.end_time,
        'breaks', sch.breaks,
        'shifts', sch.shifts,
        'appointment_duration_minutes', sch.appointment_duration_minutes
      ) order by sch.weekday)
      from public.provider_schedules sch
      where sch.clinic_id = c.id and sch.enabled = true
    ), '[]'::jsonb)
  )
  from public.clinics c
  left join public.clinic_settings cs on cs.clinic_id = c.id
  where c.deleted_at is null
    and ((p_clinic_id is not null and c.id = p_clinic_id)
      or (p_clinic_id is null and p_slug is not null and c.slug = p_slug))
  limit 1;
$$;

revoke all on function public.get_clinic_for_chat(text, uuid) from public, anon, authenticated;
grant execute on function public.get_clinic_for_chat(text, uuid) to service_role;
