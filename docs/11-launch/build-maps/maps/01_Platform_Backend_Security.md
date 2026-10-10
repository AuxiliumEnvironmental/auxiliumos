# MAP-01 · Platform, backend and security

**Purpose:** make every OS workflow use the same reliable identity, scoped access, stable records, versioned configuration and protected history, without taking business decisions away from their owning modules.

**Primary scope:** M01 Core, M19 Audit and C01 Identity and isolation. This map supplies platform contracts used by all other maps. It does not own all backend work. Each domain owner designs and implements its domain behavior; the integration lead assigns shared files, migration order and sensitive review.

**Baseline:** canonical `148d74d9720f0799e5d845bb789cd3fc3f43feb8` and the October 9 reconciliation package. Current source must be checked before execution. `repo:` paths mean `reference/sources/canonical/`; `baseline:` paths mean `reference/`. Sections labeled target are implementation contracts to complete, not reports of shipped behavior. Exact source acceptance criteria remain in the package coverage register and `repo:REQUIREMENTS.json`.

## 1. Work backward from the finished outcome

A permitted person opens OS, resumes their correct account and facility, finds only records they can access, performs an allowed action on the intended revision, and sees a durable result with an explainable history. A removed person cannot use an old session to read or change new data. A technical administrator cannot approve scientific methods, sign an agreement, release a report or commit money merely because they administer the system. A future rule update cannot silently alter an approved job.

| Required outcome | Platform capability | Authoritative record or boundary | Completion evidence |
| --- | --- | --- | --- |
| Correct person and account on every request | Auth verification, stable profile link, active membership and explicit scope | `user_profiles`, `account_access`, `account_capability_grants`; server checks | Actual allowed and denied API requests, including previously issued sessions after revocation |
| Same object means the same thing across the OS | Stable UUIDs, tenant-safe references and explicit version bindings | Existing domain records and their owning modules | No accidental reparenting, cross-account joins or ID replacement during a workflow |
| One trustworthy rule version per decision | Governed shared configuration with domain-specific validation | Controlled rules/templates; domain record references the effective version | Old approval remains unchanged after a new configuration version |
| Complete useful search without information leakage | Permission-filtered query surface | Owning records and released document projections | Wrong-account, withdrawn, internal and finance-restricted material excluded from results, snippets and counts |
| Investigable activity | Server-attributed audit and separately designed consequential-denial capture | Protected audit history, safe correlation and operational diagnostics | A reviewer reconstructs a named workflow without secrets or copied sensitive bodies |
| Recoverable operation | Documented asset inventory, preservation and recovery rules | Database, object versions, source/configuration and immutable history | MAP-08 restore drill reconciles records, bytes, grants and external effects |

Source: `repo:docs/01-product/END_STATE_BLUEPRINT.md`, `repo:docs/03-data/ADR-001-DOMAIN-AND-MOLDO-BOUNDARIES.md`, `repo:docs/03-data/ADR-002-RUNTIME-FOUNDATION.md`, `repo:docs/03-data/ACCESS_AUDIT_IMPLEMENTATION.md`.

## 2. What exists and what remains

| Area | Established at the baseline | Remaining target and limit |
| --- | --- | --- |
| Application architecture | One canonical React/TypeScript application under `web/`, Supabase-backed runtime and typed adapters | Reuse it. Do not create a second frontend, speculative microservices, event bus or generic workflow engine. |
| Identity and directory | Stable profile/Auth linkage, identity and membership lifecycle, explicit directory grants, RLS and restricted SELECT columns | Complete usable invitation/access administration and recovery within reviewed authority. The owner-specific bootstrap is not a general administration API. |
| Owner access | Dedicated synthetic owner account/facility and five explicit development capabilities exist in source and earlier observed owner journeys | Preserve the real owner's records. Do not reuse them for disposable test cleanup or assume `system_admin` implies broader authority. |
| Audit | Access provisioning/lifecycle triggers provide protected server-attributed events and atomic rollback | Consequential denials, investigation views, exports and comprehensive document/domain coverage remain incomplete. |
| Domain functions | Intake, private objects and document lifecycle have bounded database/adapter implementations | Reuse their specific revision and retry contracts. Do not replace them with generic CRUD. |
| Rules, search and reusable services | Product requirements and ontology define the destination | No complete governed rule administration or permission-filtered global search is established by this baseline. |
| Runtime/UI continuity | Auth persistence generations and stale-callback defenses are implemented | The shared recheck unmounts the authenticated subtree. The UI audit reproduced lost unsaved work; MAP-01 and MAP-02 must repair this together. |
| Recovery and operational controls | Recovery and release designs exist | No full production recovery/operations acceptance is established. MAP-08 owns measured drills and release evidence. |

The directory ADR describes an earlier increment and is not a complete current schema inventory. `FIELD_DICTIONARY.md`, `TABLE_OWNERSHIP.md`, `RLS_POLICY_MATRIX.md` and `SCHEMA_REGISTRY.md` contain historical or stale sections. Resolve facts from applied migrations, specific later contracts and current readback. Do not revive their old “implementation not allowed” wording or treat their stale current-state statements as fact.

## 3. Ownership and architecture

### MAP-01 owns

- Shared identity and capability semantics, session-to-profile boundary, tenant-safe linking conventions and controlled shared rules.
- Audit provenance, allowed event envelopes, investigation access and data lifecycle primitives.
- Common API error conventions and cache/session isolation requirements, coordinated with MAP-02.
- Review of security-sensitive shared infrastructure changes. Review does not make MAP-01 the only team allowed to add domain tables or APIs.

### Domain maps own

- Their authoritative records, allowed transitions, revision rules, idempotency behavior, professional/commercial gates and meaningful end-to-end behavior.
- Their own table/API/component changes when the integration lead allocates those paths and migration sequence.
- Their own capability proposals and audit events. MAP-01 checks consistency and isolation; it does not substitute generic platform decisions for domain semantics.

### Integration constraints

Use the existing `web/`, `supabase/migrations/`, `supabase/functions/`, adapters and control scripts. Shared auth/runtime helpers, root lockfiles, migration ordering and root control registers have one assigned writer at a time. One integrator or explicitly assigned release operator performs provider writes and deployment. A domain worker may draft a reviewed migration in an isolated branch but must not independently apply it to the shared backend. Never generate migration filenames manually; the assigned writer uses the installed CLI after inspecting its help and current target history.

Default custody: MAP-01 maintains runtime/auth/session, capability enforcement and generic audit/RLS infrastructure. MAP-02 maintains the shell/router/Home/styles and shared context/form behavior. MAP-05 maintains directory domain APIs/pages. MAP-06 maintains the complete content-ingest, private-object transport, clearance and document lifecycle, with MAP-01 security review. Keep upload-to-release ownership together. For one atomic draft-loss repair, the integration lead may allocate `runtime.tsx` and related UI files to one bounded writer with MAP-01 review. Exact current allocation governs; default custody is not permanent exclusive write permission.

## 4. Published interfaces

These are coordination IDs, not promises of new endpoints. Each actual endpoint remains declared in its owning source contract.

| Interface | MAP-01 produces | Consumers must provide and preserve |
| --- | --- | --- |
| IF-01 Identity and scoped context | Verified subject/profile semantics, session lifecycle, authorized account/facility context | MAP-02 and every domain pass selected scope as a request constraint, never as authority. Selection must remain within currently permitted records. |
| IF-02 Capabilities | Explicit capability/action and scope evaluation, deny precedence | Domain owner names the exact action, record and narrower scope; administrative labels and module visibility cannot grant authority. |
| IF-03 Versioned rules | Controlled rule/template identity, version and effective configuration boundary | MAP-03/04/05/06 provide domain validation and bind records to the version actually used. |
| IF-14 Audit | Actor provenance, protected history and safe correlation conventions | Every consequential command supplies its documented event/object/version meaning; clients cannot choose actor or authoritative timestamp. |
| IF-20 Data lifecycle and recovery | Stable-reference, retention/hold/restriction and recovery requirements | MAP-06 preserves document/version/object links; MAP-07 reconciles peers; MAP-08 proves restore outcomes. |
| IF-18 UI action/view, consumed from MAP-02 | Platform exposes safe errors and current context/capability results | MAP-02 represents loading, denied, expired, failed and conflicted states without fake success or data loss. |
| IF-19 Verification/checkpoint, consumed from MAP-08 | Source and risk-specific evidence inputs | MAP-01 hands off exact migration/config/adapter identities, affected security invariants and unresolved deployment limits. |

## 5. Identity and access logic

The implemented directory predicate is:

`verified subject AND linked active profile AND active account_access AND explicit nonrevoked capability at the requested scope`.

Identity status is `active`, `suspended` or `removed`. Membership status is `invited`, `active`, `suspended` or `removed`. A nonactive identity denies all accounts. A nonactive membership denies that account even if another legacy role row remains. Unknown capability or scope, null linkage and absent membership deny. Database state is reevaluated on the request; an old JWT role claim cannot override revocation.

For the existing directory, `view_account` grants only the account identity/name. `view_asset` requires either an exact same-account facility grant or an explicit `all_facilities` grant, plus account-read permission. Account selection does not create facility access. Program/portfolio membership, matching addresses and integration identity do not silently broaden access.

Existing `user_profiles.id` stays stable. `auth_user_id` is uniquely linked, nullable and guarded by immutable `auth_linked_once` history. Auth deletion does not delete the business profile/history. Do not “fix login” by relinking a historical profile or resetting its history. A general recovery/relinking path needs its own reviewed contract and permitted/denied tests.

An invitation is a server-owned, intended-recipient, scoped operation. Public signup, matching email domain or editable user metadata cannot create membership. Preserve the owner's specific onboarding contract in `repo:docs/03-data/OWNER_ONBOARDING.md`. Its fixed development capabilities do not include scientific review, release, signing, finance or broad grants.

### Backend enforcement checklist for each domain slice

1. Identify account ownership and narrower facility/project/object scope. Use tenant-safe references; a UUID alone is not an access check.
2. Define permitted read columns as well as rows. Enforce RLS and explicit privileges together for exposed tables; preserve private schema boundaries.
3. Evaluate actor, membership, capability, record state, revision and business authority in the transaction that changes the record.
4. Deny reassignment to another account or unrelated parent unless an explicit reviewed transition allows it. Check old and new state.
5. Verify views, joins, search, counts, exports and object retrieval preserve the same isolation. UI filtering is presentation only.
6. Keep service-role secrets and trusted provisioning server-only. A system operation must not impersonate a professional reviewer or human signer.

Source: `repo:docs/03-data/ADR-002-RUNTIME-FOUNDATION.md`, `repo:docs/04-security/RLS_POLICY_MATRIX.md`, `repo:config/policy-defaults.json`.

## 6. API and record contract

### Existing directory queries

`loadRuntimeContext()` verifies the Auth user and loads only the permitted profile. `listAccounts({afterId?, limit?})` and `listFacilities({accountId, afterId?, limit?})` use ordered UUID cursors. The current adapter defaults to 50 records, allows 1–100, fetches one extra and returns `nextCursor`. A forbidden RLS-filtered list may be an empty success, not an HTTP 403. Never reveal whether a guessed inaccessible object exists. MAP-02 must consume pagination; a first page is not the full directory.

The current safe error codes are `configuration`, `storage`, `validation`, `session_expired`, `access_unavailable`, `credentials`, `network` and `backend`. Provider SQL, token fragments and raw payloads do not reach the UI. If a domain needs an explicit stale-revision/conflict outcome, add it through a reviewed adapter/shared-error change; do not pretend it already exists in this enum.

### Required target for each mutating domain command

The owning map writes the exact operation contract before implementation: actor derived from verified context; account and record identity; expected current revision/state where concurrency matters; allowlisted input fields; idempotency key when a retry can duplicate an effect; server-generated result IDs/time; authoritative returned revision; and a safe domain error. These are required semantics, not a mandated new generic payload or service.

Within a transaction, recheck access and domain authority, lock or compare the relevant revision, validate the transition, update the owning records and append the required audit event. If the command fails, roll back the business mutation. A stale approval/signature/release request cannot silently target the newest version. A repeated request must reproduce the already-established result or produce a documented conflict, not repeat spending, signing, release or export side effects.

External calls cannot be made atomically true by a database transaction. MAP-06/07 must define the specific pending/confirmed/failed/reconciliation behavior for the actual provider action before enabling it. Do not add a global message bus, generic scheduler or new infrastructure merely to satisfy this paragraph.

## 7. Governed rules and module configuration

The original rules/ontology purpose remains in Core and the owning domains. It is not a 21st module.

| Configuration family | Domain owner of meaning | Core responsibility |
| --- | --- | --- |
| Questions, issue/intent routing, scope limitations and methods | MAP-03 | Version identity, protected publication, reference integrity |
| ROM variables, agreement clauses, authority/coverage parameters | MAP-04 | Controlled version/effective range and permissions; never invent live rates/caps |
| Account/program module visibility, dashboard defaults and readiness presentation | MAP-05 with MAP-02 | Account/program configuration without one-off client tables; flags do not authorize |
| Document classifications, template blocks and review/release constraints | MAP-06 | Shared version/provenance and access protections |

Target logic: create a draft configuration version, validate it against the owning workflow, record the authorized change, make the version available to new eligible work, and preserve references used by existing approved records. Editing current defaults never rewrites an old scope, estimate, agreement, signed revision or released document. The domain owner defines whether a change requires a new revision or explicit amendment. Only approved effective terms establish business coverage.

Configuration editing is not a backdoor to create new roles, waive qualifications, alter historical release audiences or grant commercial authority. Activation binds to the applicable existing OD records. Development-only defaults stay distinguishable from approved live values.

## 8. Audit, denials and investigations

The current access audit appends events inside the source transaction for profile, account-access and capability changes. It distinguishes `legacy_fixture`, `user` and `system`; the checked system key is `database_privileged_operation`. User provenance requires the trusted gateway/session context and linked active subject. Database IDs/time/correlation are authoritative. Client and service-role direct audit writes are denied. No-op bookkeeping or display-name-only changes are not meaningful access events.

Its current `correlation_id` correlates one changed row, including both sides of a checked account move. It is not a universal HTTP request ID or total event ordering. Timestamps may tie. Do not use timestamp sorting as proof of exact causal order across commands.

Important uncovered boundary: RLS-filtered reads do not fire row-change triggers; a transaction that rolls back also rolls back an audit insert. A future consequential-denial design must use a reviewed trusted collection path that survives the denied operation where required. It must not add a caller-spoofable audit endpoint or capture every document body in logs. Define the precise event family and minimum safe metadata first, then prove delivery/failure behavior.

Target investigations show only authorized audit scope and link exact object/version identifiers, actor kind, observed event, safe reason and correlation. Audit export is itself a restricted action with an event. Do not copy secrets, raw JWTs, PHI, arbitrary request bodies or sensitive content into diagnostics. No new retention duration or destruction authority is implied.

Append-only application controls do not make data tamper-proof against a fully privileged database owner. State the trust boundary accurately. An audit-sink failure aborts the protected mutation in the implemented trigger path; MAP-08 must expose operational failures to the named support owner.

## 9. Session, state and privacy handoff to MAP-02

Current source deliberately unmounts the authenticated subtree during every runtime recheck. The audit reproduced clearing unsaved drafts on route/recheck/visibility paths and direct sample replacement. A repair must preserve secure revalidation and useful work together.

Required joint behavior:

- Differentiate same-subject background verification from confirmed sign-out, changed identity, lost membership and changed account. Do not treat every successful same-user refresh as a brand-new editing session.
- Preserve or explicitly recover unsaved input when the same authorized person returns. Before internal navigation, account/facility changes or sample replacement, offer the relevant save/discard/cancel handling through MAP-02.
- Isolate draft/cache keys by subject, account, facility and object/revision where relevant. Never leak a prior person's values into another login or selected account.
- On confirmed revocation/sign-out, prevent new protected reads/writes and clear protected display/cache data. A draft recovery scheme must not retain accessible sensitive data for a revoked user. Define any permitted recovery route before adding durable browser drafts.
- Ignore stale requests and late callbacks from superseded auth generations. Preserve existing locked-sign-out and callback-token handling guarantees.
- Error and retry must not imply saved data. Successful writes read back or reconcile the authoritative returned record before advancing the workflow.

Use `baseline:02-experience/UI_AUDIT.md` and its reproduction evidence for the observed failures. Do not extend a session duration or reduce verification merely to hide remounting. A time-policy change would require its own reviewed identity/security contract.

## 10. Data lifecycle and recovery contract

Stable business history survives identity deletion and ordinary document replacement. Preserve references to exact versions and bytes. A new draft does not remove the prior release. Retention hold controls destruction; visibility restriction/withdrawal controls access. These are separate states owned with MAP-06.

No automated permanent destruction or retention period is approved by the current defaults. No PHI is permitted in v1. Suspected PHI follows quarantine and authorized human review, never AI processing or demo fixtures. Production client onboarding remains gated by applicable tested access/release controls and owner policy, not a module toggle.

MAP-08 consumes IF-20 to restore a consistent source/config/database/object set, preserve history, reapply current revocations, and reconcile external effects. Old backups must not revive removed-user access or repeat notifications, signing or financial actions. MAP-07 supplies peer reconciliation; domain teams supply invariants. Do not treat a source archive or successful backup upload as an operational restore proof.

## 11. Bounded implementation slices

These are proposed packets to map into the existing queue, not a new live queue. Dependencies refer to accepted interfaces and concrete slices, not completion of entire maps.

| Slice | Deliverable and owning files | Can begin when | Required dependency before acceptance |
| --- | --- | --- | --- |
| MAP-01-S01 | Reconcile current identity/schema/runtime source and define IF-01/02/14/20 deltas; current contracts and safe source inventory | Current source pins and assigned paths exist | MAP-08 source reconciliation agrees; no source/provider parity assumption |
| MAP-01-S02 | Joint session/context fix with MAP-02 in `web/src/lib/runtime.tsx`, auth persistence and allocated state owners | Reproduction and IF-01/18 behavior are agreed | UI save/recovery and security revocation tests both pass; same-user return preserves work |
| MAP-01-S03 | Extend scoped identity/access administration or specific recovery increment, separately bounded | An actual use case, IF-02 permission contract and OD development assumptions are recorded | Independent auth review, authentic allowed/denied API evidence; no owner fixture reuse |
| MAP-01-S04 | First governed configuration vertical slice supporting a ready domain journey | Owning MAP-03/04/05/06 defines its first real rule/version need | Old approved record remains bound to old rule; new eligible record uses selected version |
| MAP-01-S05 | Restricted cross-module search over a defined initial authorized record set | Owning queries and IF-04/05/08/09 projections exist for that set | Direct negative retrieval/snippet/count/export tests; other source types remain explicitly unconnected |
| MAP-01-S06 | Audit expansion for one consequential domain command and one defined denial path | That command's transition and failure modes are fixed | Protected provenance, safe payload, failure behavior and investigation usability demonstrated |
| MAP-01-S07 | Recovery/lifecycle implementation for the candidate's real records and objects | Domain retention/visibility contracts and IF-20 inventory exist | MAP-08 isolated restore and revoked-user/side-effect reconciliation pass |

Shared schema review is a short dependency, not a reason to idle all domain teams. Work on isolated domain code, contract fixtures, UI states and tests may continue while a specific provider or credential step is blocked. No slice claims full M01/M19/C01 completion until the exact product criteria and required evidence are covered.

## 12. Handoff and exit evidence

Deliver the exact commit/PR, changed paths, migration order, interface revisions, tested actor/scope matrix, evidence profile IDs, configuration assumptions, remaining limits and first unfinished action. MAP-08 accepts current evidence at its declared environment. MAP-02 verifies user-facing errors and recovery. Domain consumers confirm their contracts are compatible.

A separate chat cannot assume it sees another chat's working files or messages. Exchange actual shared repository branches/PRs and versioned contract handoffs, or explicitly supplied patch files when repository access is unavailable. Read back the actual remote before claiming source is shared. Do not mark this map finished because its document exists, its UI pages render or its local fixtures pass.

## Source anchors

- `repo:REQUIREMENTS.json`: M01, M19, C01 and dependent C04/C07 criteria.
- `repo:docs/03-data/ADR-002-RUNTIME-FOUNDATION.md`: architecture, exact identity/directory and session contracts.
- `repo:docs/03-data/ACCESS_AUDIT_IMPLEMENTATION.md`: implemented provenance and unimplemented denial/investigation limits.
- `repo:docs/03-data/OWNER_ONBOARDING.md`: dedicated owner bootstrap and protected workflow.
- `repo:web/src/lib/runtime.tsx`, `repo:web/src/lib/auth-storage.ts`, `repo:web/src/lib/directory-api.ts`, `repo:web/src/lib/errors.ts`: current adapter/runtime behavior.
- `repo:config/policy-defaults.json`, `repo:OWNER_DECISIONS.json`: development defaults and live decision boundaries.
- `repo:docs/09-release/BACKUP_RECOVERY_PLAN.md`: recovery inventory and restore rules.
- `baseline:00-reconciliation/RECONCILED_STATUS.md`, `baseline:02-experience/UI_AUDIT.md`, `baseline:04-assurance/VERIFICATION_AND_RELEASE_CONTRACT.md`: frozen state, reproduced defects and targeted control corrections.

## Canonical acceptance accountability

The following exact criteria belong to this map. Axx is a reference alias for the ordered criterion in the pinned `repo:REQUIREMENTS.json`, not a new live requirement ID or a completed-status claim. Preserve all required evidence levels in the source. Collaborating maps and hashes are in `coverage/ACCEPTANCE_OWNERSHIP.json`.

### M01

- **M01.A01** — reusable platform services are consistently used across modules.
- **M01.A02** — account/program module visibility can differ without creating client-specific tables.
- **M01.A03** — shared configurations that affect scope, pricing, authority, or release carry controlled versions.
- **M01.A04** — identifiers and cross-object links remain stable.
- **M01.A05** — feature flags never serve as authorization. Domain business logic resides in its owning module.
- **M01.A06** — Permission-filtered global search finds only authorized objects and content.
- **M01.A07** — Governed rules/template administration versions question banks, routing, scope limitations, agreement blocks, ROM variables and dashboard defaults without retroactively changing approved work.

### M19

- **M19.A01** — consequential state changes and denials produce usable, protected history.
- **M19.A02** — audit events correlate to exact records and versions.
- **M19.A03** — events cannot be casually changed/deleted.
- **M19.A04** — access to the log itself is restricted.
- **M19.A05** — sensitive payloads/secrets are not copied into logs.
- **M19.A06** — exports and incident investigations can reconstruct what happened.
- **M19.A07** — background/system actors are represented explicitly.

### C01

- **C01.A01** — An inactive user or membership is denied even with another role row and a previously issued session.
- **C01.A02** — Cross-account and unassigned-facility reads, writes, joins, exports, object paths and dashboard aggregates are denied server-side.
- **C01.A03** — Technical administrators do not gain implicit scientific, signature or release authority.
