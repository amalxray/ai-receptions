-- Setup for the private `expense-attachments` storage bucket used by expense invoice uploads.
-- This migration is documentation/bootstrapping only; the operational bucket should be created with the helper script
-- or via the Supabase dashboard if the project uses a managed bucket lifecycle.

-- Bucket creation is intentionally handled by the server-side setup script:
-- node scripts/setup-expense-attachments-bucket.mjs
-- It creates a private bucket with id `expense-attachments` when missing.
