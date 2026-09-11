-- ============================================================
-- 20261003 — notification_type enum: add platform_announcement
--
-- /admin/notifications sends `type: 'platform_announcement'` but the
-- enum only allowed appointment_reminder / billing / system → the insert
-- failed with `invalid input value for enum notification_type`.
-- Appended as a new value via IF NOT EXISTS (no existing values touched).
-- ============================================================

ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'platform_announcement';