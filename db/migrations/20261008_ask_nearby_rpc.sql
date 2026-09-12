-- ============================================================
-- 20261008 — nearby_clinics RPC for /ask suggestions (Phase 2)
-- Haversine distance, bounded by radius, returns nearest clinics first.
-- EXECUTE restricted to service_role (the /api/public/ask + nearby routes
-- call it through supabaseAdmin); direct anon probing is revoked.
-- ============================================================

CREATE OR REPLACE FUNCTION public.nearby_clinics(
  p_lat NUMERIC,
  p_lng NUMERIC,
  p_radius_km NUMERIC DEFAULT 50,
  p_limit INTEGER DEFAULT 3
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  slug TEXT,
  activity_type TEXT,
  address_line TEXT,
  city TEXT,
  phone TEXT,
  google_maps_url TEXT,
  distance_km NUMERIC
)
LANGUAGE SQL
AS $$
  SELECT
    c.id, c.name, c.slug, c.activity_type::text,
    c.address_detail, c.city, c.phone, c.google_maps_url,
    ROUND((6371 * acos(
      LEAST(1.0, GREATEST(-1.0, cos(radians(p_lat)) * cos(radians(c.latitude)) *
      cos(radians(c.longitude) - radians(p_lng)) +
      sin(radians(p_lat)) * sin(radians(c.latitude))))
    ))::NUMERIC, 2) AS distance_km
  FROM clinics c
  WHERE c.deleted_at IS NULL
    AND c.latitude IS NOT NULL
    AND c.longitude IS NOT NULL
    AND (6371 * acos(
      LEAST(1.0, GREATEST(-1.0, cos(radians(p_lat)) * cos(radians(c.latitude)) *
      cos(radians(c.longitude) - radians(p_lng)) +
      sin(radians(p_lat)) * sin(radians(c.latitude))))
    )) <= p_radius_km
  ORDER BY 9 ASC
  LIMIT LEAST(p_limit, 10);
$$;

REVOKE EXECUTE ON FUNCTION public.nearby_clinics(NUMERIC, NUMERIC, NUMERIC, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nearby_clinics(NUMERIC, NUMERIC, NUMERIC, INTEGER) TO service_role;

-- Article view counter (atomic increment, service-role-only)
CREATE OR REPLACE FUNCTION public.increment_article_views(p_article_id UUID)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.platform_articles
     SET view_count = view_count + 1,
         updated_at = NOW()
   WHERE id = p_article_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_article_views(UUID) TO service_role;
