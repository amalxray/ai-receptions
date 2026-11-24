-- Allow external discovery providers to be stored in the platform prospect list.
-- ROLLBACK: restore the source check to openstreetmap, manual, referral only.

ALTER TABLE public.prospects
  DROP CONSTRAINT IF EXISTS prospects_source_check;

ALTER TABLE public.prospects
  ADD CONSTRAINT prospects_source_check CHECK (
    source IN ('openstreetmap', 'manual', 'referral', 'foursquare', 'geoapify')
  );
