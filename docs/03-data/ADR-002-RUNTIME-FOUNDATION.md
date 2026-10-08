# ADR-002: runtime foundation and first authenticated directory slice

Date: 2026-10-08. Status: accepted engineering contract for development. Integration review completed; SEC-001A migration received independent security review and a relinking fix. This is not owner approval of live activation or full-system acceptance. Task: ARCH-001, first part of SEC-001. Input: repository `167c04ef2e39e0a30f04e5d8fd26e25eb1803a43`, ADR-001, requirements M01/M02/M05/M19/M20/C01/C06/C07, foundation migration `20260713000100`, security matrices, and OD-001/003/011/012/013/016. This decision creates no schema, permissions, identities, storage, deployment or live authority.

## Boundary and application basis

The first runtime outcome is a real Supabase login followed by a permitted account/facility directory using synthetic records. It is a bounded increment, not completion of SEC-001, M01/M02/M05/M19 or the 20-module destination. Requests, document contents, releases, role administration, uploads and external integrations remain unavailable in this increment. No PHI or real client data enters fixtures. All owner activation gates remain closed; `production_enabled: false` is unchanged.

The canonical repository has `app/index.html`, `app/styles.css` and static `app/app.js`; its seven-table migration enables RLS but defines no policies. In the separate Lovable source inspected for this preparation, the shell uses React 19, TypeScript and TanStack Start, with no backend contract. The inspected Lovable head is `0d48e1adfa63fa05ee0436bb5d83dd56ca94f523`; it has a separate internal remote. Useful interface structure is adapted into canonical `web/`. No GitHub/Lovable synchronization or remote persistence is claimed.

Recommend one React/TypeScript SPA under `web/`, preserving useful Lovable shell components, design tokens, navigation and responsive layouts, with route adapters for the chosen client router. Keep the canonical static shell as a reference until its useful behavior is covered. A private authenticated directory has no demonstrated SSR requirement; carrying the whole starter and its unused dependencies is unnecessary. The lead may retain TanStack routing where that reduces transfer work. Stack/package versions, lockfile and source-transfer review are engineering decisions, not new owner business decisions. Do not maintain two production frontends. Keep auth, typed directory access and domain components separate; no speculative services or microservices.

The prototype's simple/enterprise/admin view switch is presentation-only and must never choose identity or capabilities. Runtime account selection only filters an already authorized result. Do not show static counts as live data; clearly separate remaining demonstration screens from connected directory screens.

## Identity, membership and scope

Supabase Auth establishes the subject; OS establishes whether that subject has access. Never match identities by email, domain, display name or an external Moldo ID. Keep the existing `user_profiles.id` stable and link its unique nullable `auth_user_id` to `auth.users(id)`. Trusted provisioning may attach an unlinked suspended profile; an existing nonnull link cannot be reassigned to a different Auth UUID in this slice. Auth deletion may unlink it without deleting history. Identity recovery/relinking requires a later explicit contract. Provision only synthetic Auth identities for tests; no signup-to-membership trigger and no self-service grants. A later invitation workflow must verify its intended recipient and consume a scoped server-owned invitation.

The effective access predicate is:

`verified Supabase subject AND linked active profile AND active account_access row AND explicit capability at the requested scope`.

Evaluate current database state on every query; role arrays or membership claims cached in a JWT are not authority. A suspended/removed profile denies every account. A suspended/removed/invited membership denies that account even if another legacy role remains. An absent link, membership, capability or recognized scope denies access. Technical administration grants no implicit business or cross-account access.

### Exact minimum data additions

These are contracts for a new additive migration after the lead verifies actual deployment history. Preserve the existing foundation migration and IDs.

| Relation | Required additions and invariants |
| --- | --- |
| Existing `user_profiles` | Add `identity_status text NOT NULL DEFAULT 'suspended'`, checked to `active/suspended/removed`. Add an FK from the already-unique `auth_user_id` to `auth.users(id) ON DELETE SET NULL`. A null link always denies, even if its status is active; unlinking must be audited. Preserve the profile and business/audit references when an Auth identity disappears. No browser updates to identity linkage or status. |
| New `account_access` | `account_id uuid`, `user_profile_id uuid`, `membership_status text NOT NULL DEFAULT 'invited'` checked to `invited/active/suspended/removed`, `is_demo boolean NOT NULL DEFAULT true`, and server `created_at/updated_at timestamptz`. Composite PK `(account_id,user_profile_id)`; FKs to existing account/profile, with no cascading destruction. This is the one authoritative lifecycle row, independent of roles. |
| Existing `account_memberships` | Preserve rows and allowed `role_key` values. Add a composite FK `(account_id,user_profile_id)` to `account_access` after backfill. Treat this legacy table as role assignments only; none of its role names confers a runtime capability. `removed_suspended` is a legacy lifecycle marker, never a capability or a new assignable business role. No client writes or directory API dependence on this table. |
| New `account_capability_grants` | `id uuid PK`, `account_id uuid`, `user_profile_id uuid`, `capability_key text`, `scope_kind text`, nullable `facility_id uuid`, nullable `revoked_at timestamptz`, `is_demo boolean NOT NULL DEFAULT true`, and server `created_at timestamptz`; all other fields nonnull. Composite membership FK to `account_access`; composite `(facility_id,account_id)` FK to existing `facilities(id,account_id)`. An active grant is one with `revoked_at IS NULL`. Enforce allowed combinations below and uniqueness of active `(account_id,user_profile_id,capability_key,scope_kind,facility_id)`, including null facility values. Index the membership lookup and active grant lookup; the existing facility tenant index remains useful. |

Only these grants exist in the first increment; action identifiers are capabilities, not new roles:

| `capability_key` | `scope_kind` | `facility_id` | Meaning |
| --- | --- | --- | --- |
| `view_account` | `account` | null | Read the account's directory identity/name only. |
| `view_asset` | `facility` | required | Read precisely that same-account facility's directory identity/name. The grant also serves as its assignment; no redundant facility-assignment table is needed yet. |
| `view_asset` | `all_facilities` | null | Explicitly read all facilities in this one account. This is never inferred from `view_account` or an admin role. |

A facility read additionally requires `view_account` for its account. No wildcard capabilities, implied document access, organization-wide admin shortcut or program/portfolio inheritance enters this slice. Later project/vendor/financial/release grants need their own contracts and tests. `facilities.account_id` is the present access partition, not proof that the client owns or pays for the physical site. Future shared physical sites use an explicit relationship model; address matching never merges accounts or grants access.

Backfill one `account_access` row per existing account/profile pair. If any legacy role is `removed_suspended`, initialize it as `suspended`; initialize other pairs as `invited`. Existing profiles initialize suspended. Existing nonnull Auth links must resolve to actual `auth.users` before validating the FK; report discrepancies instead of inventing users. No legacy role automatically activates a membership or generates grants. A reviewed synthetic fixture step links actual Auth UUIDs and explicitly activates the intended profiles/memberships/grants. Preserve all legacy rows and record the mapping.

The additive migration preserves immutable `auth_linked_once` history. Existing links initialize true; only the database trigger advances false to true during initial attachment to a suspended profile. Manual unlinking and Auth deletion preserve true. A previously linked profile cannot be attached again, including to its original Auth UUID, and even trusted provisioning cannot reset the history field. Recovery/relinking requires a separately reviewed contract. The field is not exposed to browser roles.

### Minimal authorization functions and policy surface

Implement two `STABLE` helpers in a non-exposed `private` schema. Use reviewed `SECURITY DEFINER` ownership only to read the authorization tables without recursive policies; pin `search_path = ''`, qualify every name, avoid dynamic SQL and revoke default public execution. Grant only the schema usage/function execution needed by policies. Neither function accepts a caller-supplied actor/profile ID.

| Function | Exact contract |
| --- | --- |
| `private.current_subject_id() RETURNS uuid` | Return the sole profile ID matching nonnull `auth.uid()` with `identity_status='active'` and `is_demo=true`; otherwise null. Reject anonymous Auth identities in this development login path. Do not inspect user-editable metadata for authority. |
| `private.has_directory_capability(p_account_id uuid, p_capability_key text, p_facility_id uuid DEFAULT NULL) RETURNS boolean` | Start with the current active subject, its same-account active demo membership and a nonrevoked matching demo grant. `view_account` requires null facility and scope `account`. `view_asset` requires an existing demo facility in that exact account, the account-read grant, and either its exact facility grant or explicit `all_facilities`. Unknown keys, invalid combinations and absent rows return false. |

The demo condition is an additional development restriction, never a substitute for subject, tenant, scope or capability checks. All authorization/configuration columns remain server-controlled. Helpers return only the caller's answer and must not expose a different user's grants. Before adding any future business mutation, recheck these predicates in the mutation transaction and define its concurrency behavior.

Apply RLS and explicit grants together. `anon` receives no application data privileges. `authenticated` receives only the following column-level SELECT surface; all direct INSERT/UPDATE/DELETE operations remain denied:

| Table | Allowed rows and output columns |
| --- | --- |
| `user_profiles` | Current active subject only: `id,display_name,identity_status,is_demo`. |
| `client_accounts` | `has_directory_capability(id,'view_account',NULL)` and demo account only: `id,display_name,is_demo`. |
| `facilities` | `has_directory_capability(account_id,'view_asset',id)` and demo facility only: `id,account_id,display_name,is_demo`. |

No client SELECT is required on `account_access`, capability grants, legacy memberships, requests, documents or audit events. Private helpers supply policy decisions. No exposed definer views/RPCs, public bucket, service-role browser key or client authorization cache bypass is permitted. Existing deny-by-default surfaces remain denied. Any later view must preserve invoker RLS and permitted columns; joins, counts and exports must filter the same rows.

## Auth and directory API contract

Use the existing verified OS development backend, `auxiliumos-dev` (`txofqxictwecgcnvezlb`), when authorized configuration is reconciled. Do not create a replacement backend or target Moldo. The frontend receives only that project's URL and publishable key. Server secrets stay outside source, builds and browser storage. Test identities obtain real tokens through Supabase Auth; hand-setting JWT claims in SQL is useful for unit checks but is insufficient API evidence.

The browser uses the supported Supabase client for sign-in, refresh and sign-out. The initial fixture login may use password sign-in with runtime-only test credentials; public registration, invitation delivery, password recovery and SSO are not implemented by displaying a login form. Authentication errors are returned as errors, never a successful demo fallback. Verify identity with `auth.getUser()` when establishing the app session; any future trusted server handler must independently validate the bearer token, rather than trusting `getSession()` output or decoded claims. The Data API validates requests, and database authorization remains decisive even when the UI has a valid session.

| Client adapter | Wire operation and result |
| --- | --- |
| `loadRuntimeContext()` | Call `auth.getUser()`, then `GET /rest/v1/user_profiles?select=id,display_name,identity_status,is_demo`. Return the single permitted profile as `{ profileId, displayName, development: true }`. Missing/invalid authentication produces `unauthenticated`; valid Auth with no permitted profile produces `access_unavailable`, without identifying whether linkage, status or provisioning caused it. |
| `listAccounts({ afterId?, limit? })` | `GET /rest/v1/client_accounts?select=id,display_name,is_demo&order=id.asc&limit=N`, adding `id=gt.UUID` for a cursor. Return `{ items: AccountDirectoryItem[], nextCursor: UUID|null }`. |
| `listFacilities({ accountId, afterId?, limit? })` | `GET /rest/v1/facilities?select=id,account_id,display_name,is_demo&account_id=eq.UUID&order=id.asc&limit=N`, with the same cursor convention. Return `{ items: FacilityDirectoryItem[], nextCursor: UUID|null }`. No cross-account fallback. |

Both directory adapters validate UUIDs, default the page size to 50, accept integers 1–100, fetch one extra row to determine `nextCursor`, and expose no unfiltered total. Reject invalid arguments before a request. If an extra row exists, return the last emitted item's ID as the cursor; otherwise return null. The account item is `{ id, displayName, isDemo }`; the facility item adds `accountId`. The wire limit is therefore requested page size plus one. Account IDs in queries narrow results but never select authority. Empty RLS-filtered SELECT results are successful empty arrays, not proof that a guessed object exists; do not mislabel them as transport failures or promise an HTTP 403 for every forbidden read. Explicit API errors remain errors, with safe user messages and retry only for recoverable transport failures.

On sign-out, identity/account change, or lost access, clear relevant cached rows. Query cache keys include authenticated profile and account; never share authenticated responses through public/static caches. Recheck on renewed session and screen entry; a held token cannot bypass the next database check after revocation commits. Revocation prevents new reads, not retrieval of bytes already delivered. Support loading, empty, expired session, access unavailable and backend-error UI states. No documents or role-administration endpoints are part of this contract.

## Server provenance and audit contract

The lead may implement this section as a separate bounded SEC-001C increment after the directory policies. Until then, audit provenance is specified, not implemented, and neither the directory increment nor its tests complete M19 or all of SEC-001.

Do not let the client insert an `audit_events` row, choose an actor, provide authoritative timestamps, or rewrite history. Existing seed events are synthetic historical fixtures, not authenticated runtime evidence.

For access provisioning/lifecycle changes, extend the existing audit table with `actor_kind` (`legacy_fixture/user/system`), nullable `actor_auth_user_id uuid` as a historical value without destructive FK cascade, nullable `actor_system_key text`, and `correlation_id uuid`. Backfilled rows have `actor_kind='legacy_fixture'` and make no runtime-actor claim. New user events require profile and authenticated subject IDs; system events require an explicit system key and no impersonated user. Allow null `account_id` only for profile/global-security events under a checked event-type contract; tenant events always retain their account. Keep audit data internal and append-only through ordinary application interfaces.

Define `private.audit_access_change() RETURNS trigger` for changes to profile linkage/status, `account_access` and capability grants. It records changed object IDs, lifecycle/grant action and safe prior/new control values in the same transaction; actor identity comes from verified `auth.uid()`, never row payload. Privileged development provisioning without a user subject is explicitly a system operation, identified as `database_privileged_operation`, with database `session_user` recorded as technical provenance, not a claimed human approver. Generate correlation/time in the database. Unknown actors cannot be relabeled as a qualified reviewer, signer or business approver. Trigger function execution and audit table writes are unavailable to client roles. No secrets, JWTs, passwords, raw claims, free-text request bodies or sensitive content enter metadata.

RLS SELECT filtering does not itself produce an audit event, and a database exception rolls back same-transaction log writes. Do not claim complete denial auditing from these policies/triggers. The later trusted API/audit collector must persist consequential rejected attempts outside the failed transaction, including pre-account denials with a separately modeled actor, bounded reason codes and server correlation. Review direct Data API/platform log coverage before declaring M19 complete. The first directory increment can prove access denial without claiming this remaining audit coverage or document-access auditing is implemented.

## Additive contracts for subsequent slices

**Incident and Project Request.** `incident_requests` remains the read-only legacy foundation in this increment. In INTAKE-001, add `incidents` for event/context and `project_requests` for submissions, with tenant-constrained FKs and optional `project_requests.incident_id`. Preserve each old request UUID as the new request UUID and record unique `legacy_incident_request_id`; retain legacy rows and audit references. Backfill existing request title/status/submitter/facility without inventing an incident. One incident can have many requests/projects; routine work can have none. Add and backfill new document/request links while keeping old links readable. Compare mapping/counts before a controlled writer cutover; thereafter only the new request model accepts writes and a compatibility adapter resolves legacy IDs. No permanent dual writer, destructive reset, blind rename, inferred authorization from a submitted status, or invented program/MSA requirement.

**Documents and versions.** `documents` stays the logical artifact/metadata identity; its present `version_label` and `release_state` are not release authority. DOC-001 adds immutable `document_versions` containing stable version ID, document/account IDs, server-assigned revision ordinal, private storage object key, verified content checksum, media type/byte size, creator and creation time. Enforce same-account parent links and unique document/revision. A version's bytes and checksum never change in place. Future deliverable requirements are separate from these file revisions. Review/signature/release records bind to the exact version and checksum; audience grants are independent of project membership. A new draft does not supersede an existing release. Replacement, withdrawal and supersession are explicit audited transitions; a preservation hold prevents destruction independently of visibility restrictions. Existing demo release labels confer no grants and must not be converted to released version records without actual version evidence. Private storage policies, download authorization and signed-URL revocation behavior remain a separate SEC-001/DOC-001 acceptance dependency before file access.

**Moldo and authority.** External identity mapping cannot create an OS profile membership or capability. No Moldo connector is activated in this slice. Later projections carry stable external IDs, source owner/version and permitted audiences under ADR-001; source grants cap OS visibility. Retain separate technical review, commercial/signature and document-release authorities, with effective approved revisions governing their domains. This directory model grants none of them. Suspected PHI handling, quarantine and human escalation must exist before real uploads; no AI processing is introduced.

## Required implementation evidence and unresolved decisions

The implementation must use actual synthetic Auth identities and two accounts with facilities A1/A2/B1. Prove: unauthenticated/unlinked denial; allowed own account; A1-only denial of A2 and B1; account-read without a facility grant revealing no facilities; explicit all-facilities permission; a second active role failing to overcome suspended/removed membership; profile suspension denying both accounts with an already-issued token; grant revocation on the next request; forged profile/account/actor payloads and all client writes denied; and direct joins/counts preserving isolation. Verify access-change audit append when that bounded increment is implemented, and client audit mutation denial from the first slice. A database/API denial suite plus representative browser login/directory/revocation journey is directory acceptance. Static SQL inspection or a rendered shell is not runtime proof. The lead's available local PGlite environment can exercise real PostgreSQL RLS with simulated subjects; that is useful database evidence, but cannot certify Supabase Auth, token validation or HTTP/API behavior.

| Critical ambiguity | Recommendation and boundary |
| --- | --- |
| Source transfer and current deployment parity | Lead records exact canonical/Lovable commits, source transfer and backend configuration before applying migrations or presenting a hosted build as synchronized. Local preparation is independent of GitHub write availability. |
| Actual people, delegation and portal audiences | Use only explicit synthetic grants now. OD-001/003/012 remain closed for live grants/client onboarding; no role-to-capability mapping is silently approved. |
| Login delivery, recovery contacts, privileged MFA/SSO | Exercise synthetic Auth login now; choose/reconcile providers and recovery/MFA enforcement before privileged or client live onboarding under OD-012. |
| Broad facility scope versus future portfolios/shared sites | Use the three exact grant combinations above now. Model future relationship/portfolio scopes explicitly; no authority inferred from account affiliation or physical address. |
| Lifecycle conversion of legacy roles | Deny by default and review the fixture activation map; retain legacy rows. Subsequent lifecycle writes target `account_access`, never another `removed_suspended` role assignment. |
| Global/denial audit coverage and retention | Add explicit server actor provenance; implement durable denial collection before M19 acceptance. OD-011 governs live export/retention/destruction; no automatic permanent destruction. |
| Document/incident migration semantics and real uploads | Preserve legacy IDs/history and keep write/release/upload surfaces closed until their bounded implementation contracts and runtime evidence exist; OD-013 incident handling still applies. |
| Moldo sharing/commercial owner | Keep connector disabled and identities independent until source contract review and OD-016 activation evidence. No entity, IP, billing or sale-rights decision is inferred. |

Technical references checked 2026-10-08: [Supabase user data and Auth links](https://supabase.com/docs/guides/auth/managing-user-data), [RLS, grants and private helpers](https://supabase.com/docs/guides/database/postgres/row-level-security), and [auth.getUser](https://supabase.com/docs/reference/javascript/auth-getuser). The architecture and conservative development defaults above are project decisions; these references describe provider mechanics, not owner approval.
