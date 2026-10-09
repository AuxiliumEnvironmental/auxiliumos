> Historical phase document, retained for traceability. The 2026-10-08 owner mandate in AGENTS.md and EXECUTION_PROTOCOL.md supersedes preparation-only stop rules and first-slice scope ceilings. Permanent domain/security rules remain. Full delivery is REQUIREMENTS.json; pending owner policies permit synthetic development defaults with scoped live activation gates.

# Foundation Vertical Slice Control Packet

Last updated: 2026-07-05

Issue: #58 — Foundation vertical slice build-control packet

## Status

Documentation / control packet only.

This document does not authorize app code, Supabase schema, Supabase tables, Supabase storage buckets, auth providers, RLS policies, edge functions, Playwright installation, Claude Code implementation edits, Codex implementation edits, production deployment, real client data, PHI, secrets, or business authority decisions.

## Purpose

This control packet defines the first AuxiliumOS foundation vertical slice before implementation begins.

The purpose is to give future implementation issues a precise, bounded, repo-recorded control document so app/code work does not drift, overbuild, skip permissions, skip document release controls, or invent business authority.

## Source-of-Truth Rule

GitHub is the source of truth.

AI tools are workers.

One issue controls one branch and one controlled change.

No implementation may proceed unless a future issue explicitly provides:

- Issue title
- Branch name
- Allowed files
- Tool authorization
- Acceptance criteria
- Tests
- Out-of-scope rules
- Files-changed review checklist

## Canonical Data Spine

Client Account -> Program/MSA -> Portfolio -> Asset/Facility -> Zone/Area -> Incident -> Project Request -> Scope Record -> Authorization -> Project -> Tasks/Work Orders -> Deliverables -> Documents -> Communications -> Financial Records -> Reports/Dashboards -> Audit Events.

Every future implementation issue must preserve this spine or explicitly mark the work as global configuration, reference data, integration data, or out of scope.

## Foundation Slice Target

The first controlled build target remains:

Account -> User Role -> Facility -> Incident Request -> Admin Queue -> Document Upload -> Document Release -> Client View -> Audit Event.

This slice is intended to prove the minimum safe platform skeleton:

- Account ownership
- User membership
- Role-aware access
- Facility ownership
- Incident/request submission
- Admin review queue
- Document upload/staging
- Document hidden by default
- Document release workflow
- Client-visible released document access
- Audit events
- Positive permission tests
- Negative permission tests

## What This Packet Does Not Do

This packet does not:

- Create app routes
- Create UI components
- Create database tables
- Create schema migrations
- Configure auth
- Configure storage
- Create RLS policies
- Install Playwright
- Create tests
- Connect Supabase
- Use real data
- Use PHI
- Add secrets
- Finalize founder authority decisions

## Controlled Slice Boundaries

### Included In The Future Foundation Slice

Future issues may eventually implement these concepts only when separately authorized:

- Account placeholder or record
- User role placeholder or record
- Facility placeholder or record
- Incident/request placeholder or record
- Admin queue placeholder or workflow
- Document upload/staging placeholder or workflow
- Document release placeholder or workflow
- Client view placeholder or released-document view
- Audit event placeholder or record

### Not Included In The Foundation Slice

The foundation slice must not become:

- Full enterprise site passport
- Full MSA engine
- Full ROM engine
- Full sampling engine
- Full agreement/signature engine
- Full finance/cap engine
- Vendor portal
- Payment processing
- E-signature integration
- Production deployment
- Real client onboarding
- PHI-capable workflow
- Full report authoring system
- Full dashboard/QBR suite

## Future App Surfaces

The first future static app shell may include placeholder-only surfaces for:

- Dashboard
- Facilities
- Requests / Incident Request
- Admin Queue
- Documents
- Document Release Queue
- Client View
- Audit Events
- Account

These surfaces must be static/placeholders until future issues authorize real data, auth, schema, RLS, storage, and tests.

## Future UI Rules

Future UI work must preserve these rules:

- UI hiding is not security.
- Buttons may be placeholders until backend authority exists.
- Demo data only until real-data approval.
- No PHI.
- No real client names.
- No real addresses.
- No real documents.
- No real costs.
- No client-visible document unless release workflow exists.
- Messages/chat may not change scope.
- Approval labels must not imply real authorization unless the workflow exists.

## Future Permission Expectations

Future permission implementation must eventually prove:

- Correct-account access allowed.
- Wrong-account access denied.
- Removed/suspended user access denied.
- Assigned-facility access works as designed.
- Unassigned-facility access is denied where applicable.
- Draft/internal document hidden from client users.
- Released document visible only to authorized users.
- Admin queue limited to authorized internal users.
- Audit visibility follows approved rules.

No permission logic is authorized by this packet.

## Future Document-Control Expectations

Future document implementation must eventually prove:

- Every document has a class.
- Every document has a version.
- Every document has a status or release state according to the approved workflow docs.
- Draft/internal documents are hidden from clients by default.
- Released documents are visible only through release workflow and permission checks.
- View/download/release events are auditable where implemented.
- Document access is not based only on folder location.
- Messages/chat cannot release documents.

No document-release implementation is authorized by this packet.

## Future Audit Expectations

Future audit implementation must eventually record important actions such as:

- Request submitted
- Admin review/status change
- Document uploaded
- Document classified
- Document release requested
- Document released
- Document viewed/downloaded
- Permission/role changes
- Scope/change authorization events, if later included

No audit implementation is authorized by this packet.

## Future Test Expectations

Future implementation issues must include tests according to risk.

### Static app shell

Required where available:

- Build
- Lint
- Typecheck

If not available, the PR must document why tests are deferred.

### Permission-sensitive work

Required:

- Positive permission test
- Wrong-account denial test
- Removed/suspended user denial test

### Document-release work

Required:

- Draft document hidden test
- Released document visible test
- Wrong-account denial test
- Removed/suspended user denial test
- Release/view/download audit test where implemented

### Workflow/state work

Required:

- Valid state transition test
- Invalid transition denial test
- Audit expectation where implemented

### Message/scope work

Required:

- Message cannot change approved scope
- Message can only create a task/change-request draft if a future issue explicitly authorizes that workflow

## Future Issue Sequence From This Packet

The next implementation-planning sequence remains:

1. Static app shell scaffold and route placeholders
2. App test harness and Playwright baseline
3. Supabase schema design packet for foundation slice
4. Initial Supabase schema migrations for foundation slice
5. Development auth setup and test identities
6. RLS policies and permission-denial tests for foundation slice
7. Development storage buckets and document metadata staging
8. Foundation incident request and admin queue implementation
9. Foundation document release and client view implementation
10. Foundation audit, backup, and handoff proof

Each future issue must have its own branch, allowed file list, tool authorization, acceptance criteria, tests, and out-of-scope rules.

## First Future Implementation Candidate

The next possible implementation issue is:

Static app shell scaffold and route placeholders

That future issue may touch app code only if its issue body explicitly authorizes:

- Exact branch
- Exact app files
- Exact route/component scope
- Static-only demo data
- No backend
- No Supabase
- No auth
- No storage
- No RLS
- No real workflows
- No real client data
- No PHI
- No secrets
- Tests or documented test deferral

## Still Blocked

The following remain blocked until future issues explicitly authorize them:

- Supabase schema
- Supabase auth
- Supabase storage
- RLS policies
- Playwright installation
- Claude Code implementation edits
- Codex implementation edits
- Production setup
- Real client data
- PHI-capable workflows
- Real document release
- Real scope logic
- Real agreement/signature logic
- Real finance/cap logic

## Founder / Security / Legal / Professional Blockers

See:

`docs/00-control/FOUNDER_DECISION_CHECKPOINT_FIRST_BUILD.md`

No item listed there is final unless explicitly approved in the repository.

## Packet Conclusion

This control packet prepares the project for a future static app shell issue.

It does not authorize implementation.

The next safe task is to create a new issue:

Static app shell scaffold and route placeholders

That future issue must be app-code-specific, static-only, and tightly bounded.
