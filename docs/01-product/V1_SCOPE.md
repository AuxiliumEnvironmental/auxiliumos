# V1 Scope

## Purpose

This file defines the first real AuxiliumOS build slice.

The first build slice is intentionally limited. It proves the operating model before building the full enterprise suite, full project intake engine, full ROM engine, full service ontology, full document vault, or full MSA platform.

## Decision Status

Status:
Draft / Founder review required / Not implementation-approved

This document defines the first build target, but it does not approve production use, real client data, PHI, or final security implementation.

---

# First Build Slice

The first AuxiliumOS build slice is:

Account
→ User Role
→ Facility
→ Incident Request
→ Admin Queue
→ Document Upload
→ Document Release
→ Client View
→ Audit Event

---

# What This Slice Proves

This slice proves:

- An account can exist.
- A user can belong to an account.
- A user can have a role.
- A facility can belong to an account.
- A site/client user can submit an incident/request.
- An admin can review the submitted request.
- A document can be uploaded.
- An uploaded document is not client-visible by default.
- A document can be released only through a controlled workflow.
- A client can see only released documents they are permitted to see.
- Every meaningful action creates an audit event.

---

# Included in V1

## Account

V1 includes:

- Account record
- Account name
- Account type placeholder
- Account status
- Account ownership for facilities, users, requests, documents, and audit events

V1 does not include:

- Full CRM
- Full billing profile
- Full MSA configuration
- Full enterprise account customization

---

## User Role

V1 includes:

- Internal user
- Client user
- User profile
- Account membership
- Basic role assignment
- Simple role-based visibility

V1 does not include:

- Final full permission system
- Production SSO
- External enterprise identity management
- Full SCIM/SSO automation
- Production user onboarding

---

## Facility

V1 includes:

- Facility record
- Account ownership
- Facility name
- Facility address placeholder
- Facility status placeholder
- Site Champion assignment placeholder

V1 does not include:

- Full site passport
- Full critical asset registry
- Full response map
- Full readiness reserve
- Full compliance-support calendar
- Full vendor matrix

---

## Incident Request

V1 includes:

- Client/site user incident submission
- Incident/request type
- Urgency
- Affected area free text
- Short description
- Upload placeholder
- No-PHI warning
- Submitted status
- Admin review status

V1 does not include:

- Full service ontology
- Full issue × intent engine
- Smart prompt engine
- Full sampling logic
- Full ROM engine
- Full agreement workflow

---

## Admin Queue

V1 includes:

- Admin view of submitted requests
- Request status
- Basic review action
- Missing information placeholder
- Assigned internal owner placeholder

V1 does not include:

- Full technical review workflow
- Full safety review workflow
- Full ROM preparation
- Full agreement generation
- Full scheduling release

---

## Document Upload

V1 includes:

- Document record
- Document class
- Document status
- Linked account/facility/request
- Uploaded but not released by default

V1 does not include:

- Full document package generation
- Advanced retention
- Legal hold
- Full redaction workflow
- Production storage hardening

---

## Document Release

V1 includes:

- Release status
- Internal release action
- Client-visible released state
- Basic audit event

V1 does not include:

- Final report workflow
- Full Technical Reviewer approval logic
- Full e-signature logic
- Full document packages
- Full supersession logic

---

## Client View

V1 includes:

- Client user sees assigned account/facility
- Client user sees own/assigned request
- Client user sees released permitted documents
- Client user does not see draft/internal documents

V1 does not include:

- Full enterprise dashboard
- QBR dashboard
- Full asset history
- Full invoice portal
- Full vendor portal

---

## Audit Event

V1 includes audit events for:

- User login/access placeholder where possible
- Request submitted
- Document uploaded
- Document released
- Document viewed/downloaded where possible
- Admin status change

V1 does not include:

- Full audit dashboard
- Full event export
- Full SIEM/security logging
- Production audit compliance package

---

# V1 User Types

V1 should support fake/demo versions of:

- Auxilium Admin
- Document Controller
- Client Executive
- Site Champion
- Project Requester
- Document Viewer

V1 should not use real client users.

---

# V1 Data Rules

V1 uses fake/demo data only.

V1 must not use:

- Real client data
- PHI
- API keys in code
- Service-role keys in browser code
- Production credentials
- Production Supabase project
- Real client documents

---

# V1 Security Requirements

V1 must demonstrate:

- Account isolation concept
- Facility assignment concept
- Document release concept
- Client-visible versus internal-only document status
- Audit-event concept
- No-PHI warning concept

V1 does not need full production-ready security, but it must not create unsafe public patterns.

---

# V1 Success Criteria

V1 is successful when:

- A fake account exists.
- A fake user belongs to that account.
- A fake facility belongs to that account.
- A fake site/client user can submit an incident/request.
- The request appears in an admin queue.
- A fake document can be uploaded.
- The document is not client-visible by default.
- An internal user can release the document.
- The client user can see the released document.
- A different client user cannot see the document.
- Audit events are created for meaningful actions.

---

# V1 Stop Conditions

Stop and ask before adding:

- Production data
- Real client data
- PHI
- Payment processing
- E-signature
- Full service ontology
- Full ROM engine
- Full sampling engine
- Broad public Supabase policies
- Storage buckets without policy
- Auth providers without role plan
- Any client-visible draft/internal document
- Any message/chat scope-change behavior

---

# Excluded From V1

V1 excludes:

- Full Nutex-style enterprise MSA rollout
- Full PA/project portal
- Full service request/scoping engine
- Full sampling/testing engine
- Full T&M ROM engine
- Full agreement automation
- Full project scheduling
- Full vendor governance
- Full QBR reporting
- Full readiness reserve
- Full site passport
- Full production deployment
- Real client data
- PHI

---

# Next Build Gate

Before V1 build starts, the following must be released:

- ROLE_PERMISSION_MATRIX.md v1
- DOCUMENT_ACCESS_MATRIX.md v1
- V1_SCOPE.md
- UAT_SCENARIOS.md
- RLS_TEST_PLAN.md
- DOCUMENT_RELEASE_WORKFLOW.md
- REQUEST_STATE_MACHINE.md
- No-PHI policy

After those are released, create a Spec Gate Review issue before actual app/schema build begins.