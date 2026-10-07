-- Store public landing-page cover images separately from tenant media.
-- Uploads and landing_page_content writes are performed by authenticated
-- platform-admin APIs using service_role. Authenticated platform owners/admins
-- also have narrowly scoped RLS access to the shared landing-page content.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'landing-page-media',
  'landing-page-media',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.landing_page_content TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.landing_page_content TO authenticated;
GRANT SELECT ON storage.objects TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON storage.objects TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'landing_page_content'
      AND policyname = 'landing_page_content_platform_admin_select'
  ) THEN
    CREATE POLICY landing_page_content_platform_admin_select ON public.landing_page_content
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.platform_admins
          WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'landing_page_content'
      AND policyname = 'landing_page_content_platform_admin_insert'
  ) THEN
    CREATE POLICY landing_page_content_platform_admin_insert ON public.landing_page_content
      FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.platform_admins
          WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'landing_page_content'
      AND policyname = 'landing_page_content_platform_admin_update'
  ) THEN
    CREATE POLICY landing_page_content_platform_admin_update ON public.landing_page_content
      FOR UPDATE TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.platform_admins
          WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.platform_admins
          WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'landing_page_media_public_read'
  ) THEN
    CREATE POLICY landing_page_media_public_read ON storage.objects
      FOR SELECT TO anon, authenticated
      USING (bucket_id = 'landing-page-media');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'landing_page_media_platform_admin_insert'
  ) THEN
    CREATE POLICY landing_page_media_platform_admin_insert ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'landing-page-media'
        AND EXISTS (
          SELECT 1 FROM public.platform_admins
          WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'landing_page_media_platform_admin_update'
  ) THEN
    CREATE POLICY landing_page_media_platform_admin_update ON storage.objects
      FOR UPDATE TO authenticated
      USING (
        bucket_id = 'landing-page-media'
        AND EXISTS (
          SELECT 1 FROM public.platform_admins
          WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
        )
      )
      WITH CHECK (
        bucket_id = 'landing-page-media'
        AND EXISTS (
          SELECT 1 FROM public.platform_admins
          WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'landing_page_media_platform_admin_delete'
  ) THEN
    CREATE POLICY landing_page_media_platform_admin_delete ON storage.objects
      FOR DELETE TO authenticated
      USING (
        bucket_id = 'landing-page-media'
        AND EXISTS (
          SELECT 1 FROM public.platform_admins
          WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
        )
      );
  END IF;
END
$$;
