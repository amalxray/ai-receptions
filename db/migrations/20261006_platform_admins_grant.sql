-- ============================================================
-- 20261006 — platform_admins: allow the owner's own-session read
--
-- The login flow (browser, authenticated role) checks platform_admins to
-- route platform owners to /admin. RLS already restricts rows to
-- user_id = auth.uid(); the table was missing the authenticated GRANT,
-- so the browser query failed with 403 before RLS was even consulted.
-- ============================================================

GRANT SELECT ON public.platform_admins TO authenticated;
