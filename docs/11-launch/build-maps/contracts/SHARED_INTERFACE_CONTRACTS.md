# Shared interface contracts

These 20 handoffs connect the maps. Read the detailed domain map and existing source contract before implementation. This register fixes semantic ownership and minimum proof; it is not a generated API specification or a claim that future domain workflows exist. Do not replace actual current RPC names/fields with the prose below.

For the next slice only, bind the relevant existing schema/operation or review the missing schema with its producer and consumers. Record actor/context checks, fields/types/nullability, revision/state examples, errors/retry behavior and matching tests in existing domain documentation. The integration lead accepts the exact version before dependent writers proceed. Do not wait for all twenty future contracts to be designed.

## IF-01 · Identity and active context

Producer: **MAP-01**. Consumers: MAP-02, MAP-03, MAP-04, MAP-05, MAP-06, MAP-07, MAP-08.

**Baseline:** Implemented foundation; context continuity has reproduced defects.

**Input:** Verified authenticated subject and session generation; permitted account/facility selection; active membership and access generation.

**Result:** Authenticated/unauthenticated/revalidating/denied/error identity state with permitted context and current access evidence; no invented authority from a role label.

**Authority and revision:** Server derives actor. Selection is not authorization. Revalidate same subject without unnecessary loss of work; identity change or lost access invalidates protected views and cached data.

**Failure and retry:** Separate transient verification failure from sign-out and revocation. Never serve stale protected content as a recovery shortcut. Ignore obsolete async results after identity/context change.

**Proof:** Same-user return preserves an authorized draft; sign-out, revoked membership and changed user cannot reveal previous protected state.

Sources: `repo:docs/03-data/ADR-002-RUNTIME-FOUNDATION.md`, `repo:web/src/lib/runtime.tsx`.

## IF-02 · Scoped capability decisions

Producer: **MAP-01**. Consumers: MAP-02, MAP-03, MAP-04, MAP-05, MAP-06, MAP-07, MAP-08.

**Baseline:** Implemented scoped directory/intake/document families; later domains require owning checks.

**Input:** Current authenticated actor, exact action, owning record/context and effective domain revision.

**Result:** Server allow/deny and a safe UI explanation appropriate to the actor; minimum necessary record projection.

**Authority and revision:** Active membership, scoped capability, qualification, review authority, signature and spending delegation remain distinct. Feature visibility never grants permission.

**Failure and retry:** Fail closed on missing/unknown policy. A denied object cannot leak title, count, search snippet or another tenant identifier. Recheck before consequential execution.

**Proof:** Direct API/database allowed and denied actors, mixed roles, revoked membership, cross-context joins/counts/exports and stale session paths.

Sources: `repo:docs/03-data/ADR-002-RUNTIME-FOUNDATION.md`, `repo:docs/04-security/RLS_POLICY_MATRIX.md`.

## IF-03 · Versioned configuration and rules

Producer: **MAP-01**. Consumers: MAP-02, MAP-03, MAP-04, MAP-05, MAP-06, MAP-07, MAP-08.

**Baseline:** Development defaults exist; governed authoring/runtime contracts remain incomplete.

**Input:** Configuration family, owner domain, draft values, source/provenance, applicability and expected revision.

**Result:** Immutable approved/effective configuration version and permitted editor/read model; prior effective versions retained.

**Authority and revision:** Platform owns common version mechanics. Owning domain controls meaning and authority. New versions do not rewrite approved scopes, terms, reports or signed records.

**Failure and retry:** Reject invalid combinations and stale edits. Show unresolved/provisional values; never silently fill live rates, scientific thresholds, retention or authority.

**Proof:** Old approved work reopens under its bound version; new work deliberately selects valid effective configuration; unauthorized policy publication fails.

Sources: `repo:config/policy-defaults.json`, `repo:REQUIREMENTS.json`, `repo:docs/02-ontology/RELATIONSHIP_TAXONOMY.md`.

## IF-04 · Account, facility and enterprise directory

Producer: **MAP-05**. Consumers: MAP-01, MAP-02, MAP-03, MAP-04, MAP-06, MAP-07, MAP-08.

**Baseline:** Account/facility reads implemented; richer domain CRUD/enterprise context still target.

**Input:** Scoped actor/context, search and cursor; optional program/portfolio; stable account, facility, zone and relationship references.

**Result:** Permitted directory page with stable IDs, explicit nulls/unknowns, cursor and applicability; versioned domain edits through owning commands.

**Authority and revision:** Account, parent structure, physical asset and site contact are different entities. Optional program/portfolio cannot become mandatory fake records. Facility access never follows from arbitrary client input.

**Failure and retry:** Treat an empty permitted result, including RLS-filtered absence, as a normal empty result without revealing hidden matches; distinguish transport failure and unfinished pagination. Context changes cannot mix two account results or discard useful input without handling.

**Proof:** Multi-account allowed/denied reads, paginated discovery, empty/error state and link-preserving updates; no cross-account search/count leakage.

Sources: `repo:web/src/lib/directory-api.ts`, `repo:docs/03-data/ADR-002-RUNTIME-FOUNDATION.md`, `repo:docs/01-product/DATA_SPINE.md`.

## IF-05 · Intake and triage

Producer: **MAP-03**. Consumers: MAP-02, MAP-04, MAP-05, MAP-06, MAP-07, MAP-08.

**Baseline:** Persisted synthetic request/triage foundation exists; complete downstream operational chain remains target.

**Input:** Original client request, selected permitted site, answers/attachments references and submission token; separate internal triage revision.

**Result:** Durable request/optional incident identity, original submission, reviewed classification, owner, state and next action.

**Authority and revision:** Preserve original narrative. Incident and project request are distinct. Triage is not approved scope or mobilization. Dynamic prompts distinguish client observations from professional determinations.

**Failure and retry:** Preserve form after validation/network failure; safe submit retry returns one accepted request. Reject stale triage and cross-account links; no PHI goes to development tools.

**Proof:** Actual submit/readback/reopen, internal triage with preserved source, duplicate/stale retry and unauthorized transition tests.

Sources: `repo:docs/03-data/INTAKE_RUNTIME_CONTRACT.md`, `repo:docs/05-workflows/REQUEST_STATE_MACHINE.md`.

## IF-06 · Scope and sampling revisions

Producer: **MAP-03**. Consumers: MAP-02, MAP-04, MAP-05, MAP-06, MAP-07, MAP-08.

**Baseline:** Target domain workflow; current planner is not an approved scope/sampling record.

**Input:** Preserved intake facts; selected services/methods, assumptions, limitations, areas, sampling basis and governed template versions; expected revision.

**Result:** Versioned proposed/reviewed/approved/effective scope and sampling records; exact prerequisites, exclusions, deliverable obligations and change lineage.

**Authority and revision:** Qualified human makes professional determination. Approval binds exact revision. Valid later amendment can become effective while preserving original. Proposed quantities do not confer authority.

**Failure and retry:** Incompatibilities, missing basis and unavailable qualified review stay explicit. Concurrent amendment conflicts cannot silently overwrite or retroactively update commercial commitments.

**Proof:** Original versus amended scope, forbidden scientific approval, changed sampling basis and exact downstream revision binding through ROM/authorization.

Sources: `repo:docs/05-workflows/SCOPE_STATE_MACHINE.md`, `repo:docs/02-ontology/SAMPLING_ENGINE.md`, `repo:docs/03-data/ADR-001-DOMAIN-AND-MOLDO-BOUNDARIES.md`.

## IF-07 · ROM, agreements and authorization

Producer: **MAP-04**. Consumers: MAP-02, MAP-03, MAP-05, MAP-06, MAP-07, MAP-08.

**Baseline:** Target domain workflow; planning forms have no signature or spending effect.

**Input:** Exact scope/sampling revision, approved rate/configuration version, applicable MSA, intended signer and delegation, terms/caps and amendment basis.

**Result:** Traceable indicative ROM; exact agreement content and effective authorization predicate with scope, amount, period and exceptions.

**Authority and revision:** ROM is nonbinding until proper authorization. MSA coverage is evaluated per work; a label does not grant it. Signature and technical approval are separate. Emergency path needs its configured authority.

**Failure and retry:** Reject expired/insufficient authority and stale terms. Retry cannot duplicate a signature obligation or money action. Ambiguous provider success is reconciled by stable external identity.

**Proof:** Estimate versus binding distinction, unauthorized/expired signer, altered content after review, valid change and operational mobilization denial before effective authority.

Sources: `repo:docs/05-workflows/AGREEMENT_AUTHORIZATION_WORKFLOW.md`, `repo:docs/03-data/ADR-001-DOMAIN-AND-MOLDO-BOUNDARIES.md`, `repo:OWNER_DECISIONS.json`.

## IF-08 · Projects, tasks and controlled changes

Producer: **MAP-03**. Consumers: MAP-02, MAP-04, MAP-05, MAP-06, MAP-07, MAP-08.

**Baseline:** Target domain workflow with existing source specifications.

**Input:** For engagement conversion or field execution: exact effective scope/authorization, site/area, qualifications and work prerequisites. For administrative, intake-review, readiness or QBR tasks: permitted source context, task capability, accountable actor and due/review basis, without requiring a commercial agreement.

**Result:** Project/tasks/work orders, assigned accountable actor, prerequisites, observed progress, exception/change request and closeout readiness.

**Authority and revision:** Effective engagement authority gates project conversion, mobilization and authorized field work. Administrative/review/readiness/QBR tasks use their own scoped capability and source context; creating or completing one does not change professional or commercial authority. Execution cannot expand scope/cap from a message or field note. Required deliverable fulfillment belongs here; exact content/release remains IF-09.

**Failure and retry:** Missing prerequisite blocks affected work with responsible next action. Record field facts without treating them as approved amendments. Retry/partial failure preserves completed actions and history.

**Proof:** Authorized mobilization through assignment, field exception, controlled amendment, required evidence and truthful closeout; blocked work remains blocked.

Sources: `repo:docs/01-product/DATA_SPINE.md`, `repo:docs/03-data/ADR-001-DOMAIN-AND-MOLDO-BOUNDARIES.md`, `repo:docs/05-workflows/CHANGE_AUTHORIZATION_WORKFLOW.md`.

## IF-09 · Private content and exact-version document lifecycle

Producer: **MAP-06**. Consumers: MAP-01, MAP-02, MAP-03, MAP-04, MAP-05, MAP-07, MAP-08.

**Baseline:** Substantial synthetic database/API/UI contracts exist; complete authentic hosted lifecycle not proven in baseline.

**Input:** Permitted context and object reservation, admitted bytes/hash/type, clearance decision, immutable adoption, review and explicit audience release bound to exact version.

**Result:** Exact immutable object/version identity, review and release receipts, current authorized metadata and byte retrieval; withdrawal/replacement/hold/restriction facts separately.

**Authority and revision:** MAP-06 owns ingest through recipient read; MAP-01 reviews security. Storage location and checksum are not release authority. New draft does not supersede released version. Current authority is checked for retrieval.

**Failure and retry:** Partial upload/finalization, corruption, missing object, unscanned content, stale review and revoked audience fail safely with honest recoverable state. Never substitute a different version or public URL.

**Proof:** Actual hosted admitted upload through clearance/adoption/review/release/exact recipient bytes; wrong recipient and withdrawn/restricted/changed-version paths denied.

Sources: `repo:docs/03-data/DOCUMENT_VERSION_CONTRACT.md`, `repo:docs/03-data/DOCUMENT_VERSION_RELEASE_CONTRACT.md`, `repo:docs/03-data/ADR-003-PRIVATE-OBJECT-BOUNDARY.md`.

## IF-10 · Contextual communications and notifications

Producer: **MAP-06**. Consumers: MAP-02, MAP-03, MAP-04, MAP-05, MAP-07, MAP-08.

**Baseline:** Target domain workflow; preparation text is not sent communication.

**Input:** Scoped context, author/audience, message/thread, attachment version references and notification intent with source transition identity.

**Result:** Preserved thread and audience history, delivery/status evidence, acknowledged next action and controlled escalation to owning domain workflow.

**Authority and revision:** Internal, client and vendor audiences are distinct; attachment access is not granted by a message. Conversation cannot change scope, sampling, caps, signatures or release. External sending follows OD-017.

**Failure and retry:** Queued/sent/delivered/failed/read are distinct. Retries suppress duplicate external effects. Revocation and audience change recheck source visibility; failures do not erase authored content.

**Proof:** Wrong audience/attachment denial, thread context, duplicate delivery, failed provider recovery and explicit conversion of a request into a separately authorized domain action.

Sources: `repo:REQUIREMENTS.json`, `repo:docs/01-product/MODULE_MAP.md`, `repo:OWNER_DECISIONS.json`.

## IF-11 · Vendor assignments and operational finance

Producer: **MAP-04**. Consumers: MAP-02, MAP-03, MAP-05, MAP-06, MAP-07, MAP-08.

**Baseline:** Target domain workflows; exact vendor/finance authority must be implemented.

**Input:** Qualified vendor and commercial model, permitted assignment/revision, approved obligations, invoices/reserves/cost evidence and stable external references.

**Result:** Scoped assignment with minimum authorized documents; qualified acceptance/progress; traceable commitment, actual, variance and reconciliation projections.

**Authority and revision:** Assigned work does not expose an account-wide portal. Estimate, authorized cap, commitment, actual, invoice and payment are separate. Owner-approved model/rates govern live actions.

**Failure and retry:** Duplicate invoices/provider callbacks are idempotent; disputed or stale costs remain visible. Out-of-order status cannot erase settled history or silently charge/pay.

**Proof:** Vendor limited to assigned work; qualification lapse; cap variance; duplicate and partial provider records; finance totals reconcile to authorized source records.

Sources: `repo:REQUIREMENTS.json`, `repo:docs/06-ui/VENDOR_PORTAL_MAP.md`, `repo:docs/01-product/MODULE_MAP.md`.

## IF-12 · Readiness, reports and enterprise projections

Producer: **MAP-05**. Consumers: MAP-02, MAP-03, MAP-04, MAP-06, MAP-07, MAP-08.

**Baseline:** Target domain workflow; private planning values are not operational readiness/reporting.

**Input:** Permitted site/program/portfolio, governed readiness criteria, current facts, source dates, authorized documents and finance/workflow projections.

**Result:** Actionable readiness gaps with accountable follow-up; source-linked dashboards/QBR/export with explicit definitions, freshness, denominator and unavailable/unknown values.

**Authority and revision:** A dashboard does not own the underlying truth or infer scientific clearance. Missing is not zero; expired is not current. Executive access and document release remain scoped.

**Failure and retry:** Partial upstream data shows gaps and timestamps; no invented healthy score. Recalculation must not rewrite source decisions. Export redacts unavailable rows and restricted attachments.

**Proof:** Known versus unknown/expired readiness; metric-to-source reconciliation; account/portfolio scoping; report freshness and denied export; follow-up closes against real evidence.

Sources: `repo:REQUIREMENTS.json`, `repo:docs/01-product/END_STATE_BLUEPRINT.md`, `repo:docs/06-ui/EXECUTIVE_PORTAL_MAP.md`.

## IF-13 · Runtime AI draft and adoption boundary

Producer: **MAP-06**. Consumers: MAP-01, MAP-02, MAP-03, MAP-04, MAP-05, MAP-07, MAP-08.

**Baseline:** Historical planned scope; current AI form does not establish live provider integration or owner approval.

**Input:** Explicitly allowed function, current actor/context, permitted source versions and chosen provider/data-use policy after required decision.

**Result:** Clearly labeled draft/suggestion or bounded retrieval result with source attribution, uncertainty, provenance and a separate human adoption action.

**Authority and revision:** Historical functions include classification, missing-info flags, summaries, scope/QBR drafting, routing and search. No autonomous scientific, commercial, release or permission authority. Coding agents and deterministic rules are separate.

**Failure and retry:** Untrusted source instructions stay data. Denied/stale sources cannot enter context. Provider timeout/cost limit fails without harming core workflow; no unsupported confident output or hidden automatic action.

**Proof:** Scoped source retrieval, injection resistance, unsupported-answer handling, source freshness and draft adoption through ordinary owning-domain permission/revision checks; real-data use remains gated.

Sources: `baseline:01-product/AI_PROVENANCE_AND_BOUNDARIES.md`, `repo:OWNER_DECISIONS.json`, `repo:docs/08-ai/AI_TOOL_RULES.md`.

## IF-14 · Audit and provenance

Producer: **MAP-01**. Consumers: MAP-02, MAP-03, MAP-04, MAP-05, MAP-06, MAP-07, MAP-08.

**Baseline:** Append-only server provenance implemented for named families; full denial/investigation coverage remains target.

**Input:** Trusted server actor/context, actual operation and result, target/revision identities, reason and correlation identity at declared capture boundary.

**Result:** Protected append-only event with attributable timestamp/source; permitted investigation/search projection and retention/hold links.

**Authority and revision:** Client-supplied actor cannot forge trusted provenance. Preserve before/after meaning without logging secrets or unnecessary sensitive content. Same-transaction rollback does not automatically preserve denied events.

**Failure and retry:** Declare how consequential denials are captured durably outside rolled-back mutation. Audit failure follows reviewed domain policy; never silently claim full logging from row triggers alone.

**Proof:** Forgery/update/delete attempts denied; allowed changes attributable; chosen consequential denials retained; investigation correctly scoped; hold and restriction remain separate.

Sources: `repo:docs/03-data/ACCESS_AUDIT_IMPLEMENTATION.md`, `repo:REQUIREMENTS.json`.

## IF-15 · External adapter exchange

Producer: **MAP-07**. Consumers: MAP-01, MAP-03, MAP-04, MAP-05, MAP-06, MAP-08.

**Baseline:** Target adapter rules with selected source contracts; no new paid platform selection implied.

**Input:** Versioned allowed purpose, peer identity, scoped credential, owning object revision, minimal payload and stable operation identity.

**Result:** Mapped source/peer IDs, receipt/outcome, supported schema version and reconciled delivery state; no direct bypass of owning validation.

**Authority and revision:** Each field has one system of record. Permission and commercial authority cannot arrive solely from an external payload. Secret credentials stay server-side and can be revoked independently.

**Failure and retry:** Validate schema, identity, replay and bounds; handle duplicates, out-of-order events, rate limits, timeout-after-success and partial rollback through bounded reconciliation. Provider outage preserves core work.

**Proof:** Replay/duplicate/out-of-order/timeout/revocation scenarios on the admitted peer; export and replacement do not lose source identity or create repeated side effects.

Sources: `baseline:01-product/TOOL_AND_INTEGRATION_CONTRACT.md`, `repo:docs/01-product/END_STATE_BLUEPRINT.md`.

## IF-16 · Spatial context and controlled outputs

Producer: **MAP-07**. Consumers: MAP-01, MAP-02, MAP-03, MAP-05, MAP-06, MAP-08.

**Baseline:** Shared editor and export/native bridge source preserved; independent hosting/native-device/project publication need their own evidence.

**Input:** Exact shared editor/tool version, authorized optional OS context, local document/version/provenance, schema/export profile and explicit export/publication intent.

**Result:** Durably reopenable Spatial document and validated export with source identity; receiver reservation/finalization receipt then ordinary OS human review/release.

**Authority and revision:** Independent spatialauxilium.io access and full OS editor preserve same source. Native capture is a separate device capability, not a fork or whole-tool native lock. Export/hash does not grant project/release authority.

**Failure and retry:** Unsupported schema/device/capture permission and partial export are explicit; never overwrite edited documents on recapture. Publication retry reconciles reservation and bytes; disabled publisher remains disabled until receiver contract accepted.

**Proof:** Shared editor parity in both hosts; save/reopen and compatible import/export; physical device retained capture evidence; approved output reaches correct OS context and denied context fails.

Sources: `spatial:spatial-source/contracts/COMPATIBILITY.md`, `spatial:spatial-source/contracts/capture-bridge-v1.md`, `spatial:spatial-source/contracts/publication.openapi.json`.

## IF-17 · Moldo independent exchange

Producer: **MAP-07**. Consumers: MAP-01, MAP-02, MAP-03, MAP-04, MAP-05, MAP-06, MAP-08.

**Baseline:** Independence is accepted source boundary; current peer implementation must be inspected before adapter work.

**Input:** Explicit customer/site/project mapping, allowed direction and minimum approved peer payload, effective revisions and revocable service identity.

**Result:** Source-preserving permitted OS enterprise/management projection or acknowledged command to the owning system; independent export/offboarding mapping.

**Authority and revision:** Moldo owns native Moldo operations. Moldo-only staff/managers have no implicit OS membership. OS enriches authorized management; it does not absorb Moldo databases, identities or release decisions.

**Failure and retry:** Moldo remains useful during OS outage/disconnect. Duplicates/conflicts are reconciled to field ownership. Disconnect and sale/separation revoke credentials while preserving permitted exported history.

**Proof:** Current peer contract verified; no-OS-account native use; outage, revocation, duplicate/conflict and separation/export scenarios preserve independent operation.

Sources: `repo:docs/03-data/ADR-001-DOMAIN-AND-MOLDO-BOUNDARIES.md`, `baseline:01-product/TOOL_AND_INTEGRATION_CONTRACT.md`.

## IF-18 · Shared UI action and state contract

Producer: **MAP-02**. Consumers: MAP-01, MAP-03, MAP-04, MAP-05, MAP-06, MAP-07, MAP-08.

**Baseline:** Existing common shell/forms; audit records inconsistent purposes and four destructive draft transitions.

**Input:** Permitted audience/context, domain read model, available actions with true side effects, data/saved revision and request/validation state.

**Result:** Consistent navigation, context, status, primary action, local/unsaved/saving/saved/stale/error state, accessible controls and responsive complete task path.

**Authority and revision:** Domain owns meaning and persistence. UI never grants authority or mislabels a planner as an operational save. Facility Coordinator is current user-facing label. Visual consistency must preserve useful role-specific work.

**Failure and retry:** Dirty data survives safe revalidation; route/context/sample replacement has intentional handling. Server errors keep correction state; stale async results do not overwrite new context; lack of access clears protected values safely.

**Proof:** Four reproduced draft-loss paths repaired; actual save/reopen; mobile/keyboard/focus/errors; human-readable IDs and concrete next action in representative client/internal/vendor/executive journeys.

Sources: `baseline:02-experience/UI_CONTRACT.md`, `baseline:02-experience/UI_ROUTE_ACTION_MATRIX.json`, `baseline:02-experience/UI_AUDIT.md`.

## IF-19 · Evidence, source checkpoint and release receipt

Producer: **MAP-08**. Consumers: MAP-01, MAP-02, MAP-03, MAP-04, MAP-05, MAP-06, MAP-07.

**Baseline:** Existing control system available with named repair gaps.

**Input:** Current task/requirements, exact input/output source, paths, interface versions, profile command/environment, fixture/target identity, safe logs and scoped decision evidence.

**Result:** Durable scoped outcome, reused/invalidated checks, local/remote/deployed facts, exact blocker and first unfinished action; full release evaluated separately.

**Authority and revision:** Only evidence for matching inputs/target/claim can be reused. Static/unit/database/fixture/API/browser/build are distinct. A nonempty publication note cannot authorize real business activation.

**Failure and retry:** Skipped/unavailable is not passed. Preserve first failure and diagnose once before retry strategy changes. Shared hosted fixtures and deployments have one operator; no destructive cleanup of owner/audit records.

**Proof:** Negative gate tests, invalidated affected profiles, resumed unfinished action, remote readback, actual candidate identity and release evidence tied to named activation.

Sources: `repo:BUILD_QUEUE.json`, `repo:VERIFICATION_PROFILES.json`, `repo:scripts/os-control.mjs`, `baseline:04-assurance/VERIFICATION_AND_RELEASE_CONTRACT.md`.

## IF-20 · Data lifecycle and recovery

Producer: **MAP-01**. Consumers: MAP-03, MAP-04, MAP-05, MAP-06, MAP-07, MAP-08.

**Baseline:** Planning and protected history exist; target restore/performance proof incomplete.

**Input:** Versioned retention/export/hold/restriction policy, complete source/database/object inventory, recovery point and current independent security revocations.

**Result:** Consistent protected backup/export, controlled lifecycle action and isolated restoration with matching references/checksums/authority and explicit gaps.

**Authority and revision:** Preservation holds prevent destructive deletion; restriction narrows visibility. Domain rules decide exact retained business records. Git/archive is not a database or object backup; no invented RPO/RTO.

**Failure and retry:** Reject incomplete/corrupt backup; outbound effects disabled during restore. Reconcile current revocations and external results before cutover. Do not replay money/signing/notifications blindly.

**Proof:** Isolated restore with representative checksums, missing-object handling, revoked-user denial, side-effect suppression and measured results against approved targets.

Sources: `repo:docs/09-release/BACKUP_RECOVERY_PLAN.md`, `repo:OWNER_DECISIONS.json`, `repo:docs/03-data/ACCESS_AUDIT_IMPLEMENTATION.md`.
