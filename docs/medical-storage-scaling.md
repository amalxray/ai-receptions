# Medical storage scaling and monitoring

## Upload and access model

- The `medical-files` bucket remains private. The application API authorizes the clinic, patient, and any imaging-request relationship before creating an upload session.
- Resumable uploads use the signed-in user's access token with Supabase TUS. The migration adds an insert-only Storage policy that accepts only an unexpired upload session created by that user, with a path matching the session's patient owner. It does not grant medical-file reads, updates, or deletes.
- Upload confirmation remains server-side and is idempotent by the client upload ID. This prevents a repeated confirmation from creating a second metadata record; it is not content-hash deduplication.
- Preview URLs remain short-lived and private. Image transformations are only requested by an explicit preview action; the original stays unchanged and is fetched only by explicit open/download actions. DICOM is not treated as a browser image thumbnail.
- File lists use keyset pagination. Upload size policy remains the existing per-file validation and bucket ceiling; tenant storage alerts do not block uploads.

## Usage accounting and alert setup

The migration creates daily usage snapshots. The refresh scans `storage.objects` once and classifies:

- `medical/{clinic_id}/{patient_id}/...` against the patient's current owning clinic;
- clinic-owned messaging objects under `medical-files`;
- clinic-owned objects under `clinic-public-media`.

Files that do not match a known path/tenant relationship remain in the project-level unclassified totals. Shared patient files are charged once to the patient owner's clinic. Objects with missing size metadata are counted and shown separately; their bytes are not silently inferred.

Configure these deployment variables from trusted provider/admin settings:

- `CRON_SECRET`: required to invoke the storage snapshot and alert cron.
- `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, and `EMAIL_FROM`: required for email delivery.
- `SUPABASE_STORAGE_QUOTA_BYTES`: optional, but set it to the actual storage allowance shown for the Supabase project/plan. The app does not guess this value or currently fetch it from the Supabase Management API.
- `SUPABASE_STORAGE_ALERT_PERCENT` (default 80) and `SUPABASE_STORAGE_ALERT_EMAIL`: optional global project warning threshold and recipient.

The platform admin page `/admin/storage` displays the latest snapshot, configured project capacity (or clearly reports it as unconfigured), unknown/unclassified objects, and optional per-clinic soft limits. A platform admin can configure a clinic limit and recipient there. Clinic alerts use the configured email or the clinic's email and have a seven-day cooldown. All limits are alert-only.

The daily Vercel Cron route marks expired upload sessions stale, refreshes snapshots, and sends alerts. It does not delete medical files or incomplete Storage objects. The snapshot time is shown in the admin page; usage is therefore not real-time. A full Storage metadata scan may become expensive for very large object catalogs and should be load-tested before substantially exceeding the current scale. Cached egress and bandwidth usage are not inferred from object sizes; use Supabase billing/metrics for those.

## Deployment requirements

The migration in this branch is not applied to any database. Before deploying code that uses it, review and apply the branch migration through the approved database release procedure, verify the `medical-files` bucket is still private, configure the environment variables above, and confirm the cron and Resend delivery in staging. No Production migration or deployment is performed by this change.
