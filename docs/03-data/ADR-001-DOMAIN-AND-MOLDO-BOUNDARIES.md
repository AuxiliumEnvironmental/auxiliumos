# ADR-001: domain ownership, effective versions and independent Moldo
Date: 2026-10-08. Product direction is owner-provided; implementation contracts below are proposed engineering decisions for development. They do not assert existing runtime integration.

## Operating model
AuxiliumOS owns group-level enterprise accounts, programs/MSAs, portfolio context, cross-service oversight and their own authorized records. Moldo owns its daily mold engagement workflow and essential operational records. Moldo staff and Moldo-only managers work solely in Moldo. Explicitly authorized Auxilium management and enterprise clients see an audience-scoped projection through OS. There is no automatic OS user creation from Moldo identities.

The original shared data spine remains canonical within the OS. It does not require a merged Moldo database or permit two systems to edit the same authoritative field. An operating company/brand/holding entity is distinct from a client account. Do not repurpose client_accounts as the legal-entity table. Software separation supports optional future sale but cannot determine entity structure, IP ownership or contractual transfer rights; OD-016 captures those activation decisions.

| Information or action | Source owner | Integration contract |
| --- | --- | --- |
| OS enterprise account/program/portfolio and facility entitlement | OS | Send the minimum authorized assignment context with external IDs. |
| Moldo engagement execution, appointments, field findings and native commercial workflow | Moldo | Publish permitted state and references; OS does not rewrite native workflow. |
| Contracting party, signer, authorization and billing for an engagement | Explicitly recorded per engagement | One commercial authority; do not coerce Moldo's commercial model into an invented OS T&M estimate. |
| Technical report and review provenance | Originating qualified workflow | Transfer only appropriately reviewed/released versions and audience metadata. OS release can be narrower, never broader than the source grant. |
| OS executive metrics and QBR | OS projection | Reproducible authorized source references and sync freshness; unknown is not zero. |
| Identity and access | Each application independently | External identity mapping is not a permission grant; revoke connector and user access independently. |

## Connector behavior
Use versioned API/event contracts, stable external IDs, explicit schema version, source revision, account/engagement mapping, event ID and correlation ID. Least-privilege server credentials cannot reach entire databases. Define per-field ownership and compare expected revision before applying updates. Duplicate delivery is idempotent; out-of-order messages cannot roll back newer state. Record failures, retries, dead-letter review and reconciliation. Validate audiences at read time as well as sync time. Never replicate secrets, PHI, draft technical conclusions or broad internal notes by default.
OS may create a scoped engagement request; Moldo accepts/rejects it in its own workflow. Acceptance and mobilization still require their actual authority. Ordinary Moldo work survives OS outage. The connector can be disabled; both sides retain exportable essential records and reconcile final versions. Simulate disconnection, revocation and duplicate/out-of-order updates before live activation. Review actual current Moldo code/contracts before implementing an adapter; this archive contains no Moldo integration.

## Data refinements before dependent implementation
1. Incident is the event/context; Project Request is a submission that may result in work. One Incident can have multiple requests/projects. Some routine requests need no artificial incident. Current incident_requests is a development foundation; design an additive migration preserving IDs/history, never a blind rename or destructive reset.
2. Program/MSA and Portfolio are optional relational layers. Ordinary work must not invent enterprise rows. Assets may appear in permitted portfolio groupings. Address matching alone must never merge clients or grant access.
3. Identity status, membership lifecycle, assigned scope and capability are separate. A removed_suspended role row alone is insufficient because another role could remain. Inactive status must deny regardless of other roles/session cache.
4. Deliverable is the required work product; DocumentVersion is an immutable file/content revision. Review and release records refer to exact versions and checksums. A replacement draft leaves current release intact until the replacement is validly released. Withdrawal and supersession remain separate.
5. A preservation hold prevents destruction; visibility restriction controls access. They are distinct and independently authorized.
6. Effective approved agreements/scopes including valid amendments govern their domain. The historical static rank must not let an original override a later authorized amendment. Preserve original records, effective dates, who approved what and revocation/supersession links. Commercial approval cannot rewrite measured scientific facts.
7. Resolve global/account/program/project configuration by explicit permitted override and immutable version. A more local override cannot expand authority beyond its approver's grant.

## Architecture and scale
Start with clear domain boundaries and contracts in a maintainable modular application. Decide the actual production frontend after reconciling current GitHub and the separate Lovable prototype; do not assume both are the same app. Isolate external adapters, background jobs and document processing. Measure real permission-filtered workloads, storage volumes and queue behavior before introducing additional services. Keep source, migrations and portable exports owner-controlled. The end-state module list is fixed unless the owner changes it; deployment topology is an engineering choice.

## Acceptance
REQUIREMENTS.json M20, C01-C03 and C06 carry the behavioral contracts. Prove isolation, revocation, exact-version release, effective amendments, duplicate/out-of-order handling and separation with runtime tests. No claim of sale-readiness or production integration follows merely from this ADR.
