# MAP-05: Client relationships, facilities, readiness and executive reporting

**Owns:** M02 Accounts, M03 Programs / MSA, M04 Portfolios, M05 Assets / Facilities, M06 Readiness / Site Passport and M17 Reporting / QBR. **Reference baseline:** canonical `148d74d9720f0799e5d845bb789cd3fc3f43feb8` and the October 9, 2026 reconciled launch package.

`repo:` resolves to `reference/sources/canonical/`; `baseline:` resolves to `reference/`. The current directory adapter is identified as implemented source. Other operation, data and file allocations below are **proposed implementation contracts**, not assertions that APIs, schemas, live policies or accepted workflows already exist. This map creates no new module, role, medical-data support, CMMS, engineering system or regulatory certification.

## 1. Work backward from the finished outcome

A simple client reaches its request, project, authorized action and released work without navigating an enterprise control panel. An enterprise client sees its permitted facilities, understands which sites and services are actually covered, keeps useful site response knowledge current, assigns readiness gaps, and can act on trustworthy project, risk, vendor and financial information. An executive can explain every material reported total or claim from its permitted source evidence. The same spine supports both audiences.

The complete enterprise journey is: accurate account/party context -> effective program and facility coverage where applicable -> stable site and physical areas -> versioned readiness/passport and accountable gaps -> MAP-03 controlled incident/project work -> source-based reporting/QBR with actions -> updated site knowledge and review schedule. A one-property project can begin from directory/intake without inventing program, portfolio or passport requirements.

Sources: `repo:docs/01-product/END_STATE_BLUEPRINT.md`; `repo:docs/01-product/DATA_SPINE.md` sections 1-5 and 16; `repo:REQUIREMENTS.json` M02-M06/M17; `baseline:01-product/PRODUCT_CONSTITUTION.md`.

## 2. Ownership and interfaces

| Owns here | Consumes | Provides |
|---|---|---|
| Client profile/types/contact relationships and presentation defaults | IF-01 identity; IF-02 grants; IF-03 versioned defaults; IF-09 account documents | IF-04 directory and explicit party relationships |
| Program/MSA indexing, structured effective coverage, facility activation rules and portfolio membership | IF-09 executed source artifact; IF-03 configuration; IF-07 binding commercial interpretation; IF-02 scopes | IF-04 effective program/site context, without project authorization |
| Physical facility/area identities, site contacts/access context and linked history | IF-16 Spatial reference where authorized; IF-08 incidents/projects; IF-09 documents; IF-11 vendor context | IF-04 stable site/area directory and permitted context |
| Versioned passport, critical assets, response maps, cache/readiness, training/drills, gaps and recurrence | IF-04; IF-08 action/task service; IF-09 evidence; IF-11 vendors | IF-12 readiness source facts and accountable follow-up |
| Defined metrics, snapshots, source-based dashboards/QBR and executive actions | IF-05/06/07/08/09/11 source facts; IF-15/17 freshness; IF-02 current visibility | IF-12 reporting projections, versioned QBR content and source lineage |

Identity and authority remain MAP-01, not account contact metadata. MAP-04 owns rates, engagement contracts, signature/cap decisions, vendor credentials/assignments, money and reserve transactions. MAP-03 owns incident/request/project/work task truth. MAP-06 owns documents, release, communications and AI proposal processing. MAP-07 owns tools and integration transport. This map cannot create a parallel project ledger, financial ledger or release flag to make dashboards work sooner.

Readiness gap vs task boundary: this map owns the condition, evidence, risk/readiness disposition and required resolution. MAP-03's shared task/work service can assign the action and due date under the gap's stable reference. Task completion does not automatically certify the underlying condition resolved; the required reviewer verifies evidence. Executive action follows the same pattern. Prefer existing linked records over a second competing task engine.

## 3. What the frozen source establishes

| Area | Established source reality | Required extension |
|---|---|---|
| Accounts/facilities | Authenticated, permission-filtered synthetic read-only directory and owner onboarding | Full relationship/contact/type administration, real scoped onboarding, physical area model and usable work navigation |
| Programs/portfolios/readiness/reporting | Product contracts, source catalogues, illustrative UI and personal preparation panels | Authoritative domain mutations, controlled versions, current-source projections and real end-to-end workflows |
| Workspace note persistence | Creator-only synthetic preparation under verified account/facility context | Must not be treated as program activation, site passport, risk resolution or a released QBR |
| Navigation/context | Reconciled audit documents context loss, broad audience navigation and draft loss | MAP-02 shared corrections before connecting sensitive domain edits |

Use `repo:docs/03-data/ADR-002-RUNTIME-FOUNDATION.md`, `repo:web/src/lib/directory-api.ts`, `repo:web/src/pages/directory.tsx`, `repo:docs/03-data/WORKSPACE_PLANS.md`, `baseline:00-reconciliation/RECONCILED_STATUS.md` and `baseline:02-experience/UI_AUDIT.md`. Refresh the actual current branch/target before implementation; no current deployment claims are made here.

## 4. Capability map

### ER-01. Represent the client relationship accurately

**Input/output:** customer organization/profile, one or more of the 12 recovered client types, related contacts/users, actual payer/signing/approval/billing relationships and configured terminology/defaults -> stable account and clearly scoped party relationships. A client account is the customer domain, not Auxilium's operating company, brand or holding entity. The same person may hold multiple responsibilities only through explicit verified delegation.

**Preserve distinctions:** requester, billing contact, payer, authorized signer, project approver, property owner/operator and facility contact may differ. Historical engagement authority pins the applicable party facts in MAP-04; editing a contact phone/name or current billing profile does not rewrite old agreements or projects. Contact creation does not grant account access or commercial/professional authority.

**Current queries:** `listAccounts({ afterId?, limit? })` and `listFacilities({ accountId, afterId?, limit? })` in `directory-api.ts`, with default 50, bounded 1-100 page size and cursor semantics in ADR-002. Current output is minimal display identity plus development marker; it is not a full account-admin API. Preserve the existing result and denied-read behavior when adding fields.

**Target operations:** query authorized account detail/contact relationships/default versions; create/update profile and relationship records with expected revision; propose/invite a permitted user via MAP-01 identity workflow; choose controlled client-type/presentation defaults; retire a relationship without deleting historic links. Exact mutation schemas and capabilities must be pinned with MAP-01 before UI code claims these are connected.

**UI:** onboarding and quick-reference guidance reflect actual permitted tasks. Client type helps prioritize useful request paths and vocabulary; it never prohibits an otherwise valid service or confers access. A client sees its work and needed action; internal management can inspect commercial-role distinctions. Long names, several contacts and small-screen context remain readable.

**Failure/evidence:** unassigned account remains inaccessible; an account read grant without facility scope reveals no facilities; suspension defeats another role; address/name similarity does not merge parties; changed current profile leaves signed history unchanged. Demonstrate a simple client and multi-type enterprise client using the same underlying contracts.

Sources: `repo:docs/01-product/CLIENT_TYPES.md`; `repo:docs/01-product/MODULE_MAP.md` Accounts; `repo:docs/03-data/ADR-002-RUNTIME-FOUNDATION.md`; `repo:REQUIREMENTS.json` M02; OD-001/003/012.

### ER-02. Make program coverage and site activation explicit

**Inputs:** executed MSA/source document version, account, effective period, covered facility/service, included vs separately billable work, rate-reference version, emergency/response terms, activation requirements, scope boundary matrix, permitted approval rules, QBR/reporting obligations and approved vendors. Not every account has a program; one account can have several.

**Authoritative output:** reviewed structured coverage/activation facts with exact source-clause/version lineage and effective interval. Program terms describe the relationship; MAP-04 determines whether an engagement has actual authority. A site being listed under a program does not mean it is activated, covered for every service, safe, compliant or authorized to spend.

**Operations:** read program and effective coverage for a specific facility/service/time; prepare/review terms mapping; propose controlled revision; assign/remove covered facility with effective history; record activation evidence or explicit exception; change/suspend/expire coverage according to approved terms. Define exact lifecycle names in the implementation contract before exposing them; the source does not establish a universal runtime enum for all programs.

**Rule handling:** MAP-01 supplies versioned configuration and explicit override precedence. A program-specific rule cannot grant authority beyond its approver's capability. Missing/contradictory/overlapping terms route to named review. An out-of-coverage request is still capturable and follows an explicit approval/authorization path instead of disappearing or being auto-approved.

**UI:** distinguish participating, activation-incomplete, effective coverage, expired/unknown and exception states in plain language. Show what evidence/condition is missing and the responsible action. Response promises display only actual approved terms, never a generic impressive SLA. Historical engagement details keep the terms originally bound to them.

**Failure/evidence:** a covered vs uncovered service at the same site; future/expired period; two programs with conflicting applicability; incomplete activation; explicit exception; and ordinary request with no MSA. Prove a later terms version does not retroactively change a signed engagement or grant mobilization.

Sources: `repo:docs/01-product/MODULE_MAP.md` Programs / MSA; `repo:docs/01-product/DATA_SPINE.md` Program / MSA; `repo:docs/03-data/ADR-001-DOMAIN-AND-MOLDO-BOUNDARIES.md` refinements 2 and 7; OD-001/006/007/008/010.

### ER-03. Group assets without duplicating or leaking them

**Inputs/output:** permitted account/program and stable facilities, regional/operating group definition and assigned portfolio responsibility -> portfolio membership with effective history where relevant. A facility can belong to several permitted portfolios. Membership is not a copy of its site record and never creates cross-account access by transitive grouping.

**Queries/mutations:** authorized portfolio list/detail; membership as of a reporting period; add/remove facility association after scope validation; assign permitted portfolio responsibility; query current aggregates and linked references. Portfolio documents use IF-09 links. Site observations, incidents, invoices and risks stay in their respective owning domains.

**Revision rules:** retain historic membership needed for reproducible snapshots. A current group change must not rewrite the denominator of a previously issued QBR. Ambiguous shared-property relationships remain explicit; address matching alone never merges accounts or facilities.

**UI/failure/evidence:** easy region/portfolio filters with a visible count of currently accessible sites, no unfiltered global count. Multi-membership aggregation avoids unintended double counting and declares the chosen grouping basis. Prove one site in two portfolios, a historical membership change, an inaccessible site exclusion, and no mandatory portfolio for a simple project.

Sources: `repo:docs/01-product/DATA_SPINE.md` Portfolio; `repo:REQUIREMENTS.json` M04/M17; `repo:docs/03-data/ADR-001-DOMAIN-AND-MOLDO-BOUNDARIES.md`; OD-001/003/007.

### ER-04. Maintain physical site and area truth

**Inputs/output:** facility/property/building/site identity, address, property and occupancy type, parent account relationship, real areas/floors/units/zones, contacts, sensitivity/access context and source evidence -> stable physical references used by requests, scope, samples, observations, documents and tools. The physical site is distinct from the party paying for one engagement.

**Operations:** read authorized facility and physical hierarchy; add/edit permitted site/area metadata with expected revision; link source evidence, map and relevant vendor context; retain area identity across rename and past observations; view linked incidents/projects/documents/risks without copying their content into a facility notes field. Site assignment remains a scoped MAP-01 grant, not a field anyone can edit.

**Area rules:** zones represent real physical areas, not generic tags. Parent relationships must be coherent within the actual facility; prevent self-parent/cyclic or wrong-site associations in the reviewed implementation. Excluded, inaccessible and affected areas are scope/observation facts supplied by MAP-03. Updating the building directory does not silently expand prior scope boundaries.

**Spatial handoff:** IF-16 supplies authorized drawing/model IDs, version and physical references. Geometry remains owned by its actual tool; a imported room label is a proposed mapping until matched to the correct existing area. Do not infer real project-linked persistence from the frozen Spatial personal-browser editor. Report measurement/source limitations honestly.

**UI:** a useful facility overview shows current contacts/access, open work/readiness gaps, recent permitted outputs and one way to request work for the correct area. Site search and pagination cover the intended accessible set. Returning from a project preserves account/facility context. A lack of permitted documents does not look like transport failure or reveal restricted metadata.

**Failure/evidence:** address duplicates, payer separate from owner, renamed area, incorrect parent/cross-site link, concurrent edit, revoked site grant, inaccessible floor and stale tool map. Demonstrate two projects reusing the same site/area without overwriting each other's findings.

Sources: `repo:docs/01-product/DATA_SPINE.md` Asset / Facility / Property and Zone / Area; `repo:REQUIREMENTS.json` M05; `repo:docs/03-data/ADR-001-DOMAIN-AND-MOLDO-BOUNDARIES.md`; `baseline:01-product/TOOL_AND_INTEGRATION_CONTRACT.md`; OD-001/003/009/013/016 where external sharing applies.

### ER-05. Make the site passport a useful operating reference

**Finished outcome:** assigned people can quickly find the current, sourced facility knowledge needed to prepare or respond, with clear missing/expired information. “Site passport” means this controlled facility operating reference. It is not an identity document, a claim that the site is safe/compliant, or a decorative report tile.

**Inputs and sections:** facility and real areas; Facility Coordinator/contact responsibilities; access/emergency contacts and facility response context; response maps; critical asset records; site cache/readiness items; relevant site documents; vendor context; review dates; training/tabletop evidence; known gaps, risks and approved activation exceptions. Use **Facility Coordinator** in current UI, not the older title. The label does not create a new security role or automatic release authority.

**Output:** versioned passport information with section/field source, owner, reviewed/last-updated dates, applicable evidence, controlled changes and clear current-vs-prior revision. Privacy and document class govern the actual audience. MAP-06 controls any generated/released passport document; displaying current site data and releasing a PDF are different operations.

**Queries/mutations:** view permitted current/history and section evidence; draft/update a section; assign review owner/date; submit and record required review; record verified fact, unknown, expired or exception; link response-map/tool revision; generate a reviewable document package through IF-09. Exact review requirements depend on approved configuration and content class; this map does not invent a universal professional signature for every contact edit.

**UI:** summarize practical response information and open action first. Section detail discloses source/evidence/freshness; do not require opening a sprawling form to find a permitted emergency contact. Emergency access still respects real grants. Accessible phone layout supports long instructions and document context without horizontal clipping.

**Failure/evidence:** expired contact/map, missing evidence, conflicting update, restricted sensitive location, new draft while prior released passport remains available, and review without sufficient capability. Demonstrate one site's exact information referenced in MAP-03 intake/triage without copying stale values as current truth.

Sources: `repo:docs/01-product/MODULE_MAP.md` Readiness / Site Passport; `repo:docs/01-product/END_STATE_BLUEPRINT.md` Final Enterprise / MSA Capability; `repo:REQUIREMENTS.json` M06; `baseline:01-product/DOMAIN_AND_WORKFLOW_CONTRACTS.md` Enterprise readiness; OD-001/002/003/007/009/013.

### ER-06. Resolve readiness gaps and recurring obligations

**Inputs/output:** reviewed readiness criteria, source inspection/training/drill/cache/critical-asset facts, activation requirement and known site risk -> accountable gap or recurring action with actual owner, next action, due/review date, evidence and reviewer disposition. Missing or expired evidence remains unknown/incomplete. No automatic safety or compliance conclusion follows from a checklist tick.

**Preserve original scope:** critical asset registries, response maps, site cache plans, Facility Coordinator training, readiness reviews, open deficiencies/site risks, compliance-support schedules, tabletop/drill tracking and activation checklists all remain in launch scope. Each is represented as the relevant linked readiness record/evidence/action, not an unrelated new app or a replacement CMMS/regulatory system.

**Operations:** record a gap from approved criteria/field finding; assign linked task through IF-08; set due date/recurrence from actual configured terms; submit remediation evidence; review/resolve/reopen condition with reason; preserve accepted exception and review/expiry; generate the next recurring occurrence once. Proposed implementation pins recurrence timezone, schedule version and occurrence identity to prevent duplicate or drifting due items; it does not invent the frequency.

**Authority:** a person can submit evidence without being allowed to certify closure. A task marked complete is evidence of an action, not proof the site condition is resolved. Exceptions must state who allowed what, why and until when under actual authority. Facility readiness and program activation consume these facts but do not override MAP-04 commercial scope or MAP-03 safety gates.

**UI:** assigned list shows due/overdue, condition, source, owner, next action, blocker and review state. Completed and reopened items retain history. Enterprise dashboards show unknown/expired separately from verified readiness. Client-visible descriptions use the permitted projection, not unrestricted internal assessment notes.

**Failure/evidence:** missing evidence, expired training/credential, returned correction, unauthorized close, overdue recurrence, duplicate scheduled occurrence, changed schedule and project closeout leaving a site risk open. Avoid a full scheduling framework; use existing approved job/queue capability through the appropriate map.

Sources: `repo:docs/01-product/MODULE_MAP.md` Readiness; `repo:REQUIREMENTS.json` M06/M12/M17; `repo:docs/01-product/DATA_SPINE.md` Tasks / Work Orders; OD-001/003/007/009/010 where vendor evidence applies.

### ER-07. Produce explainable dashboards and period snapshots

**Inputs:** permission-filtered request/project/task/incident facts (MAP-03), scoped released documents (MAP-06), vendor and operational finance/reserve facts (MAP-04), readiness/program/site data, and explicit external-source freshness (MAP-07). **Output:** defined metric/projection or immutable period snapshot, not a second editable business record.

**Metric contract:** stable definition/version, business question, source records/fields, unit, relevant period/timezone, eligible population and denominator, filters, missing/expired handling, refresh/source cutoff, deduplication and allowed audience. Proposed data design records the definition version and referenced source revisions/cutoff so a historical result can be reproduced. Do not turn permission-filtered partial data into an unqualified account-wide claim.

**Coverage:** client/facility/project/incident dashboards; enterprise/portfolio readiness and open-risk views; program performance; vendor scorecards; cost/cap/invoice/reserve summaries; QBR sections, executive actions and value ledger. Actual counts and financial amounts derive from owning records. Risk scoring requires a reviewed definition and appropriate qualified interpretation; absence of data cannot produce “low risk,” zero problems or compliance.

**Queries/mutations:** read authorized live projection and its source breakdown; maintain controlled metric/dashboard definition; create/retrieve a period snapshot; generate reviewable QBR sections; annotate supported analysis without editing underlying transactions. Filters, searches, totals, chart labels, drill-through, downloads and exports all obey the same audience boundary. Current access must be rechecked when opening an old snapshot.

**UI:** show period, source freshness and population. Explain unknown and excluded values. Every consequential number has a useful drill-through to permitted source records, or a clear explanation when the reader is allowed only a summary. Never leak a restricted document title or private financial line through a tooltip, empty-state count, export or aggregate.

**Failure/evidence:** duplicated portfolio membership, stale Moldo/other integration, partial data, zero eligible population, missing cost, expired readiness evidence, definition revision and revoked access to historic snapshot. Prove reproducibility with exact source records and permission filtering, not a sample chart screenshot or hard-coded impressive number.

Sources: `repo:docs/01-product/MODULE_MAP.md` Reporting / QBR; `repo:docs/01-product/DATA_SPINE.md` Reports / Dashboards; `repo:REQUIREMENTS.json` M17; `repo:docs/03-data/ADR-001-DOMAIN-AND-MOLDO-BOUNDARIES.md`; OD-003/006/007/009/011/016 where applicable.

### ER-08. Release a QBR that leads to action

**Inputs/output:** exact reporting period/definition/source snapshot, supported analysis, approved section content and executive action list -> versioned QBR package with source references, review disposition, release audience and follow-up. MAP-06 handles document revision/review/release; MAP-05 owns report meaning and action content. Runtime AI, if later enabled through MAP-06, can prepare cited drafts but cannot certify metrics or release the package.

**Action contract:** each proposed executive action has source context, owner, next action, due/review date and status. Link to MAP-03 task service where it tracks work. Record the underlying readiness/commercial/project decision in its owning module; marking the QBR action done must not bypass that decision. Carry unresolved actions into the next period with history rather than recreating unrelated duplicates.

**Value ledger:** record what happened, relevant source evidence and whether value is observed, estimated or otherwise limited. Do not fabricate cost avoided, ROI, response improvement or compliance benefit. A proposed value estimate requires stated method/assumptions and review; an absent fact stays unknown. This supports credible client/partner value without new promises or invented performance claims.

**Operations:** assemble/review package from pinned snapshot; return for correction; create new content revision; request exact controlled release; query current/superseded/withdrawn disposition; export permitted package; assign/review follow-up. A correction to underlying data triggers an explicit new report revision where needed, not a silent change to already released bytes.

**UI/failure/evidence:** executive summary highlights material verified facts and decisions required; detailed source appendices stay accessible to entitled readers. Show draft vs released clearly. Prove a QBR linked to real synthetic source records, wrong audience denial, source correction with preserved old release, permission revocation, and an executive action that closes only after its owning domain action succeeds.

Sources: `repo:docs/01-product/MODULE_MAP.md` Reporting / QBR; `repo:docs/06-ui/EXECUTIVE_PORTAL_MAP.md`; `repo:REQUIREMENTS.json` M17; `repo:docs/03-data/DOCUMENT_VERSION_RELEASE_CONTRACT.md`; OD-001/002/003/004/007/011/014 only if AI data use is activated.

## 5. Interface obligations and error behavior

| Interface | Proposed source contract from this map | Required consumer behavior |
|---|---|---|
| IF-04 directory | Stable account/facility/area identity and permitted relationships; context revision; optional program/portfolio; effective coverage reference with provenance | MAP-03 preserves precise location; MAP-04 binds actual relevant parties/terms; MAP-02 never loses facility context |
| IF-04 program | Executed source clause/version, facility/service/effective period, activation requirements/exceptions and unresolved coverage | Never treat relationship membership as engagement authority or unrestricted access |
| IF-12 readiness | Condition/evidence/version/review date, owner/action, unknown/expired/exception and task reference | MAP-03 uses current context and limits; MAP-02 renders truthful action; MAP-06 preserves released artifact separately |
| IF-12 reporting | Definition and snapshot version, eligible population, filters/time period, source refs/freshness, unknown handling, allowed projection | UI and exports preserve qualifiers; AI cannot manufacture missing data or expand audience |
| IF-08 consumed | Stable project/task/incident facts and action result | Store source references; do not maintain a second editable project/task status |
| IF-11 consumed | Vendor eligibility and financial/reserve source records with correction lineage | Do not recompute cap authority or keep a separate reserve balance |

All mutations are current-capability checks with expected revision, authoritative server actor/time and IF-14 audit. All associations validate tenant/facility scope. Proposed versioned configuration cannot rewrite approved history. A stale dashboard never grants action authority. Aggregate/read/export permissions are tested alongside ordinary detail access.

IF-18 UI states apply to every list/detail/edit: unavailable, loading, empty, populated, denied, recoverable error, saving, uncertain outcome, conflict, current and stale. Preserve permitted unsent work across navigation and refresh using MAP-02's shared handling. On an account/site switch, resolve a dirty editor instead of silently relocating it. On revoked access, clear protected cached rows and follow MAP-01's safe recovery. Do not label an empty RLS-filtered list as a known forbidden object or a backend failure.

## 6. Dependency-ready slices and exact file allocation

Proposed areas: `web/src/features/accounts/`, `web/src/features/programs/`, `web/src/features/portfolios/`, `web/src/features/facilities/`, `web/src/features/readiness/`, `web/src/features/reporting/` and matching targeted tests. Existing `web/src/pages/directory.tsx`, `web/src/lib/directory-api.ts` and `web/src/lib/use-directory.ts` require explicit allocation because other maps consume them. Names are a proposed ownership layout, not an instruction to restructure working code for its own sake. Shared shell/router/context/styles/module definitions, security helpers and migration ordering remain lead-controlled.

| Slice | Ready when | Useful outcome | Narrow critical proof |
|---|---|---|---|
| ER-S1 Directory and relationships | Existing IF-01/02 plus IF-18 context handling | Correct client/site/contact and simple vs enterprise starting view | Wrong account/site, full pagination, changed profile preserving history |
| ER-S2 Physical areas and history | IF-04 minimum directory, source linking contracts | Repeat work uses the same real site/area and permitted history | Cross-site parent, renamed area, duplicate address and payer distinction |
| ER-S3 Program and portfolio | Executed synthetic source/terms contract, IF-07 consumer agreement | Explainable effective coverage/grouping with incomplete activation visible | No-MSA job, uncovered work, period change and duplicate rollup |
| ER-S4 Passport and gaps | Site/areas, IF-09 evidence and bounded IF-08 task service | Usable current site knowledge with accountable missing items | Unknown/expired evidence, restricted location, task vs verified closure |
| ER-S5 Recurring readiness | One actual configured schedule/version and approved job mechanism | Due/overdue review/drill/training/cache work without duplicate occurrences | Schedule change, retry, overdue and reopened condition |
| ER-S6 Live projections and snapshot | A small integrated source journey across IF-08/09/11 | Trustworthy project/readiness/financial summary with source drill-through | Missing data, denominator, permission and freshness |
| ER-S7 QBR and executive action | Pinned snapshot and exact IF-09 release slice | Reviewed package and owned follow-up backed by real source evidence | Correction preserves release, revoked audience, authoritative action closure |

ER-S1/2 can feed the first ordinary project while ER-S3/4 develop independently. ER-S6 first uses a small complete journey rather than waiting for every source module or filling gaps with invented values. Reporting breadth expands as real source producers become accepted. This preserves all enterprise scope while delivering useful earlier increments.

## 7. Completion and live decisions

| Requirement | Final completion target | Inadequate substitute |
|---|---|---|
| M02 | Multi-type client, scoped relationships, appropriate defaults/onboarding, historical integrity and access denial | Read-only name directory |
| M03 | Optional/multiple programs, source-backed effective coverage/activation, controlled out-of-coverage path | Account MSA checkbox |
| M04 | Permitted multi-portfolio membership, historical grouping and source-based rollups | Duplicate facility copies or access by grouping |
| M05 | Stable physical facility/areas, precise scoped work and linked site history | Address matching or one unstructured notes field |
| M06 | Versioned passport, accountable verified readiness/gaps/recurrence and truthful unknowns | Checklist progress graphic or unsupported “compliant” badge |
| M17 | Defined reproducible metrics, source drill-through, controlled QBR and owned actions | Sample charts, unsupported ROI or mutable snapshot totals |

Existing decision dependencies: OD-001 actual people/delegation, OD-003 portal/audience defaults, OD-007 MSA packaging and executed terms, OD-008 actual emergency promises, OD-009 qualifications/professional boundaries, OD-010 vendor responsibility, OD-011 retention and permitted audit/report export, OD-012 onboarding/recovery, OD-013 real-upload procedure, OD-015 production/real-data onboarding and OD-016 integration sharing. OD-002/004 govern document review/release; OD-006 governs financial meaning; OD-014/017 apply only when optional AI/outbound actions are activated. These gate specific live actions, not all engineering or a permanent wait for every owner decision.

**Handoff:** named slice/requirements; pinned provider and consumer contracts; base/result commits; owned files; source/schema/configuration delta; real implementation vs proposal; source-provenance and access evidence; unresolved narrow decision; next ready slice. Update canonical controls through the integration lead, not a competing enterprise status ledger.

## Canonical acceptance accountability

The following exact criteria belong to this map. Axx is a reference alias for the ordered criterion in the pinned `repo:REQUIREMENTS.json`, not a new live requirement ID or a completed-status claim. Preserve all required evidence levels in the source. Collaborating maps and hashes are in `coverage/ACCEPTANCE_OWNERSHIP.json`.

### M02

- **M02.A01** — one account can have multiple client types, users, and scoped relationships.
- **M02.A02** — simple and enterprise clients receive appropriate navigation without service hard limits.
- **M02.A03** — billing contact, requester, payer, signer, property owner, and approver can be different parties.
- **M02.A04** — account changes do not rewrite historical project/authorization facts.
- **M02.A05** — unassigned accounts remain inaccessible.
- **M02.A06** — Client-type defaults prioritize the right requests and terminology without forbidding valid services; role-specific onboarding and quick-reference guidance support common tasks.

### M03

- **M03.A01** — an account can operate with zero, one, or several programs.
- **M03.A02** — coverage and activation are explicit per facility and effective period.
- **M03.A03** — the correct versioned terms/rate basis are attached to an engagement.
- **M03.A04** — an MSA never bypasses project scope and authorization.
- **M03.A05** — program-specific commitments are configurable and auditable.
- **M03.A06** — out-of-coverage work enters a controlled approval route.

### M04

- **M04.A01** — assets can be grouped into multiple permitted portfolios.
- **M04.A02** — changes preserve site-level truth and historical group membership where relevant.
- **M04.A03** — executive/portfolio views derive from authorized underlying records.
- **M04.A04** — grouping never grants unintended cross-account access.
- **M04.A05** — an ordinary one-property engagement does not need an invented portfolio.

### M05

- **M05.A01** — repeat work can attach to the same stable site and physical areas.
- **M05.A02** — observations and scope identify actual included/excluded areas.
- **M05.A03** — facility history preserves linked incidents/projects/docs instead of copying them into one notes field.
- **M05.A04** — facility assignments restrict site users.
- **M05.A05** — physical site identity, paying account, and business relationship are not accidentally conflated.

### M06

- **M06.A01** — a facility has a versioned passport with owners, source evidence and review dates.
- **M06.A02** — readiness gaps have responsible owners, actions and follow-up.
- **M06.A03** — activation reflects completed requirements and explicit exceptions.
- **M06.A04** — response information is available to assigned people.
- **M06.A05** — recurring work surfaces due/overdue items.
- **M06.A06** — reporting distinguishes verified readiness facts from unknown or expired information.

### M17

- **M17.A01** — totals and risk/readiness metrics resolve to authorized source records and defined denominators.
- **M17.A02** — period snapshots are reproducible.
- **M17.A03** — executive action items have owners and status.
- **M17.A04** — released QBRs are versioned packages.
- **M17.A05** — exports follow visibility rules.
- **M17.A06** — missing data is shown as unknown rather than zero or compliant.
- **M17.A07** — claimed value is supported and labeled accurately.
