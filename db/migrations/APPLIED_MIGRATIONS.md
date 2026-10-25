# Applied Migration Ledger

This ledger records manually applied migrations that were confirmed outside the
local migration runner. It does not replace the SQL migration files or the
database's own migration metadata.

## 2026-10-25 — `20261025_sync_legacy_plans.sql`

| Field | Record |
|---|---|
| Environment | Production, manually applied by the project owner |
| Applied date | 2026-10-25; exact time was not provided |
| Verification | The owner-provided query returned `migration_ok = true` for both `advanced` and `center` |
| `advanced` result | `name = 'عيادة'`, `name_en = 'Clinic'`, `price_per_month = 6900`, `limits = {"users":3}`, `ask_boost = 0` |
| `center` result | `name = 'مركز'`, `name_en = 'Center'`, `price_per_month = 11900`, `limits = {"users":null}`, `ask_boost = 1` |
| Row handling | Both legacy plan rows were retained; the migration did not delete plans |
| Evidence note | Application and verification are recorded from the owner's reported SQL output; this entry does not claim a local SQL execution |

The `migration_ok` check covered only the two legacy rows. A separate read-only
catalog count on 2026-10-25 found 15 total plans, 9 active plans, 10 public
plans, and 7 plans that are both active and public. The active/public IDs were
`free_trial`, `solo_39`, `clinic_69`, `center_119`, `basic_yearly`,
`advanced_yearly`, and `center_yearly`.

## 2026-10-25 — `20261025_unify_active_plans.sql`

| Field | Record |
|---|---|
| Application | Manually applied by the project owner; not executed by this documentation task |
| Applied date | 2026-10-25 |
| Result | Success — `Success. No rows returned` |
| Verification | A follow-up `SELECT` returned 8 rows with the expected state |
| Canonical monthly rows | `basic`, `advanced`, and `center`: `is_active = true`, `is_public = true` |
| Hidden monthly rows | `solo_39`, `clinic_69`, and `center_119`: `is_active = false`, `is_public = false` |
| Subscription handling | Live subscriptions (`founding` ×2 and `center` ×1) were not modified |
| Other plans | `founding` and `limited` were not modified; no rows were deleted |
