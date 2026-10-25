-- Allow the application to persist the end of a clinic's free trial.
-- Existing subscription statuses and rows are preserved.
ALTER TYPE public.subscription_status ADD VALUE IF NOT EXISTS 'expired';
