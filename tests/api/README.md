# Authentic directory API acceptance

`identity-directory.test.mjs` implements the Supabase Auth/Data API part of SEC-001B against [ADR-002](../../docs/03-data/ADR-002-RUNTIME-FOUNDATION.md), migration `20261008120645_identity_access_directory.sql`, and the additive SEC-001C server-audit contract. It uses installed `@supabase/supabase-js` version `2.117.3` and Node's test runner. **Live API acceptance remains UNEXECUTED.** A syntax check, the missing-configuration failure, cleanup unit mocks, and simulated SQL subjects do **not** establish API acceptance.

Prerequisites are the reviewed foundation, identity/directory and additive SEC-001C audit migrations applied to an authorized development target, a current PostgREST schema cache, password sign-in enabled, privileged fixture access to the six directory/authorization tables, and internal service-role `audit_events` SELECT (not audit DML). The original `audit_events_account_fk` remains `NO ACTION`; audited accounts/profiles must not be hard-deleted. The harness does not apply migrations, retrieve keys, create a project, or configure Auth. Supply all three variables through an approved secure runtime environment:

| Variable | Required value |
| --- | --- |
| `AUXILIUMOS_TEST_URL` | Exactly `https://txofqxictwecgcnvezlb.supabase.co`, `http://127.0.0.1:54321`, or `http://localhost:54321`. No trailing slash. |
| `AUXILIUMOS_TEST_PUBLISHABLE_KEY` | That target's browser publishable key, or its legacy `anon` key. |
| `AUXILIUMOS_TEST_SERVICE_ROLE_KEY` | That target's server-side secret/service-role key with Auth administration and fixture permissions. |

The two loopback URLs describe a locally running Supabase CLI stack using its default API port. Start and migrate that stack separately through its authorized workflow. Other projects, ports, and URLs are rejected before any request. Do not paste key values into commands, source, test reports, screenshots, or chat, and never expose the server key to the frontend. The harness does not load a fallback `.env` file or reuse browser sessions.

Before **any Auth or application fixture creation**, a read-only preflight selects the required columns with `limit(0)` on the six fixture tables and `audit_events`. It requires immutable `auth_linked_once` and the ADR-002 audit provenance columns, and fails closed on a missing column, permission failure, schema-cache mismatch, or transport failure. It retrieves no existing rows. This checks the API schema/read capability, not migration hashes, trigger bodies, FKs, write permissions, or deployed-code parity; those must be reconciled independently before running. A passing preflight alone is not acceptance evidence.

Run from the repository root after secure configuration is supplied:

```sh
node --test tests/api/identity-directory.test.mjs
```

Missing configuration fails with exit status 1 and names only the missing variable names. It does not skip, fake a session, or substitute passing mock checks. Local preparation checks are:

```sh
node --check tests/api/identity-directory.test.mjs
node --check tests/api/fixture-cleanup.mjs
node --test tests/unit/api-fixture-cleanup.test.mjs
env -u AUXILIUMOS_TEST_URL -u AUXILIUMOS_TEST_PUBLISHABLE_KEY -u AUXILIUMOS_TEST_SERVICE_ROLE_KEY node --test tests/api/identity-directory.test.mjs
```

The last command is **expected to fail**; it verifies the guard only. The helper tests use in-memory mocks and no services. They check exact targeting, cleanup ordering, partial failures, ownership, no-op detection, and modeled Auth-unlink/history postconditions; they do not execute Auth, PostgreSQL, RLS or real triggers. Do not register these checks as passing API evidence. No live execution is claimed until the configured command and cleanup both pass against the identified target/migration state.

The harness creates four random `identity-directory.invalid` Auth identities through `auth.admin.createUser({ email_confirm: true, ... })`, with independent random passwords held only in memory. It sends no invitations, confirmations, or recovery emails. Three identities receive linked **suspended** synthetic profiles, as required by the database linkage guard; after verifying denial despite valid Auth and explicit grants, the service-role client separately activates their exact profile IDs. The fourth identity deliberately remains unlinked. Fixture provisioning and cleanup never write/reset database-owned link history or manually unlink/relink a profile; the separate client relinking probe must fail with a permission denial. Auth deletion itself uses the existing `ON DELETE SET NULL` FK, and cleanup verifies the profile survives with its link null and `auth_linked_once=true`. Isolated clients disable session persistence, automatic refresh, and URL session detection. Auth verifies each signed-in identity with `getUser`; Data API clients replay the exact issued token. Keys, passwords, JWTs, raw provider errors, and session objects are never printed.

Each run provisions two new demo accounts and facilities A1/A2/B1 with random UUIDs. Account access has its own lifecycle. Subject A has explicit account-read and A1-only grants alongside two legacy roles including `system_admin`; a separate role-only subject proves that role cannot confer authority. Coverage includes:

- Anonymous denial, authenticated unlinked denial, permitted own profiles/accounts/facilities, and blocked hidden columns/tables.
- A2 and account B isolation through direct filters, exact counts, and joins in both directions.
- INSERT/UPDATE/DELETE denial on all six directory/authorization tables, capability UPSERT and profile relinking denial, with privileged before/after snapshots proving generated rows did not change.
- A forged audit actor/timestamp insert rejected by database permission, with its exact ID checked using internal service-role SELECT. An unexpectedly accepted or ambiguous probe is never deleted or rewritten; cleanup inspects that exact ID and fails if it exists or cannot be read. Normal lifecycle provisioning/cleanup may append server-generated audit events.
- Facility and account grant revocation; account-read without facility access; explicit, account-bounded all-facilities access; and invited/suspended/removed membership despite a retained legacy admin role.
- Profile suspension/removal across two explicitly granted accounts. Lifecycle changes reuse the original A token and verify it remains accepted by Auth after each denial.

Service-role use is confined to synthetic Auth creation/deletion, generated fixture setup/state changes, row verification, and cleanup. `fixture-cleanup.mjs` runs on test failure as well as success and **preserves all generated application rows and audit history**, including accounts, facilities, profiles and legacy roles. The fixture candidate IDs and exact access pairs are reported; some candidate/probe rows may never have been created. Cleanup is not a physical-erasure claim:

1. Read each exact generated profile, verify demo/link ownership, and set only its `identity_status` to `removed`. Independently set each exact generated demo account/profile pair to `removed`, and revoke each exact generated demo grant with its expected account/profile scope. Read back changes; a successful zero-row update is a failure, not successful cleanup. Already disabled and verified-absent targets are distinguished from newly changed rows.
2. For each Auth UUID returned with its exact run-specific email from a successful creation response, use `getUserById` to recheck that email. Read all profiles linked to that exact UUID without hiding non-demo rows. Any linked profile must be the expected generated demo profile, retain immutable link history, and be suspended/removed; all its access rows must be known generated demo pairs and nonactive. Recheck Auth ownership immediately before deletion. Unknown links, changed email, active access or unverified reads block only that identity's deletion.
3. Delete only that owned Auth UUID, verify Auth reports it absent, and verify any linked profile remains with a null Auth link and unchanged `auth_linked_once=true`. Never reset link history or relink the retained profile. Auth deletion alone does not invalidate already-issued access tokens: the disabled profile/access and subsequent null link are the database access barrier. No cleanup-time token-revocation guarantee is claimed.

Cleanup continues independent row/identity work after failures and fails the run with only exact synthetic IDs/table names and safe stage descriptions. A failed grant retirement or unrelated row operation does not by itself keep an Auth identity live when its profile/access are independently verified disabled; the failed operation is still reported. Failed/ambiguous Auth deletion is read back and reported, never called a verified success solely because an HTTP response succeeded. It never deletes application/audit rows, sweeps demo records, resets a schema, cascades history, searches Auth by email/domain, or adopts an unreturned Auth ID. Interrupted processes and Auth creation that commits without returning its ID require secure operator investigation; there is no automatic sweep/recovery job.

All retained generated model records and audit events are synthetic development fixtures. Their preservation is an engineering safety boundary, **not** an approved retention period, production retention/destruction policy, or owner authorization for real data; OD-011 and all live activation gates remain unchanged. Runs accumulate synthetic history. Any later disposition needs its own reviewed workflow and must not weaken the immutable audit/FK contract to make this harness pass. This suite does not certify audit-trigger implementation, denial-event collection, document/storage permissions beyond the checked table denials, browser journeys, hosted deployment, or production readiness.

Provider references: [Auth Admin createUser](https://supabase.com/docs/reference/javascript/auth-admin-createuser), [getUserById](https://supabase.com/docs/reference/javascript/auth-admin-getuserbyid), and [deleteUser](https://supabase.com/docs/reference/javascript/auth-admin-deleteuser). Fixture identities must come from the Admin API; direct SQL inserts into `auth.users` do not provide equivalent Auth/API evidence.
