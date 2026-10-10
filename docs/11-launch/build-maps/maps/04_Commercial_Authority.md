# MAP-04: Commercial authority, vendors and operational finance

**Owns:** M10 ROM, M11 Agreements / Authorization, M15 Vendors and M16 Finance. Coordinates C03 with MAP-03 and MAP-06. **Reference baseline:** canonical `148d74d9720f0799e5d845bb789cd3fc3f43feb8` and October 9, 2026 reconciled launch package.

This map translates existing requirements into **proposed implementation contracts**. It does not approve legal text, taxes, rates, cap amounts, signer authority, vendor responsibility, reserve custody or live transactions. `repo:` resolves to `reference/sources/canonical/`; `baseline:` resolves to `reference/`. Descriptive operation names below are design obligations, not claims of existing endpoints/tables.

## 1. Work backward from the finished outcome

For each engagement, the right party can see what is proposed, how cost is estimated, who can bind whom, which exact work is authorized, what prerequisites remain, and what money has been committed, incurred, invoiced or paid. Auxilium can manage outside specialists without obscuring their qualifications, contracting party or payer. Repeated clicks, provider callbacks or sync retries never duplicate a commitment. The history shows which exact approved amendment took effect and when.

The completed journey is: traceable T&M ROM -> reviewed frozen scope/terms -> exact authorized signer decision -> required payment/PO/cap conditions -> effective authority -> controlled project costs/vendor commitments -> issued invoice/export and reconciled payment/reserve history. A recommended cap is not a granted cap; a signature is not proof every prerequisite was satisfied; an issued invoice is not proof of payment.

Sources: `repo:REQUIREMENTS.json` M10/M11/M15/M16/C03; `repo:docs/01-product/MODULE_MAP.md` sections 10, 11, 15, 16; `repo:docs/05-workflows/AGREEMENT_AUTHORIZATION_WORKFLOW.md`; `baseline:01-product/DOMAIN_AND_WORKFLOW_CONTRACTS.md`.

## 2. Single owners and published interfaces

| Owns here | Consumes from other maps | Provides |
|---|---|---|
| Versioned ROM calculation, assumptions, commercial estimate/cap recommendation | IF-03 configured rate/calculation versions; IF-04 parties/site/program references; IF-06 exact scope/sample/deliverable proposal | IF-07 ROM reference and disclosed commercial effect |
| Agreements, signatures, cap approval, payment/PO prerequisites and effective authorization/amendment/exception | IF-01/02 current actor and delegated capabilities; IF-06 scope fingerprint; IF-04 executed coverage; IF-09 exact artifacts; IF-15 signature/payment adapter evidence | IF-07 current effective authority and immutable chain |
| Vendor profile, eligibility/credentials, scoped assignment, responsibility and closeout requirements | IF-04 facility/program; IF-08 project/work; IF-09 credential/closeout files; IF-02 access | IF-11 eligibility, assigned work and source-based vendor facts |
| Costs, purchase approvals, invoice/line history, reserve transactions and accounting reconciliation | IF-07 authorized cap/terms; IF-08 performed work; IF-11 vendor responsibility; IF-15 provider/export responses | IF-11 financial records and reconciled projections |

MAP-05 owns account relationship metadata, program coverage/terms indexing and facility vendor context. This map owns an engagement's **frozen commercial interpretation and authority**, not mutable duplicates of those source records. MAP-03 owns professional scope, sample strategy and operational actions. MAP-06 owns file versions/review/release and actual outbound communication. MAP-07 owns provider transport; an adapter cannot write directly to effective authority or ledger state. MAP-01 provides capability/configuration/audit controls. MAP-02 owns shared presentation patterns.

Moldo commercial workflow remains native to Moldo unless the engagement's explicitly approved contract states otherwise. OS must not coerce it into an invented T&M agreement, assume billing ownership, or create a second signature/payment obligation. See `repo:docs/03-data/ADR-001-DOMAIN-AND-MOLDO-BOUNDARIES.md`, OD-016.

## 3. Baseline and truth limits

The frozen source contains the proposed authorization/change/emergency state contracts, development policy defaults, catalogue limitation/agreement topics and UI preparation panels. The generic `workspace_plans` persistence is a creator-only synthetic preparation record. It is not a quote, signed agreement, effective cap, vendor appointment, invoice or reserve transaction. These modules' end-to-end acceptance remains unestablished in the reconciled package.

Inspect current source before a build slice. Existing shared document controls may support exact artifacts, but their synthetic tests do not certify a signature provider or financial transaction. Existing OD-006/007/008/010/017 records define live activation decisions; null values are pending, never zero, free, unlimited or an implied promise.

Sources: `repo:docs/03-data/WORKSPACE_PLANS.md`; `repo:web/src/pages/module-screen-definitions.ts`; `repo:config/policy-defaults.json`; `repo:OWNER_DECISIONS.json`; `baseline:01-product/MODULE_ACCEPTANCE_MATRIX.json`; `baseline:00-reconciliation/RECONCILED_STATUS.md`.

## 4. Capability map

### CA-01. Explain and preserve the ROM basis

**Input:** exact scope and sample-plan revisions; requested deliverables; field labor, reporting and qualified-review assumptions; travel/mobilization; lab/direct cost and shipping/TAT; equipment/PPE; applicable versioned rate basis, approved modifiers and exclusions. Imported historic data retains its source, date and comparability limits. Missing inputs are not silently zero.

**Authoritative output:** immutable estimate revision with calculation inputs, ranges, units/currency, assumptions, exclusions, rate/configuration version, preparer/reviewer, trace to scope and recommended cap. Native default remains T&M; no fixed-price workflow is introduced here. Confidence explains data quality and unresolved facts rather than displaying an invented precision score.

**Queries/mutations:** list/retrieve estimate revisions and their basis; calculate candidate; submit/review a candidate where configured; preserve issued estimate; propose revision; compare incurred actuals against the applicable historic estimate. Proposed engineering design: retain the arithmetic model/version and decimal rounding rule so totals can be reproduced; this specifies arithmetic integrity, not a tax/rate policy.

**Authority and transition:** draft estimates do not bind the client or authorize work. If scope/rates/input assumptions change, recalculate a new candidate and disclose differences. Current authorized cap and historical ROM stay unchanged until their own valid amendment. A local configuration override cannot exceed the approving party's capability.

**UI/action handling:** show useful range and principal drivers first, then line-level basis and exclusions. Explain what sampling, rush work or changed areas would affect. Separate “estimate,” “recommended cap,” and “authorized cap.” An incomplete estimate can be saved as an incomplete proposal but cannot look ready for binding approval. Avoid prefilling remembered Auxilium job rates or Moldo prices.

**Failure/evidence:** unsupported/missing rate prevents live issuance; repeated calculation with pinned inputs reproduces outputs; altered scope makes the candidate stale; actual-to-ROM comparison leaves original untouched. Prove a sample/travel change affects the right lines, missing data stays explicit, and a concurrent rate revision cannot silently change an issued estimate.

Sources: `repo:docs/01-product/MODULE_MAP.md` ROM Module; `repo:REQUIREMENTS.json` M10; `repo:docs/02-ontology/SAMPLING_ENGINE.md`; OD-005/006/007/009.

### CA-02. Assemble an exact reviewable authorization

**Inputs:** account/program and covered facility; engagement/request; exact scope revision/fingerprint; terms/template/block versions; applicable rate basis; payer; signer and delegation evidence; cap or explicit applicable cap policy; sampling/deliverables; required payment/PO conditions; effective/expiration policy; change rules; any limited emergency purpose.

**Output:** one immutable candidate package that identifies the correct contracting/obligated parties and precisely proposed work. Billing contact, requester, owner/operator, payer, approver and signer may be different people/entities. Contact identity does not establish signing or spending authority.

**Queries/mutations:** read current source inputs and approved template versions; assemble draft; validate consistency; record responsible technical/commercial reviews; freeze candidate ready for signature. Display which missing/contradictory input prevents progression, including unsigned MSA, uncovered facility/service, expired period, unsupported limitation combination, stale scope, missing payer or absent commercial decision.

**State:** `draft -> internal_review -> ready_to_send` only after scope and terms are frozen and recipients' authority is checked. Technical review approves professional substance; commercial authority does not overwrite measured facts or substitute for qualification. Agreement blocks reference the 19 recovered topics and scope limitations without asserting that the catalogue text is approved legal language.

**UI/failure/evidence:** present concise work, exclusions, sampling, payment/cap and signer summary with exact artifact preview. An editable note or typed name is not a signed package. If scope changes before send, mark the candidate stale and prepare a new one. Prove version match, distinct payer/signer, absent cap policy rejection and impossible clause combination surfaced for review.

Sources: `repo:docs/05-workflows/AGREEMENT_AUTHORIZATION_WORKFLOW.md` Required authorization record; `repo:docs/02-ontology/SCOPE_LIMITATIONS.md`; `repo:docs/01-product/DATA_SPINE.md` Authorization; OD-001/005/006/007/009.

### CA-03. Send, sign, reconcile and make authority effective

**Inputs/output:** frozen candidate, current permitted recipient, configured signature process and approved send channel -> transaction reference, delivery attempts, exact-version signature evidence and ultimately an effective authorization if every prerequisite passes. MAP-06 preserves the artifact; MAP-07 verifies provider transport; this map decides domain effect from verified evidence.

**States:** `ready_to_send -> sent -> partially_signed/fully_signed -> effective`. Preserve `declined`, `expired`, `voided` and `superseded` with actor/time/reason. Editing a sent payload creates a successor and invalidates that payload's pending signing path. Signed contents never mutate or acquire a backdated authorization.

**Signature evidence:** exact document/scope/terms revision and digest, signer identity, delegated authority, provider/process transaction, timestamp and required consent evidence. The implementation must use the configured process's verified evidence. A browser “signed” flag, screenshot or callback body without trusted origin does not suffice. Handling of a valid signature arriving after authority revocation/expiry is a reviewed deterministic policy, not silent activation.

**Queries/mutations:** obtain reviewable signature request; issue one authorized send intent; inspect delivery/signature/prerequisite status; process verified signature events; reconcile uncertain provider transaction; record satisfaction of required payment/PO/cap; evaluate effectiveness; record expiry/void/supersession with configured effects. No real send occurs merely because development fixtures passed.

**Concurrency/idempotency:** bind transaction, provider event ID, original operation intent and immutable payload. Reordered/duplicate callbacks produce one lawful state history, one effective authorization and one intended downstream event. After a timeout, query the known transaction before resending; do not create another commitment. The server rechecks current subject/object/delegation at its action, and provider event processing has explicit system provenance rather than impersonating the signer.

**UI:** separate waiting for signature from waiting for PO/payment/cap. Show exact next actor/action and unresolved prerequisite. “Fully signed” never looks like “mobilization released” if conditions remain. Unknown delivery stays pending reconciliation with safe retry. Signature/package downloads use current IF-09 access checks.

**Evidence:** synthetic connected round trip through the selected adapter contract, wrong signer/account, expired or altered candidate, missing prerequisite, revoked/over-limit delegation, forged callback and duplicate/reordered callback. A provider fixture proves only its tested boundary; actual provider verification and approved live terms remain explicit separate gates.

Sources: `repo:docs/05-workflows/AGREEMENT_AUTHORIZATION_WORKFLOW.md`; `repo:REQUIREMENTS.json` M11/C03; OD-001/005/006/007/009/017.

### CA-04. Bound amendments, caps and emergency authority

**Inputs/output:** MAP-03 change proposal or emergency review, controlling scope/authorization, applicable decision limits and source program clause -> explicit approved amendment or bounded exception, effective time, new authority reference and preserved old chain. An approved amendment governs only the domains it changes. The old static document-type hierarchy must not let a superseded original defeat a valid amendment.

**Mutations:** prepare exact amendment, review technical/commercial consequences, obtain correct client decision/signature when required, check prerequisites, make it effective, expose allowed operations to MAP-03. `change_approved` is not permission to update unrelated scope/cost facts; `change_implemented` records application of the valid change. Declination records the unchanged authority and any resulting limitation/work hold.

**Cap rules:** distinguish current granted cap, proposed increase, pending commitments, incurred amount and remaining authority under approved policy. Do not invent a change threshold, validity period, percentage alert or unlimited default. Concurrent spend must not both consume the same remaining authority; enforce the reviewed transaction policy in the owning financial mutation. Cap increase cannot retroactively authorize unsupported technical work or overwrite the original estimate.

**Emergency:** permissible paths come from `EMERGENCY_EXCEPTION_WORKFLOW.md`: applicable active MSA clause, signed emergency authority, approved written conditional authority or internally approved limited triage only where live policy expressly allows. Preserve requester, signer, payer, site/address, access contact, hazard, area, occupancy, safety, requested action, cap/policy, limited purpose, included/excluded sampling/deliverables, conditions and follow-up obligation. P0-P4 priority never grants permission by itself. No response-time promise or automatic cap is invented.

**Provider/consumer boundary:** IF-07 exposes exact effective scope, allowed purpose, applicable limits, prerequisites, validity and amendment/revocation facts. MAP-03 consumes it before conversion, mobilization and changes; MAP-05 may display coverage but cannot publish effective engagement authority. A future expiry job uses recorded policy and auditable system origin; it cannot change terms based on a UI clock.

**UI/evidence:** before/after change summary, remaining limits and one requested decision. Show emergency follow-up work as pending its own authority. Prove unchanged active work while replacement is pending, simultaneous amendment conflict, expired conditional authority, out-of-coverage request, client decline and rejection of unauthorized follow-up samples/report/visit/vendor spend.

Sources: `repo:docs/05-workflows/CHANGE_AUTHORIZATION_WORKFLOW.md`; `repo:docs/05-workflows/EMERGENCY_EXCEPTION_WORKFLOW.md`; `repo:docs/03-data/ADR-001-DOMAIN-AND-MOLDO-BOUNDARIES.md` Data refinements 6-7; OD-001/005/006/007/008/009.

### CA-05. Qualify vendors and make scoped assignments

**Inputs:** vendor profile/contact, service categories, geographic coverage, licenses/insurance/training/rate references, restrictions, active credential evidence, program-approved and facility-specific eligibility; project/work instructions; explicit client-direct/referral/Auxilium-managed responsibility.

**Output:** sourced eligibility disposition and one scoped assignment with the correct contracting party, professional responsibility, payer/payment route, instructions, required closeout and currently permitted audience. A vendor being in a directory does not establish current eligibility, authority, universal access or Auxilium's ability to perform its specialty.

**Queries/mutations:** maintain permitted vendor profile and credentials; review verification/expiry; query eligible vendors for actual site/category/program; propose/review assignment; authorize the specific engagement/commitment through IF-07; issue assigned instructions; change/cancel assignment with history. MAP-05 references the resulting approved facility/vendor matrix; it does not edit vendor credentials in a second place.

**Authority:** assign only within actual capability and program/site restrictions. A credential upload is evidence requiring the applicable verification, not automatic approval. Recheck eligibility and scope at assignment, and expose subsequent expiry/restriction to responsible review before affected work. Do not fabricate statutory license validity or qualification from a label; OD-009/010 supplies actual policy and qualified confirmation.

**UI:** the vendor view presents assigned instructions, location/access information permitted for that work, missing credentials, required uploads and closeout. It does not show unrelated client financials, executive reports, internal notes or competing vendor records. Internal users see why eligibility is pending/denied with safe evidence references.

**Failure/evidence:** expired/unknown credential, unapproved program/site, wrong service/geography, revoked assignment, alternate payer and client-direct handling. A synthetic assignment and vendor sign-in must demonstrate exact limited access; a hidden menu alone is insufficient. Unknown eligibility routes to review instead of defaulting eligible.

Sources: `repo:docs/01-product/MODULE_MAP.md` Vendors; `repo:docs/06-ui/VENDOR_PORTAL_MAP.md`; `repo:REQUIREMENTS.json` M15; OD-001/003/009/010.

### CA-06. Track vendor delivery and factual scorecards

**Inputs/output:** actual assignment, expected closeout artifacts, task/visit events, credential checks and reviewed performance facts -> accountable deficiencies, accepted closeout disposition and traceable scorecard inputs. Vendor uploads enter IF-09 document handling; they are not automatically client-visible or accepted technical outputs.

**Queries/mutations:** list missing closeout, submit file references, request correction, record assigned review/disposition, link verified work/cost evidence, query source-based scorecard. MAP-03 tracks operational tasks and project stage; this map owns vendor-assignment fulfillment and responsibility. MAP-05 owns portfolio/QBR reporting projections from these facts, not separate vendor scores.

**UI:** closeout shows each required item, status, owner and exact reason for return. Internal review distinguishes missing, rejected, pending and accepted evidence. A “complete” vendor checkbox must not close a project or release a report.

**Failure/evidence:** duplicate uploaded revision is reconciled; returned item remains open; unauthorized reviewer cannot accept; credential restriction persists despite document completion. Scorecard definitions show source and denominator; no invented rating or performance claim from an absent record.

Sources: `repo:docs/01-product/MODULE_MAP.md` Vendors/Reporting; `repo:REQUIREMENTS.json` M15/M17; OD-002/003/009/010/011.

### CA-07. Record operational financial truth and approval

**Inputs:** exact project/scope/authorization/program, actual work/cost references, approved rates/terms/tax/markup variables, payer, vendor contracting model and payment/prepayment conditions. **Outputs:** individually traceable commitment, incurred cost, approved purchase, invoice line and payment status with a reproducible relationship to authority.

**Distinct facts:** ROM estimate; recommended cap; granted cap; purchase request; approved commitment; incurred cost; invoice issued; payment received/reconciled. Proposed implementation uses explicit links and adjustment history instead of one mutable “amount spent.” Cost corrections preserve the original and reason. Units/currency/rounding and source date are explicit; choose exact implementation with the lead before dependent calculation code.

**Queries/mutations:** authorized financial detail and source breakdown; prepare purchase request; approve only within current delegation/cap; record commitment/cost with duplicate protection; reconcile actuals; prepare invoice lines; issue versioned invoice; record authorized adjustment and independently sourced payment update. No generic project edit or inbound message may approve spending or mark payment received.

**Policy boundaries:** no automated decision to float major vendor costs; approved client-direct/prepayment/management-fee policy governs the correct route. No default tax, markup, cancellation charge, retainer or payment term is supplied by memory. Payment status and cash custody follow actual approved source/provider records. OS remains operational finance with accounting export/integration, not a replacement general ledger, payroll or bank.

**UI:** role-appropriate billing views show what is owed, what changed and what action is required; only authorized financial users see sensitive detail. A billing contact does not automatically receive technical reports. Internal totals drill to authorized lines and revisions. If an export/provider outcome is uncertain, the source record remains issued/pending reconciliation, not reissued with a second ID.

**Evidence:** actual-to-ROM comparison; concurrent cap-limited commitments; wrong payer/account; over-limit delegate; duplicate cost/invoice intent; changed rate after issuance; and billing access without technical-document access. Validate arithmetic with meaningful boundary values and a source-reconcilable total, not duplicated tests of every form label.

Sources: `repo:docs/01-product/MODULE_MAP.md` Finance; `repo:docs/01-product/DATA_SPINE.md` Financial Records; `repo:REQUIREMENTS.json` M10/M16; OD-001/003/006/010.

### CA-08. Preserve reserve transactions and accounting reconciliation

**Reserve input/output:** approved account/program reserve terms, funding source and permitted purpose, explicit transaction approval -> immutable transaction history and derived balance. Record funding, use, reversal/refund or adjustment only as allowed by approved terms; a manual editable balance is not the ledger. Missing custody/use/refund terms keep live movement unavailable while the synthetic ledger can be built.

**Reserve operations:** query current balance with source transactions; propose/approve permitted use; record authorized transaction; reconcile provider/accounting reference; correct by authorized linked reversal/adjustment rather than rewriting history. Concurrent use cannot consume the same available balance twice. Program display consumes IF-11 and does not keep another editable balance.

**Export operations:** prepare versioned invoice/cost/reserve export from authorized source records; validate mapping; send through IF-15; record export batch/idempotency/provider reference; reconcile success, partial failure, duplicate or changed response; retry only unresolved work with the original intent. Export recipient/scope follows IF-02 and OD-011/017 where applicable. No transport “200” alone proves accounting acceptance or payment.

**UI/failure/evidence:** show pending vs reconciled items, per-record exceptions, exact retryable action and last sync. Prove duplicate export, timeout with later success, partial batch rejection, out-of-order callback, disabled connector, unauthorized reserve use and immutable correction. A connector outage must leave original financial records inspectable and exportable to permitted people.

Sources: `repo:REQUIREMENTS.json` M16; `repo:docs/01-product/MODULE_MAP.md` Finance/Integrations; `repo:docs/03-data/ADR-001-DOMAIN-AND-MOLDO-BOUNDARIES.md` Connector behavior; OD-006/007/010/011/015/017.

## 5. Interface and action requirements

| Interface | Required producer fields/semantics | Consumer acceptance |
|---|---|---|
| IF-07 ROM | Estimate ID/revision, scope/plan revision, rate/configuration versions, range/basis/exclusions, pending inputs; recommended cap separately | MAP-03 shows commercial consequences without treating estimate as authorization |
| IF-07 authority | Authorization and exact scope/terms IDs/fingerprints; payer/signer/delegation evidence; current status/effective period; applicable cap and prerequisites; amendment/expiry/revocation links | MAP-03 checks allowed action before mobilization; MAP-05 displays current coverage separately; MAP-06 binds exact artifact |
| IF-11 vendor | Vendor/assignment identity, category/site/program eligibility, evidence freshness, responsibility/payer, scoped instructions, closeout requirements/disposition | MAP-03 executes only assigned work; MAP-05 references source truth; MAP-06 preserves upload/release boundaries |
| IF-11 finance | Typed financial record, source authority/project/program, amount/unit/currency, historic configuration, transaction/status/adjustment lineage and reconciliation | MAP-05 derives metrics without recomputing business truth; MAP-07 transports without changing authority |

Authoritative mutations recheck identity/membership, scoped capability, qualification or delegation where needed, expected record revision, exact payload version, allowed state and prerequisites. Record actor/time and correlation server-side. Never accept arbitrary client timestamps or status as proof. Reads, searches, counts, attachments, exports and aggregate totals all respect current scope and audience.

Shared UI states from IF-18 apply: unavailable, loading, empty, populated, denied, recoverable error, pending, uncertain outcome, conflict, saved/current and stale/superseded. No success message until durable persistence. On timeout reconcile original intent. On conflict preserve safe unsent input and reveal the changed controlling record. On context change do not move a proposal between accounts; on access loss clear protected data under MAP-01 rules.

The effective-authority and financial mutation contracts must be reviewed together before crossing IF-07/IF-11. Do not create two tables/services capable of independently granting the same cap. Publish exact wire types, error semantics, current access rules and example fixtures with producer and consumer acknowledgment before implementation divergence.

## 6. Bounded delivery and file ownership

Proposed domain file areas: `web/src/features/rom/`, `web/src/features/authorizations/`, `web/src/features/vendors/`, `web/src/features/finance/` and narrowly matching tests. The lead may instead allocate existing files if a smaller change avoids needless restructuring. Shared `module-screen-definitions.ts`, router, styles, runtime, policy files, provider adapters and migration ordering are not independently writable by every map owner. Backend patches identify exact domain functions/tables and additive migration needs; integration lead controls final names/order and shared security changes.

| Slice | Minimum readiness | Connected useful outcome | Closure evidence |
|---|---|---|---|
| CA-S1 ROM basis | IF-03 synthetic versioned rates, IF-06 scope proposal | Reproducible estimate with visible uncertainty and saved revision | Scope change, missing rate, preserved issued basis |
| CA-S2 Authority package | IF-04 party/site and IF-06 exact scope; IF-09 artifact reference | Reviewable exact terms/scope/cap package | Wrong signer/payer, changed fingerprint, missing prerequisite |
| CA-S3 Effective authorization | Bounded IF-15 signing fixture/provider contract plus IF-10 approved send behavior | One verified decision yields one effective authority under configured prerequisites | Duplicate/reordered/forged callback; scope mismatch; pending payment |
| CA-S4 Project amendment/emergency | MAP-03 existing project/change slice, relevant program clause if used | Limited reviewed change or exception controls real downstream behavior | Concurrency, decline, expiry, follow-up outside authority |
| CA-S5 Vendor assignment/closeout | IF-08 work, IF-09 documents and explicit IF-02 vendor scope | Eligible vendor sees only assigned instructions and returns required evidence | Expired eligibility, cross-vendor denial, upload not released |
| CA-S6 Operational money | Existing effective authority and performed-work/cost refs | Traceable commitments/costs/invoice with correct cap and payer | Double spend/duplicate issue, rate history, forbidden technical access |
| CA-S7 Reserve/export reconciliation | One approved synthetic policy and bounded adapter contract | Ledger-derived balance and recoverable accounting export | Immutable adjustment, uncertain success, partial failure, duplication |

Slices can proceed against an acknowledged contract and realistic synthetic fixtures while the provider's implementation develops. They cannot be reported as integrated or live until the actual producer/consumer boundary passes. Do not wait for the entire enterprise/reporting map to finish before a single ordinary engagement can function. Do not enable binding transactions to make a demo appear finished.

## 7. Completion, decisions and handoff

| Requirement | Complete when | False completion to reject |
|---|---|---|
| M10 | Scope-linked reproducible ROM, justified range/confidence, immutable basis and actual comparison | Editable estimate note or invented fixed price |
| M11 | Exact signer/terms/scope evidence, prerequisite-controlled effectiveness, bounded emergency/amendments, deterministic expiry/revocation and retry | Signature checkbox, saved PDF or generic approval |
| M15 | Eligibility, explicit responsibility, scoped vendor access, tracked closeout and factual scorecards | Vendor directory alone |
| M16 | Separate caps/commitments/costs/invoices/payments, enforced approvals, historical terms, immutable reserve and reconciled export | Dashboard total, editable reserve balance or UI-only invoice |

Existing live decision IDs: OD-001 real delegation; OD-003 audiences; OD-005 exact scope/templates; OD-006 rates/caps/payment/reserve rules; OD-007 executed MSA translation; OD-008 emergency approvers and promises; OD-009 qualifications; OD-010 contracting/payment responsibility; OD-011 retention/export; OD-016 Moldo commercial/sharing boundary; OD-017 external sends/actions. OD-002/004 apply to document handling and OD-013/015 to real data/production. These are targeted activation dependencies, not a reason to stop unrelated synthetic development or reask settled architecture questions.

Handoff includes slice/requirements, pinned IF versions, base/result commits, owned files, exact current behavior, schema/configuration delta, relevant live gate, evidence by environment and boundary, and the next ready work. No new “commercial build tracker” replaces `BUILD_QUEUE.json`, `BUILD_STATE.json`, `REQUIREMENTS.json` or `OWNER_DECISIONS.json`.

## Canonical acceptance accountability

The following exact criteria belong to this map. Axx is a reference alias for the ordered criterion in the pinned `repo:REQUIREMENTS.json`, not a new live requirement ID or a completed-status claim. Preserve all required evidence levels in the source. Collaborating maps and hashes are in `coverage/ACCEPTANCE_OWNERSHIP.json`.

### M10

- **M10.A01** — estimates show assumptions, ranges, exclusions and rate version.
- **M10.A02** — scope/sampling/travel inputs have traceable effects.
- **M10.A03** — revisions preserve their bases.
- **M10.A04** — recommended cap differs from granted cap.
- **M10.A05** — actual work costs can be compared to the applicable estimate without retroactively changing it.
- **M10.A06** — confidence is justified by data quality, not a fabricated precision score.

### M11

- **M11.A01** — authorized scope version, signer authority, payer, rate basis, cap, sampling and terms are captured as an immutable approved record.
- **M11.A02** — signature evidence attaches to the exact version.
- **M11.A03** — valid authority controls mobilization and changes.
- **M11.A04** — expiry/revocation/supersession has deterministic effects.
- **M11.A05** — emergency exceptions are explicit, limited and reviewed.
- **M11.A06** — retries cannot create duplicate commitments.
- **M11.A07** — Emergency intake records requester, signer, payer, site/address, access contact, hazard, affected area, occupancy, safety flags, action and cap; follow-up services require further authorization unless explicitly covered.

### M15

- **M15.A01** — assignment checks category, site/program authorization, active credential status and applicable restrictions.
- **M15.A02** — vendors see assigned instructions/work only.
- **M15.A03** — required closeout documents and evidence are tracked.
- **M15.A04** — scorecards derive from recorded facts.
- **M15.A05** — financial and professional responsibility remain explicit.
- **M15.A06** — a vendor upload is not automatically client-released.

### M16

- **M16.A01** — money records trace to scope/project/authorization and correct client/program.
- **M16.A02** — authorized cap, committed amount, incurred amount and invoiced amount are not conflated.
- **M16.A03** — approval requirements are enforced on mutations.
- **M16.A04** — rate/tax/markup/terms changes do not alter issued history.
- **M16.A05** — invoice/export retries reconcile.
- **M16.A06** — reserve balances derive from immutable transactions and explicit permitted uses.
- **M16.A07** — reporting can show the inputs behind a total.
- **M16.A08** — Vendor management fees and prepayment/client-direct handling are configurable proposed commercial policies; the system does not silently commit Auxilium to floating major vendor costs.
