# MAP-03: Professional workflows

**Owns:** M07 Intake, M08 Scope, M09 Sampling, M12 Operations / Projects, and primary coordination of C03 Controlled authority. **Reference baseline:** canonical `148d74d9720f0799e5d845bb789cd3fc3f43feb8`, reconciled launch package dated October 9, 2026. This is an implementation map, not current-runtime certification, a new permission system, or scientific policy approval.

`repo:` paths resolve to `reference/sources/canonical/`. `baseline:` paths resolve to `reference/`. Existing implemented interfaces are explicitly identified. All other operation descriptions, data contracts and file allocations below are **proposed implementation contracts** for source-grounded requirements. The integration lead pins them before dependent implementation; their descriptive names are not claims that APIs or tables exist.

## 1. Work backward from the finished outcome

An authorized client submits an understandable request once. Auxilium preserves what was asked, reviews the actual issue and professional boundaries, prepares an exact scope and sample plan, obtains the separate commercial authority, executes the authorized work, resolves changes openly, and delivers the required outputs. The next responsible person sees the exact action and context throughout. A facility incident may create several engagements; a routine job may have no incident, program or portfolio.

The complete acceptance path is: request -> reviewed classification and missing-information resolution -> exact scope and sampling decision -> MAP-04 effective authorization -> one accepted project -> assigned visits/tasks and field evidence -> MAP-06 reviewed/released outputs -> reconciled closeout and MAP-05 site/reporting follow-up. These are domain handoffs, not one shared status field.

Sources: `repo:REQUIREMENTS.json` M07-M09/M12/C03; `repo:docs/01-product/DATA_SPINE.md` sections 6-12; `repo:docs/03-data/ADR-001-DOMAIN-AND-MOLDO-BOUNDARIES.md`; `baseline:01-product/DOMAIN_AND_WORKFLOW_CONTRACTS.md`.

## 2. Ownership and dependencies

| This map owns | Consumes | Produces |
|---|---|---|
| Submitted request, reviewed classification, missing-information responses | IF-01 identity/context, IF-02 capabilities, IF-03 versioned rules, IF-04 account/site directory, IF-09 attachment references | IF-05 preserved request and reviewed disposition |
| Scope revisions, recommendations, limitations, technical sampling plan/decision and required deliverables | IF-05; IF-03 catalogue/method/limitation definitions; IF-07 commercial impact and authorization | IF-06 exact scope/sampling/deliverable requirements |
| Incident, accepted project, work orders/tasks, visits, observations, change proposal and operational closeout | IF-06; IF-07 current effective authority; IF-09 review/release disposition; IF-11 vendor/cost state; IF-16 Spatial outputs | IF-08 operational state, next actions and source evidence |
| Controlled-authority behavior across this journey | IF-14 audit provenance; IF-18 shared UI/action contract; IF-19 verification/checkpoint | C03 evidence and explicit dependency mismatches |

MAP-04 alone owns ROM calculations, legal/commercial authorization, cap grants and signature effectiveness. MAP-06 alone owns document versions, review/release and communication transport. MAP-05 owns physical facility/area identity and readiness truth. MAP-01 owns identity, capability evaluation and shared configuration infrastructure. MAP-07 owns external transport and tool contracts. This map must not shadow any of those records with a second editable truth.

Deliverable boundary: this map owns **what work product is required**, its preparer/reviewer assignment, due date and project-closeout disposition. MAP-06 owns the canonical document/version used to satisfy it and the exact review/release evidence. A document upload cannot declare the requirement fulfilled. MAP-05 owns QBR content/metrics; this map's task service can track its preparation task without taking over QBR truth.

## 3. Baseline to extend

| Area | Established by the frozen source | Remaining target |
|---|---|---|
| Intake | `INTAKE_RUNTIME_CONTRACT.md` plus migration, typed adapter and page implement synthetic submission, scoped lists/detail, triage, assignee selection, preserved originals and missing-information response | Rich dynamic questions, template/repeat/prefill paths, linked attachments, complete professional disposition and downstream conversion |
| Scope, sampling, operations | Canonical proposed state machines and catalogue contracts exist. Generic preparation panels and creator-only workspace notes illustrate these workflows | Real domain records, mutations, state/authority checks, work queues and connected acceptance |
| UI persistence | Some preparation panels save private synthetic notes | Saving a note is not saving scope, sample plan, schedule, project or change authorization |
| Evidence | Baseline contains implementation and test receipts with differing environments and freshness | Refresh the current branch and reuse matching evidence; do not infer hosted end-to-end acceptance from a fixture or a stale narrative |

Current source anchors: `repo:docs/03-data/INTAKE_RUNTIME_CONTRACT.md`; `repo:web/src/lib/intake-api.ts`; `repo:web/src/pages/intake.tsx`; `repo:docs/03-data/WORKSPACE_PLANS.md`; `repo:web/src/pages/module-screen-definitions.ts`; `baseline:00-reconciliation/RECONCILED_STATUS.md`; `baseline:02-experience/UI_AUDIT.md`.

## 4. Capability map

### PW-01. Start and submit a request without losing meaning

**Inputs:** authorized account/facility and optional real area/incident; requester; issue and service intent; original narrative; event timing and prior work; affected/inaccessible areas; occupancy and access/safety facts; urgency; payer/signer/change-approver context; attachment references; sampling/deliverable preferences. Unknown information stays unknown. No-PHI applies to fields, images, uploads and linked identities.

**Output:** one immutable original submission plus stable request ID, actor/server time and configuration version. Reviewed classification is separate. A template, repeated request or facility prefill creates proposed inputs only, reruns current rules, and never copies old approvals, signatures or release grants.

**Actors and operations:** a currently entitled submitter can start/submit within exact facility scope; authorized triagers can review in that same scope. Existing operations are `intake_catalogue`, `submit_project_request`, `list_project_requests`, `get_project_request`, `list_intake_assignees`, `triage_project_request`, and `respond_project_request`. Preserve their exact signatures and wire format from `repo:docs/03-data/INTAKE_RUNTIME_CONTRACT.md`. They currently accept a bounded subset of the target inputs above. Extend through a reviewed additive contract; never stuff unsupported structured fields into narrative to pretend coverage.

**Transition:** current submission creates `submitted`, revision 1. Submission is neither scope acceptance nor mobilization. Existing incident linking and optional `new_incident` are mutually exclusive and same-facility; preserve this invariant in rich intake.

**UI:** offer the appropriate start path; ask necessary questions progressively; show saved/pending state and what happens next. Show actual selected facility and areas, not account-only context. If context changes while dirty, preserve the original context and ask for explicit save/discard resolution through MAP-02; never silently move the request. A successful submit goes to its persistent detail page, not a static success illustration.

**Failure/evidence:** same idempotency key and same payload returns one request; changed payload conflicts; cross-account incident link fails; attachments still quarantined stay visibly unavailable; unknown classification remains answerable. One connected submit/detail/reload journey plus duplicate-submit and wrong-facility denials establishes the slice. A second UI-only copy of the form does not.

Sources: `repo:docs/03-data/INTAKE_RUNTIME_CONTRACT.md` Stable API; `repo:docs/02-ontology/ISSUES_INTENTS_MODULES.md` Mapping contract; `repo:docs/01-product/END_STATE_BLUEPRINT.md` Final Intake / Scoping Capability; OD-001/003/005/009/013.

### PW-02. Review, classify and resolve missing information

**Inputs/output:** original submission and current request revision -> separate classification, accountable assignee, missing-information request/response history, next action and reviewed disposition. Never rewrite the client's original wording, original issue/intent or original attachment references.

**Current allowed transitions:** `submitted -> intake_completeness_review`; completeness review -> information/classification/technical/safety review or declined/cancelled; information response -> completeness review; classification/technical/safety review and revision paths follow the exact table in `INTAKE_RUNTIME_CONTRACT.md`. Entering `technical_review` requests review; it does not certify professional approval. Current terminal records are not reopened by the intake API.

**Target extension:** implement full accepted/limited/referred/declined/returned outcomes from `REQUEST_STATE_MACHINE.md` only after each downstream authority condition exists. Pin the mapping from current strings and preserve legacy reads. Do not enable a future state merely because its label already appears in a planning document.

**Queries/mutations:** filtered own/assigned queue, exact request detail/history and currently eligible assignees; explicit reassignment, reviewed reclassification, request-information, append response, and disposition. Queue entries carry account/facility, status, priority, owner, next action, due date, blocker, required reviewer, client-facing status and last activity. Use server-filtered pagination; search must state whether it searches all accessible requests or only the loaded page.

**Permissions/revision:** assignee eligibility is rechecked at assignment; response is permitted only to the appropriate submitter in the required state; authoritative actor/time remain server-derived. Current optimistic concurrency uses expected revision and safe conflict handling. No client capability boolean bypasses server checks.

**UI/failure/evidence:** original and reviewed labels remain distinguishable; a client sees an actionable question with one return path. If another worker changed the record, show updated status and retain the unsent response for review. Revocation removes future access without disguising it as an empty business queue. Prove reclassification preserving original, missing-information round trip, stale revision and invalid assignee denial.

Sources: `repo:docs/03-data/INTAKE_RUNTIME_CONTRACT.md`; `repo:docs/05-workflows/REQUEST_STATE_MACHINE.md`; `repo:REQUIREMENTS.json` M07/M12; OD-001/003/005/009.

### PW-03. Apply reviewed ontology and smart prompts deterministically

**Inputs/output:** issue/intent plus account/site/area/context facts and exact ruleset -> explained candidate work, required questions, qualification/safety review, sampling/deliverable links, limitations and ROM impacts. Preserve distinct service families, issues, intents, technical work, methods, deliverables, depth and modifiers. The 19 issues, 16 intents, 27 technical work candidates, 14 smart-prompt contexts and 18 relationship types stay traceable to their source catalogues; no Cartesian product is automatically valid.

**Ownership:** MAP-01 supplies versioned configuration and permitted override mechanics (IF-03). This map owns the domain evaluation contract, applicability and recorded decisions. MAP-04 owns pricing effect. Human review/activation of scientific methods remains OD-005/009. A smart prompt is rules-based unless separately approved AI functionality exists; do not add provider dependence.

**Queries/mutations:** read applicable versioned catalogue and evaluations; evaluate against a pinned context snapshot; record accept/decline/defer/ask-Auxilium plus reviewer disposition; reevaluate only materially changed facts/rules. Evaluation output records rule ID/version, triggering facts, explanation, candidate action, decision, source and effect references. The backend never treats “accept recommendation” as scope approval, cap approval or signature.

**UI:** one concise useful card at the relevant decision point, with practical consequences and details on demand. Previously answered unchanged prompts do not repeatedly interrupt. Unknown and contradictory inputs route to review. Preserve requested strong conclusions and the actual evidence limitations rather than letting a checkbox manufacture support.

**Failure/evidence:** prove valid, incompatible and unknown mapping; a declined sample recommendation; repeated evaluation without duplicate cards; changed facts invalidating stale suggestion; and old signed scope remaining pinned after rule update. No invented sample counts, regulatory claims, threshold values or response promises.

Sources: `repo:docs/02-ontology/ISSUES_INTENTS_MODULES.md`; `repo:docs/02-ontology/RELATIONSHIP_TAXONOMY.md`; `repo:docs/02-ontology/SMART_PROMPTS.md`; `repo:docs/02-ontology/SERVICE_FAMILIES.md`; OD-005/006/008/009.

### PW-04. Prepare, review and preserve the exact scope

**Inputs/output:** IF-05 reviewed request, facility/areas, configuration, technical eligibility, recommendations and ROM reference -> preserved scope revision with inclusions/exclusions, areas, methods/work modules, deliverables, sampling decision, assumptions, limitations, reviewer decisions, parent revision and fingerprint. Deliverable requirements reference the 21 recovered candidates without conflating a file, field method and service.

**Operations:** list/detail revisions; prepare new candidate; submit for review; return for revision; approve exact candidate; present to permitted client; record authorized accept/decline; activate only on matching IF-07 effective authority. Editing an approved or accepted revision creates a successor, never overwrites it.

**Allowed transitions:** `draft -> review_pending -> approved_internal -> client_decision_pending -> accepted/declined`; returned review uses `revision_required` and a new candidate; accepted becomes `active_authorized` only with effective authorization; current authorized revision becomes `superseded` only when its replacement is duly approved and effective. Authorized cancellation applies to an unactivated revision. Follow `SCOPE_STATE_MACHINE.md` for exact semantics.

**Authority:** qualified assigned review and client commercial acceptance are different responsibilities. Approved scope has stable IDs, immutable content/fingerprint and reviewer evidence. A stale screen, changed candidate or revoked assignment cannot approve. Client text, notes, uploads and AI may propose changes only. C03 is shared with MAP-04 and MAP-06; each owner enforces its own mutation boundary.

**UI:** compare requested/proposed/current-authorized scope; show included, excluded, inaccessible, recommended, declined and deferred work distinctly. Show required deliverables and effects before client decision. A replacement draft is visibly a proposal and does not make existing active work disappear. A failed save retains the candidate and makes the unresolved outcome explicit.

**Evidence:** one scope prepared from a real request, independently reviewed, accepted and activated by the correct authorization; reject self-invented qualification, wrong account, altered digest, skipped review and stale concurrent approval. Demonstrate a new draft leaves the active revision intact.

Sources: `repo:docs/05-workflows/SCOPE_STATE_MACHINE.md`; `repo:docs/02-ontology/SCOPE_LIMITATIONS.md`; `repo:docs/02-ontology/DELIVERABLES.md`; `repo:docs/01-product/DATA_SPINE.md` Scope Record/Deliverables; OD-001/005/006/009.

### PW-05. Sampling from preference through professional interpretation

**Inputs:** request preference, reviewed scope/version, method and qualification sources, category/analyte, media, procedures, equipment, location/area, lab, turnaround, cost/cap, QA/QC and safety context. Sixteen source sampling categories include instrument logs, which remain field measurements rather than lab results. Area/unit/floor/building/material/pathway/control/employee/task/shift are candidate scaling bases, not formulas.

**Distinct authoritative records:** client preference -> Auxilium recommendation -> authorized plan/cap -> collection record -> custody events and lab order -> lab-reported result/revision -> qualified interpretation -> reviewed report reference. These distinctions must be visible in queries and UI. One generic `approved` or `complete` field is insufficient.

**Operations and actors:** permitted preparer proposes a plan; qualified assigned reviewer reviews strategy; authorized client/commercial workflow records spend/plan decision; eligible field staff capture performed collection; designated staff reconcile COC/lab order; qualified reviewer records interpretation. MAP-04 provides authority and money constraints. MAP-06 preserves result-file versions and controlled outputs; this map owns structured sampling facts and their provenance.

**Data:** stable sample ID, scope/plan revision, account/site/project/location, collector and collection time, method version, field data/units, custody events, lab identifiers/order, expected vs received results, exceptions, result version, interpretation/reviewer and audit links. Proposed validation must preserve source-reported values, qualifiers, units, detection information where supplied and correction history; do not invent conversions or overwrite raw lab facts with interpretation.

**Queries/mutations:** plan read/revision/review; authorized collection list; record collection/custody transfer; receive/reconcile result; register corrected result; review interpretation. Pin exact source bytes/reference and record correction lineage. Import through IF-15 if used, never direct adapter writes to approval state.

**Transition/edge rules:** requested is not authorized; collection is not receipt; receipt is not valid interpretation; approved interpretation is not client release. Extra quantity, changed method, rush TAT, new area, cap effect or unexpected hazard invokes the relevant change/safety gate. A declined sample decision remains preserved with reviewed limitations. Duplicate IDs, missing COC, mismatch, partial results, revised reports and inconclusive data are actionable exceptions, not silent successes.

**UI/evidence:** show plan vs collected vs outstanding, actual location and custody status, exceptions and next reviewer. Prove recommend-only and unauthorized-specific-request cases; permitted collection within cap; cap overrun blocked or routed; missing COC and revised lab report handling; and that an unqualified user/AI cannot approve interpretation or release. Synthetic values are clearly synthetic and do not prove a method's validity.

Sources: `repo:docs/02-ontology/SAMPLING_ENGINE.md`; `repo:docs/01-product/MODULE_MAP.md` Sampling Module; `repo:REQUIREMENTS.json` M09; OD-001/005/006/009/013.

### PW-06. Convert authorized work once and manage its execution

**Inputs/output:** accepted request or recorded approved internal/emergency path, exact scope, effective IF-07 authorization, payer, eligible team and access/safety conditions -> one project and linked tasks/visits/deliverables. Conversion returns the same project on exact retry; incident/request/project identities remain independent. Do not auto-create enterprise context for an ordinary job.

**Stages:** `ready_for_schedule -> scheduled -> active -> technical_review -> deliverables_ready -> delivered -> closed`, with source-defined entry conditions. A visit schedule is not proof that work started. Missing field/lab inputs must be supplied or their limitations explicitly accepted for review before a technical-review transition. Deliverables become ready through IF-09 exact-version evidence, not a manual generic task checkbox.

**Operations:** permission-filtered project/incident/work queues and detail/history; controlled conversion; assign eligible people/work order; schedule/reschedule visit; start/complete eligible work; append field observation/issue/lesson; record hold/wait/resume; request stage progression; cancel or reopen with reason. Task completion records what actually happened and links to the authority-bearing domain result when required.

**Wait/hold:** stage and blocker are independent. Record waiting for client, access, lab, authorization or internal review with owner, next action and timing. Block only affected work, retain authorized unaffected work, and resolve the recorded condition before resume. Measure waiting from events; do not relabel waiting as productive work. Never silently reset completed work when moving queues.

**UI:** internal queues show one next useful action with account/project/site context. Simple clients see truthful appropriate progress and requests for action, not internal technical notes or 20 module menus. Mobile field views prioritize assigned visit, permitted scope, areas, outstanding tasks and evidence. Pending network work shows an honest pending state. Offline authoring is not promised by this map; any offline feature requires the approved tool contract and explicit reconciliation.

**Evidence:** request-to-project conversion retry, same-incident multiple projects, ordinary no-incident job, revoked assignee, scheduling gate, hold/resume preserving stage, and field evidence that does not mutate scope. Use one meaningful connected journey and focused authority/concurrency tests, not duplicate suites for each label.

Sources: `repo:docs/05-workflows/PROJECT_STATE_MACHINE.md`; `repo:docs/01-product/DATA_SPINE.md` Incident/Project/Tasks; `repo:REQUIREMENTS.json` M12; OD-001/005/006/008/009/010.

### PW-07. Controlled changes, emergency handoffs and closeout

**Change inputs/output:** existing scope/authorization revisions, trigger, proposed change and why -> linked change proposal with effects on areas/work, sampling, deliverables, ROM/cap, schedule, limitations and required reviewers. Nine source trigger families are retained: new area; issue; work module; sampling; deliverable; cap; schedule/turnaround; safety/access; professional boundary. Normal message, field note or upload only opens the proposal/task.

**Change states:** `change_draft`, `change_review_pending`, `change_client_decision_pending`, `change_approved`, `change_declined`, `change_cancelled`, `change_expired`, `change_implemented`, `change_superseded`. Approval evidence precedes implementation. MAP-04 owns binding amendment authority; this map applies only the matched effective technical/operational change. Concurrency cannot create two active replacements. Decline records the reason/decision, effect on conclusions and whether qualified review permits continuing limited work.

**Emergency boundary:** this map owns incident/intake, P0-P4 triage and operational limited-response progress. MAP-04 owns the permitted emergency authorization and commercial exception. MAP-05 supplies covered facility, readiness/access contacts and effective program context. P0 directs users to emergency services/facility protocol as applicable, without implying Auxilium is a life-safety first responder. Human review addresses safety, sensitive occupancy, unknown contamination, regulated materials, exposure, out-of-state/after-hours, payer and access. The existing routine/urgent/emergency intake value is not the P0-P4 priority model; add an explicit reviewed mapping rather than silently equating them.

**Emergency operations:** preserve minimum incident/requester/contact/site/address/affected-area/occupancy/safety/action/cap facts and the authorization link. `emergency_authorized_limited` and `emergency_mobilization_released` require MAP-04 evidence. Sampling, reports, protocol, PRV, extra visits, vendor costs and other follow-up need further authority unless already included. The source emergency state family remains separate from project stage. Exact follow-up/conversion is idempotent.

**Closeout:** read required deliverables and IF-09 disposition; reconcile tasks, unperformed/declined scope, costs and open recommendations; transfer unresolved site actions to their existing MAP-05 records with accountable owners. Record cancellation/performed work without erasing costs or authority. Closing does not declare payment, safety, compliance or that the facility has no risks. Reopening does not unlock signed/released revisions.

**UI/failure/evidence:** client change review shows concise before/after and consequences; pending signature is not “approved work.” Safety restriction stays visible. Show incomplete closeout with exact unresolved item/action. Prove a cap/sampling amendment, client declination, emergency limited response with refused unauthorized follow-up, stale concurrent amendment, and closeout retaining unresolved facility risk.

Sources: `repo:docs/05-workflows/CHANGE_AUTHORIZATION_WORKFLOW.md`; `repo:docs/05-workflows/EMERGENCY_EXCEPTION_WORKFLOW.md`; `repo:docs/05-workflows/PROJECT_STATE_MACHINE.md`; OD-001/005/006/008/009/010/017.

## 5. Shared action and interface contract

Every consequential proposed mutation carries object/account scope, expected revision, exact target revision/fingerprint when appropriate, one immutable action intent, source configuration versions and bounded input. The server derives actor/time, checks current capability/qualification/authority and allowed transition atomically, records IF-14 provenance, then returns durable identity/revision and safe current state. No raw database errors or internal notes appear in client error text.

Reads apply current permission filters, cursor bounds and permitted fields to detail, search, joins, counts and exports. An empty filtered read must not confirm that a guessed unauthorized object exists. Cache keys include identity and full object context. Current API exception behavior follows the existing intake contract: validation `22023`, safe unavailable/forbidden `42501`, stale revision `40001`, changed idempotency payload `23505`. New APIs must pin their safe mapping before a UI consumer implements it.

| Interface | Producer obligation in this map | Consumer acknowledgment required |
|---|---|---|
| IF-05 | Preserve original vs reviewed facts; expose exact next action/owner and revision; specify which fields are current runtime vs added target | MAP-04 and MAP-06 must not treat submitted/review state as authority |
| IF-06 | Exact scope/plan/deliverable requirement IDs, versions/fingerprints, inclusions/exclusions, recommendation decisions and applicable rule versions | MAP-04 binds identical version; MAP-06 satisfies exact deliverable; MAP-07 preserves location/source links |
| IF-08 | Project/task/visit/incident identity, authorized scope/authority refs, stage separate from hold, permitted source facts and freshness | MAP-02 renders audience-appropriate action; MAP-05 projects facts; MAP-04 reconciles costs |
| IF-07 consumed | Explicit effective authority and scope match, applicable cap/prerequisites, expiry/revocation/amendment effects | MAP-03 refuses conversion/work outside current authority; it never infers unlimited approval |
| IF-09 consumed | Exact reviewed/released document references, required audience disposition and current availability | No copied release booleans as independent authority; unavailable/replaced version stays truthful |

Timeout after a mutation is an **uncertain outcome** until reconciled using the same intent. Do not mint a new intent and create a duplicate. On stale revision, refresh current state while preserving permitted unsent local input. On revoked access, remove protected cached content and offer a safe route; draft retention must follow MAP-01/MAP-02 security rules, not promise access to revoked data.

## 6. Bounded delivery slices and delegation

Proposed areas, to be allocated by the lead: `web/src/features/intake/`, `web/src/features/scope/`, `web/src/features/sampling/`, `web/src/features/operations/` and matching narrowly scoped tests. Existing `web/src/pages/intake.tsx` and `web/src/lib/intake-api.ts` may be assigned as exact owned files. These new folder names are an ownership proposal, not a required broad restructure. Shared router, runtime/context, styles, module definitions, capability helpers, configuration registries and migration ordering remain integration-lead owned. Backend domain SQL/API changes arrive as a bounded reviewed patch; the lead assigns final migration filename/order.

| Slice | Dependency readiness, not whole-map completion | Useful completed outcome | Required boundary evidence |
|---|---|---|---|
| PW-S1 Preserve and enrich intake | Existing IF-01/02/04/05; MAP-02 dirty-work contract | One valid rich request survives navigation/reload and reaches correct triager | Duplicate submit, cross-facility denial, preserved original |
| PW-S2 Scope and rule decisions | IF-03 pinned version; IF-05 reviewed request; IF-06 agreed draft contract | Reviewer and client can inspect exact proposal and recorded decisions | Changed candidate invalidates candidate approval; active revision untouched |
| PW-S3 Scope-authority-project handoff | MAP-04 IF-07 bounded synthetic effective-authorization slice | One authorized engagement becomes one scheduled project | Scope fingerprint match; prerequisites; conversion retry |
| PW-S4 Sampling and field execution | IF-06 plan and IF-07 constraints; IF-09 result-file reference | Authorized collection, custody and lab reconciliation feeds review | Unauthorized sample, missing COC, corrected result, reviewer boundary |
| PW-S5 Change and emergency limits | Existing project plus bounded MAP-04 amendment/exception contract | Changed field facts cause explicit, effective reviewed amendment or safe limitation | Concurrent amendment; declined change; unauthorized follow-up |
| PW-S6 Closeout and site follow-up | IF-09 released result; MAP-05 IF-12 follow-up contract | Project closes with real outputs and accountable remaining site actions | Missing deliverable; open risk preserved; reopen does not unlock output |

An independent chat owns **one named slice and its exact files**, even if assigned this map as long-term responsibility. It reads the latest shared interface pins and other affected maps, works on a separate branch, returns code/contract/evidence deltas, and waits only for the specific unavailable provider contract. It does not reimplement identity, rewrite scope in the finance map, or wait for every other map to finish. The integration lead alone declares the combined journey accepted.

## 7. Completion and activation matrix

The rows below are closure targets, not current completion claims. The exact canonical acceptance rows appended by the lead remain decisive.

| Requirement / capability | Completion requires | Cannot substitute |
|---|---|---|
| M07 / PW-01-03 | Original, dynamic/repeat paths, assigned review, missing-information history and complete controlled disposition | Synthetic catalogue screen or private planning note |
| M08 / PW-03-04/PW-07 | Exact approved scope, recommendations, effective authorized amendments and history | Informal chat approval or editable `approved` checkbox |
| M09 / PW-05 | Separate preference/authority/collection/custody/results/interpretation with location and correction lineage | A result upload or sample-count text field |
| M12 / PW-06-07 | Accepted authorized project, useful queues, schedule/field work, controlled changes and closeout | Sample timeline, editable status tile or duplicate project |
| C03 / all | Each owning domain rejects unauthorized proposals; effective amendments/retries/concurrency preserve one correct authority chain | Frontend button hiding or one generic approval role |

Live activation uses existing OD-001 (people/delegation), OD-003 (audience), OD-005 (scope/method/template policy), OD-006 (binding financial conditions), OD-008 (emergency authority/promises), OD-009 (qualification/offering), OD-010 (vendor responsibility), OD-013 (real-upload handling), and OD-017 (real sends) only where the action touches them. OD-015 and identity activation are shared release dependencies. Pending policy blocks its affected live action, not synthetic implementation or unrelated build work. No rates, scientific thresholds, automatic emergency cap, new role or new legal clause is approved by this map.

**Handoff record:** requirement and slice IDs; provider/consumer interface versions; base and result commit; exact files; actual implementation vs proposed behavior; migrations and rollback boundary; meaningful checks with environment/evidence level; unresolved mismatch/activation gate; next dependency-ready slice. Reuse the canonical task packet and registers. This file must never become a second live build queue.

## Canonical acceptance accountability

The following exact criteria belong to this map. Axx is a reference alias for the ordered criterion in the pinned `repo:REQUIREMENTS.json`, not a new live requirement ID or a completed-status claim. Preserve all required evidence levels in the source. Collaborating maps and hashes are in `coverage/ACCEPTANCE_OWNERSHIP.json`.

### M07

- **M07.A01** — original submitted wording and attachments remain preserved.
- **M07.A02** — structured review can reclassify without erasing that original.
- **M07.A03** — requirements adapt to issue and intent using versioned rules.
- **M07.A04** — missing information has ownership and response tracking.
- **M07.A05** — a request can be accepted, limited, referred, declined or returned.
- **M07.A06** — submission alone never mobilizes or authorizes work.
- **M07.A07** — Users can start from a saved template, repeat prior request, asset prefill or help-classify route; prior approval and authorization are never copied as new authority.

### M08

- **M08.A01** — approved scope is a specific preserved revision.
- **M08.A02** — inclusions and exclusions, areas, assumptions and required deliverables are unambiguous.
- **M08.A03** — accepted/declined recommendations are evidenced.
- **M08.A04** — changes produce a reviewed amendment linked to its authorization and effective time.
- **M08.A05** — unauthorized edits cannot alter active scope.
- **M08.A06** — chat can suggest a change but cannot approve one.

### M09

- **M09.A01** — requested, recommended, authorized, collected, lab-reported and professionally interpreted information are distinct.
- **M09.A02** — plans and collected samples trace to scope and location.
- **M09.A03** — collection identifiers reconcile with COC/lab records.
- **M09.A04** — revised lab data preserves previous records.
- **M09.A05** — decisions and declinations affect scope/cost/deliverables visibly.
- **M09.A06** — unqualified users and AI cannot approve strategy or issue conclusions.

### M12

- **M12.A01** — one incident can produce several related requests/projects.
- **M12.A02** — project creation links accepted request, applicable scope and authorization.
- **M12.A03** — role-specific queues state next actions and owner.
- **M12.A04** — scheduling and visits have clear status.
- **M12.A05** — field conditions can trigger a change request.
- **M12.A06** — closeout checks deliverables/open items before final state.
- **M12.A07** — history remains inspectable.
- **M12.A08** — Queues expose account/object context, status, priority, owner, next action, due date, blocker, required reviewer, client-facing status and last activity.

### C03

- **C03.A01** — Messages and AI outputs can create proposals but cannot change approved scope, caps, samples, signed terms or released files.
- **C03.A02** — Effective approved amendments govern the amended domain while original records and approval chains remain available.
- **C03.A03** — Retries and concurrency do not cause duplicate signatures, commitments or conflicting active revisions.
