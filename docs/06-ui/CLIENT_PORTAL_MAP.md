# Client Portal Map

Status: Proposed final-system design under the 2026-10-08 development mandate; no runtime implementation or final policy approval claimed. Authority: [OWNER_DECISIONS.json](../../OWNER_DECISIONS.json), especially OD-003 through OD-008, OD-012 and OD-016. Evidence: [REQUIREMENTS.json](../../REQUIREMENTS.json).

## Shared engine, appropriate views

Simple clients see Home, Requests/Projects, Documents and Messages; Agreements and Billing appear only when permitted. Enterprise clients additionally receive assigned Facilities/Portfolios, Readiness, Incidents and executive reports. Account configuration changes navigation depth, not separate copies of workflows or data. A small job need not create a Program/MSA or Portfolio.

Home shows required client actions, current work and released documents. Request intake uses plain-language issue/intent prompts, facility/area context, payer/signer/access information and clearly states that submission is awaiting review. Emergency routing follows its dedicated workflow. An incident can generate multiple requests; display their relationship without merging their authorization.

## Project and document experience

Project detail presents status, next action, authorized work, scheduled visits, agreed deliverables and project-linked messages. Clients see concise statuses with useful next steps; internal review stages remain internally detailed. Approvals display the exact proposed revision and material scope/cost/limitation changes.

Documents show only the authorized released audience's files. Drafts/internal notes are excluded from UI, search, counters, previews and direct links. Preserve the current released version while a replacement is drafted. Authorized historical versions are unmistakably labeled. An uploader's permitted receipt does not label their submission an approved deliverable. Finance permissions are independent from report access.

## Acceptance and recovery

Verify wrong-account/facility denial, signed-out direct links, independent suspended-membership denial, stale sign-in recovery, no draft leaks and safe upload retry. Forms retain drafts appropriately and identify unsaved/pending/failed states. No PHI in uploads or examples; healthcare intake warns against patient data. Messages cannot change approved scope.

Enterprise users may see permitted Moldo work through OS integration. Ordinary Moldo clients/staff continue in Moldo; no automatic cross-system membership. Companion functionality is deferred. Pending owner settings affect only the corresponding live approval/sharing step, with a clear next action; they do not stall unrelated build work.
