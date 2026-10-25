-- Unify active plans (applied manually 2026-10-25, Owner-approved Option A)
-- Safe: zero live subscriptions on hidden plans; center remains active.
-- Verified: 8 rows SELECT confirmed expected state.
UPDATE billing_plans SET is_active = true WHERE plan_id IN ('basic', 'advanced', 'center');
UPDATE billing_plans SET is_active = false, is_public = false WHERE plan_id IN ('solo_39', 'clinic_69', 'center_119');
-- No rows deleted. founding/limited untouched.
