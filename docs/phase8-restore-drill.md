# PHASE 8 — Staging Enablement + Restore Drill (PROCEDURES — Owner-scaffold)

> Status: **PROCEDURES READY (documented) / EXECUTION BLOCKED** on owner actions.
> These two documents are the repeatable, evidence-based procedures the Owner
> (or an operator with Dashboard access) runs on a SEPARATE staging project.
> The agent cannot run them: they require (1) a second Supabase project,
> (2) Supabase Backups/PITR enabled, (3) Stripe **TEST** keys, and (4) a Vercel
> preview env. See `docs/external-gates.json` for the tracked status.

---

## A) STAGING ENABLEMENT PLAYBOOK

### A.1 Prerequisites (all Owner actions, none changeable from code)
1. **Supabase project #2 (staging)** — created from Dashboard (`new-project`).
2. **Backups/PITR** enabled on **production** first (`Database → Backups`; PITR
   requires a paid plan). PITR is what makes the restore drill real.
3. **Stripe TEST keys** for the staging env (never production keys in staging).
4. **Vercel Preview Environment** pointing at the staging project with
   `NEXT_PUBLIC_SUPABASE_URL` + service-role key (staging) + Stripe TEST keys.

### A.2 Migration order (the source of truth — shared with database-audit test)
Apply **all** files in `db/migrations/` in **filename (date) order** — the same
order enforced by `tests/unit/database-audit.test.ts`. The script
`scripts/apply-migrations.mjs` walks this exact list. On a brand-new staging
project every migration runs once, in order, additive/idempotent (each guarded
by `create table if not exists` / `create or replace` / `on conflict`).

### A.3 Per-stage verification (after EACH migration batch)
- Tables/indexes exist: `select count(*) from information_schema.tables where table_schema='public'`.
- RLS enabled on the newly-created tables:
  `select relname from pg_class where relrowsecurity and relkind='r'` — compare
  against the prior stage (no regression).
- No orphaned schema drift: run `tests/unit/database-audit.test.ts` against the
  staging URL (it asserts the exact ordered filename list + core constraints).

### A.4 Failure handling
- Every migration is transactional/all-or-nothing per statement; a failure
  aborts that batch. Fix forward with an **additive** corrective migration —
  never edit a historical file, never `db reset` on staging with production data.
- After any failure, re-run the failing migration's idempotent body; verify the
  specific object it created.

### A.5 Post-migration verification (staging)
- `node scripts/apply-migrations.mjs` → ALL `OK`.
- `npx vitest run tests/unit/database-audit.test.ts` → order contract holds.
- Health: `GET /api/health` (deployed preview) → 200.

---

## B) RESTORE DRILL (documented; execution BLOCKED until A.1 is complete)

**Goal:** prove a production backup can be restored into staging, the app boots
on it, and tenant isolation/RLS still hold. Executed ONLY on staging — never
mixing production data into the production project.

### B.1 Prerequisites (blocking)
- Staging Supabase project exists (A.1.1) AND production Backups/PITR enabled
  (A.1.2). Without a backup there is nothing to restore — documented as BLOCKED
  (2026-08-24: `pitr_enabled=false, backups=[]`).

### B.2 Procedure
1. **Backup:** Supabase `Production → Database → Backups` → take a manual
   backup (or use the latest scheduled). Record backup id + timestamp.
2. **Restore into staging:** use Supabase's "restore to another project" into
   project #2 (staging). Record restore completion timestamp.
3. **Verify row counts are non-zero and plausible:**
   ```sql
   select
     (select count(*) from clinics) as clinics,
     (select count(*) from patients) as patients,
     (select count(*) from appointments) as appointments,
     (select count(*) from clinic_invoices) as invoices,
     (select count(*) from intake_forms) as intake_forms;
   ```
   Each should match the production counts (captured before the drill); record
   both numbers.
4. **Schema integrity:** `information_schema` spot-check of every table in the
   ordered migration list — none missing, none extra.
5. **RLS / tenant isolation:** run the same live RLS probes used by
   `scripts/production-readiness-gate.mjs` (RLS enabled on critical tables) +
   a cross-tenant query attempt returns 0 rows for the wrong `clinic_id`.
6. **Application health:** deploy the app preview to the staging env; `GET
   /api/health` → 200; smoke: GET `/` → 200.
7. **Record the drill result** in `docs/external-gates.json`
   (`restore_drill.status = "closed"` with evidence) ONLY after ALL steps pass —
   never before.

### B.3 Accept/decline criteria
- **PASS** = steps 1–6 all succeed with documented numbers.
- **BLOCKED** = any prerequisite missing (this is the current state).

---

## C) SAFETY BOUNDARIES (non-negotiable)
- Staging uses **TEST-only** env vars. Production credentials never enter the
  staging env or any committed file.
- The restore drill is **never** run on the production project.
- These procedures make **no** production DB, data, or Stripe changes from code.