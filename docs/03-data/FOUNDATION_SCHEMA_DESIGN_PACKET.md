> Historical phase document, retained for traceability. The 2026-10-08 owner mandate in AGENTS.md and EXECUTION_PROTOCOL.md supersedes preparation-only stop rules and first-slice scope ceilings. Permanent domain/security rules remain. Full delivery is REQUIREMENTS.json; pending owner policies permit synthetic development defaults with scoped live activation gates.

# Foundation Schema Design Packet

Last updated: 2026-07-06

Issue: #66 — Supabase schema design packet for foundation slice

## Status

Documentation / data planning only.

This document does not authorize Supabase migrations, schema creation, tables, auth providers, storage buckets, RLS policies, edge functions, production deployment, real client data, PHI, secrets, Claude Code implementation edits, Codex implementation edits, or final business authority decisions.

All table concepts in this document are draft / not implementation-approved until a future migration issue explicitly authorizes them.

## Purpose

This packet documents the first foundation-slice schema design before any database implementation begins.

The goal is to map the first build slice to candidate data concepts, identify ownership, document relationships, preserve unresolved decisions, and define future testing requirements before migrations are created.

## Source-of-Truth Rule

GitHub is the source of truth.

AI tools are workers.

One issue controls one branch and one controlled change.

Schema design in this packet is not schema implementation.

## Canonical Data Spine

Client Account -> Program/MSA -> Portfolio -> Asset/Facility -> Zone/Area -> Incident -> Project Request -> Scope Record -> Authorization -> Project -> Tasks/Work Orders -> Deliverables -> Documents -> Communications -> Financial Records -> Reports/Dashboards -> Audit Events.

Every candidate data concept must map to this spine or be marked as a derived surface, global configuration, reference data, integration data, or out of scope.

## Foundation Slice Target

The first controlled build target remains:

Account -> User Role -> Facility -> Incident Request -> Admin Queue -> Document Upload -> Document Release -> Client View -> Audit Event.

## Design Stance

This packet uses candidate table concepts only.

No SQL is authorized.

No migration file is authorized.

No Supabase dashboard edits are authorized.

No app connection is authorized.

No real client data is authorized.

No PHI is authorized.

## Candidate Table Concepts

| Candidate concept | Proposed implementation stance | Spine mapping | Owner module | Current status | Notes |
|---|---|---|---|---|---|
| `client_accounts` | Candidate table | Client Account | Accounts / Core | Draft / Not implementation-approved | Represents the account entity. Must not store real client data until security readiness. |
| `user_profiles` | Candidate table linked later to auth identity | User Role / Core identity support | Core / Security | Draft / Not implementation-approved | Does not configure auth. Auth provider strategy remains unresolved. |
| `account_memberships` | Candidate table | Client Account -> User Role | Core / Accounts / Security | Draft / Founder review required | Blocked by account membership model and role authority decisions. |
| `facilities` | Candidate table | Asset/Facility | Assets | Draft / Not implementation-approved | Facility/property records for fake/demo foundation slice only. |
| `incident_requests` | Candidate table | Incident -> Project Request | Requests / Intake | Draft / Not implementation-approved | Captures future client-submitted request/incident data. No real workflow implemented by this packet. |
| `documents` | Candidate table | Documents | Documents | Draft / Founder review required | Must preserve class, version, status/release state, owner, and object links. No storage buckets authorized. |
| `audit_events` | Candidate table | Audit Events | Core / Security | Draft / Not implementation-approved | Future immutable event record. Client visibility remains unresolved. |

## Derived Surfaces / Not Separate Core Objects

The following are future surfaces or workflow views, not new approved core objects:

| Surface | Recommended stance | Reason |
|---|---|---|
| Admin Queue | Derived from `incident_requests` status/review fields unless a future issue approves a separate queue table | Avoids inventing a new core object before workflow design is approved. |
| Document Release Queue | Derived from `documents` status/release fields and future audit events unless a future issue approves separate release records | Preserves document-control workflow without prematurely creating extra tables. |
| Client View | UI/view over released/authorized records only | Client-visible access requires RLS, release workflow, and tests. |
| Reports/Dashboards | Read/reporting layer over source records | Reports must not become a second source of truth. |

## Explicitly Out Of Scope

This packet does not include:

- Programs/MSA tables
- Portfolio tables
- Zone/Area tables
- Scope Record tables
- Authorization tables
- Project tables
- Tasks/Work Orders tables
- Deliverables tables
- Communications tables
- Financial Records tables
- Reports/Dashboard tables
- Vendor tables
- Sampling tables
- Agreement/signature tables
- ROM/cap/finance tables

Those remain future work unless a later issue explicitly authorizes them.

## Candidate Relationship Map

Future relationships may eventually include:

- One `client_accounts` record has many `account_memberships`.
- One `user_profiles` record has many `account_memberships`.
- One `client_accounts` record has many `facilities`.
- One `client_accounts` record has many `incident_requests`.
- One `facilities` record may have many `incident_requests`.
- One `client_accounts` record has many `documents`.
- One `facilities` record may have many `documents`.
- One `incident_requests` record may have many `documents`.
- One `audit_events` record links to an account and may link to a facility, incident request, document, user, or future project object.

These are draft relationships only.

## Candidate Field Groups

### `client_accounts`

Candidate field groups:

- Stable ID
- Display name
- Account status
- Demo/test flag
- Created/updated timestamps

Do not include real client details yet.

### `user_profiles`

Candidate field groups:

- Stable ID
- Future auth identity reference
- Display name
- User status
- Created/updated timestamps

Do not configure auth.

### `account_memberships`

Candidate field groups:

- Account reference
- User/profile reference
- Role label or role reference
- Membership status
- Created/updated timestamps

Blocked by role authority and account membership decisions.

### `facilities`

Candidate field groups:

- Account reference
- Facility display name
- Facility status
- Demo/test flag
- Created/updated timestamps

Do not include real addresses, sensitive facility details, patient data, or PHI.

### `incident_requests`

Candidate field groups:

- Account reference
- Facility reference if applicable
- Request title
- Issue/incident category placeholder
- Request status
- Submitted-by reference
- Created/updated timestamps

Do not implement real intake workflow.

### `documents`

Candidate field groups:

- Account reference
- Facility reference if applicable
- Incident/request reference if applicable
- Document title
- Document class
- Version
- Status/release state
- Internal/default-hidden flag
- Created/updated timestamps

Do not create storage buckets.

Do not create real document release logic.

### `audit_events`

Candidate field groups:

- Actor/user reference
- Account reference
- Object type
- Object reference
- Event type
- Event timestamp
- Metadata placeholder

Do not finalize audit visibility.

## Future RLS Requirements

Any future client-data table must have RLS planned and tested before exposure.

Future tests must include:

- Correct-account allowed.
- Wrong-account denied.
- Removed/suspended user denied.
- Assigned-facility allowed where applicable.
- Unassigned-facility denied where applicable.
- Draft/internal document hidden.
- Released document visible only when authorized.
- Audit visibility follows approved policy.

No RLS policy is authorized by this packet.

## Future Seed Data Requirements

Future fake seed data may include:

- Demo Property Group
- Demo User — Auxilium Admin
- Demo User — Client Viewer
- North Wing Facility
- Water Intrusion Demo
- Document Placeholder 001
- Request Submitted audit event
- Document Released audit event placeholder

Seed data must be fake/demo only.

No real client names, real addresses, real contacts, real documents, PHI, production data, passwords, API keys, or secrets.

## Founder / Security Blockers

The following remain blockers before schema implementation:

- Account membership model
- Final role authority
- Document grant model
- Document release authority
- Audit event visibility
- Auth provider strategy
- Storage bucket design
- No-PHI posture
- RLS helper design
- Supabase schema design approval
- Real client data policy

## Next Required Step

Create a schema implementation readiness gate before any migrations are created.

Recommended next issue:

Schema implementation readiness gate for foundation slice

That issue should determine whether the project is ready for a future migration issue or whether founder/security decisions must be resolved first.

## Conclusion

This packet is a data design artifact only.

No database implementation is authorized.
