# Authentic directory API acceptance

`identity-directory.test.mjs` implements the Supabase Auth/Data API part of SEC-001B against [ADR-002](../../docs/03-data/ADR-002-RUNTIME-FOUNDATION.md) and migration `20261008120645_identity_access_directory.sql`. It uses installed `@supabase/supabase-js` version `2.117.3` and Node's test runner. This is a real service test: a syntax check, the missing-configuration failure, and simulated SQL subjects do **not** establish API acceptance.

Prerequisites are the foundation and identity/directory migrations applied to an authorized development target, a current PostgREST schema cache, password sign-in enabled, and privileged fixture access to the six directory/authorization tables. The harness does not apply migrations, retrieve keys, create a project, or configure Auth. Supply all three variables through an approved secure runtime environment:

| Variable | Required value |
| --- | --- |
| `AUXILIUMOS_TEST_URL` | Exactly `https://txofqxictwecgcnvezlb.supabase.co`, `http://127.0.0.1:54321`, or `http://localhost:54321`. No trailing slash. |
| `AUXILIUMOS_TEST_PUBLISHABLE_KEY` | That target's browser publishable key, or its legacy `anon` key. |
| `AUXILIUMOS_TEST_SERVICE_ROLE_KEY` | That target's server-side secret/service-role key with Auth administration and fixture permissions. |

The two loopback URLs describe a locally running Supabase CLI stack using its default API port. Start and migrate that stack separately through its authorized workflow. Other projects, ports, and URLs are rejected before any request. Do not paste key values into commands, source, test reports, screenshots, or chat, and never expose the server key to the frontend. The harness does not load a fallback `.env` file or reuse browser sessions.

Run from the repository root after secure configuration is supplied:

```sh
node --test tests/api/identity-directory.test.mjs
```

Missing configuration fails with exit status 1 and names only the missing variable names. It does not skip, fake a session, or substitute passing mock checks. Local preparation checks are:

```sh
node --check tests/api/identity-directory.test.mjs
env -u AUXILIUMOS_TEST_URL -u AUXILIUMOS_TEST_PUBLISHABLE_KEY -u AUXILIUMOS_TEST_SERVICE_ROLE_KEY node --test tests/api/identity-directory.test.mjs
```

The second command is **expected to fail**; it verifies the guard only. Do not register it as passing API evidence. No live execution is claimed until the configured command and cleanup both pass against the identified target/migration state.

The harness creates four random `identity-directory.invalid` Auth identities through `auth.admin.createUser({ email_confirm: true, ... })`, with independent random passwords held only in memory. It sends no invitations, confirmations, or recovery emails. Three identities receive linked **suspended** synthetic profiles, as required by the database linkage guard; after verifying denial despite valid Auth and explicit grants, the service-role client separately activates their exact profile IDs. The fourth identity deliberately remains unlinked. Fixture provisioning and cleanup never set/reset database-owned link history or unlink/relink a profile; the separate client relinking probe must fail with a permission denial. Isolated clients disable session persistence, automatic refresh, and URL session detection. Auth verifies each signed-in identity with `getUser`; Data API clients replay the exact issued token. Keys, passwords, JWTs, raw provider errors, and session objects are never printed.

Each run provisions two new demo accounts and facilities A1/A2/B1 with random UUIDs. Account access has its own lifecycle. Subject A has explicit account-read and A1-only grants alongside two legacy roles including `system_admin`; a separate role-only subject proves that role cannot confer authority. Coverage includes:

- Anonymous denial, authenticated unlinked denial, permitted own profiles/accounts/facilities, and blocked hidden columns/tables.
- A2 and account B isolation through direct filters, exact counts, and joins in both directions.
- INSERT/UPDATE/DELETE denial on all six directory/authorization tables, capability UPSERT and profile relinking denial, with privileged before/after snapshots proving generated rows did not change.
- A forged audit actor/timestamp insert rejected by database permission. Its exact ID is checked when service-role audit SELECT is available; otherwise a diagnostic explicitly reserves independent audit row inspection for the database suite. No audit fixture is provisioned.
- Facility and account grant revocation; account-read without facility access; explicit, account-bounded all-facilities access; and invited/suspended/removed membership despite a retained legacy admin role.
- Profile suspension/removal across two explicitly granted accounts. Lifecycle changes reuse the original A token and verify it remains accepted by Auth after each denial.

Service-role use is confined to synthetic Auth creation/deletion, generated fixture setup/state changes, row verification, and cleanup. Cleanup runs on test failure as well as success, in FK-safe order, using only generated primary keys/exact membership pairs and `is_demo=true`. It deletes each exact fixture profile before its Auth user, verifies that profile is absent, and retains/reports the Auth user if profile deletion cannot be confirmed. It never resets a schema, deletes a seed record, sweeps demo rows, or searches Auth users by email/domain. Only Auth IDs returned from this run's successful creation calls can be deleted. Cleanup failures fail the run and report only the relevant synthetic IDs/table names; interrupted processes or an Auth creation that commits without returning its ID require secure operator investigation.

The directory migration does not add audit triggers. Future server audit provenance/retention work must revise the fixture strategy before this harness is reused: it must not silently delete automatically generated historical audit records to satisfy foreign keys. This suite does not certify denial-event collection, document/storage permissions beyond the checked table denials, browser journeys, hosted deployment, or production readiness.

Provider reference: [Auth Admin createUser](https://supabase.com/docs/reference/javascript/auth-admin-createuser). Fixture identities must come from the Admin API; direct SQL inserts into `auth.users` do not provide equivalent Auth/API evidence.
