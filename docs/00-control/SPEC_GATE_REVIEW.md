# Spec Gate Review Before First Build

Last updated: 2026-06-24

## Purpose

This file records the specification gate review before AuxiliumOS begins the first controlled build phase.

The goal is to confirm that the core planning, security, access, document-control, workflow, testing, and no-PHI guardrails exist before any real app/backend build begins.

This gate does not approve production use.

This gate does not approve real client data.

This gate does not approve PHI-capable workflows.

This gate does not approve full backend/schema implementation.

---

# Gate Status

Status:
Passed for visual-only first build preparation

Important limitation:
This gate allows the next controlled step: visual-only Lovable UI shell work and first-build planning.

This gate does not authorize Supabase schema creation, storage buckets, auth providers, production deployment, real client data, PHI, or unrestricted AI agent coding.

---

# Source-of-Truth Rule

GitHub remains the source of truth.

ChatGPT, Cursor, Lovable, Claude Code, Codex, GitHub Copilot, and future AI tools are workers.

If a decision, workflow, assumption, rule, or project status is not captured in the repository, it does not count.

---

# Canonical Data Spine

Client Account
→ Program/MSA
→ Portfolio
→ Asset/Facility
→ Zone/Area
→ Incident
→ Project Request
→ Scope Record
→ Authorization
→ Project
→ Tasks/Work Orders
→ Deliverables
→ Documents
→ Communications
→ Financial Records
→ Reports/Dashboards
→ Audit Events.

All future build work must attach to this spine or be treated as global configuration, reference data, integration data, or out-of-scope.

---

# Completed Specification Documents

The following specification/control documents have been completed and merged into main:

- [x] docs/04-security/ROLE_PERMISSION_MATRIX.md
- [x] docs/04-security/DOCUMENT_ACCESS_MATRIX.md
- [x] docs/01-product/V1_SCOPE.md
- [x] docs/07-testing/UAT_SCENARIOS.md
- [x] docs/04-security/RLS_POLICY_MATRIX.md
- [x] docs/07-testing/RLS_TEST_PLAN.md
- [x] docs/05-workflows/DOCUMENT_RELEASE_WORKFLOW.md
- [x] docs/05-workflows/REQUEST_STATE_MACHINE.md
- [x] docs/05-workflows/EMERGENCY_EXCEPTION_WORKFLOW.md
- [x] docs/05-workflows/CHANGE_AUTHORIZATION_WORKFLOW.md
- [x] docs/07-testing/PLAYWRIGHT_TEST_PLAN.md
- [x] docs/04-security/SECURITY_GUARDRAILS.md
- [x] docs/01-product/OUT_OF_SCOPE.md

---

# Completed Tool / Setup Items

The following setup items are complete or sufficiently prepared for the next phase:

- [x] Local AuxiliumOS folder system
- [x] Private GitHub repository
- [x] Starter repo skeleton
- [x] GitHub Desktop workflow
- [x] GitHub Project board
- [x] Labels
- [x] Node.js installed
- [x] Cursor installed
- [x] Lovable paid account available
- [x] Lovable Workspace Knowledge and Project Knowledge configured
- [x] Supabase dev project exists or is documented as dev-only setup
- [x] No real client data used
- [x] No PHI used
- [x] No secrets committed

If any item above is not actually complete, change its checkbox to unchecked before merging this review.

---

# First Build Slice Confirmed

The first approved build target remains:

Account
→ User Role
→ Facility
→ Incident Request
→ Admin Queue
→ Document Upload
→ Document Release
→ Client View
→ Audit Event.

This slice proves:

- Account ownership
- User membership
- Role assignment
- Facility ownership
- Incident/request submission
- Admin review
- Document upload
- Document hidden by default
- Document release workflow
- Client-visible released document access
- Audit events

---

# What This Gate Allows Next

This gate allows the following next controlled work:

1. Create Lovable visual UI shell v1.
2. Use fake/demo data only.
3. Build visual layouts and navigation placeholders only.
4. Build simple client/admin/facility portal concepts.
5. Do not connect production systems.
6. Do not create real backend authority.
7. Do not use real client data.
8. Do not use PHI.

---

# What This Gate Does Not Allow Yet

Do not start yet:

- Supabase schema implementation
- Supabase storage buckets
- Supabase auth providers
- Supabase RLS policy creation
- Production Supabase project
- Real Lovable backend build
- Real document storage
- Real document release behavior
- Real client user onboarding
- Real client data
- PHI-capable workflows
- Payment processing
- E-signature integration
- Full ROM engine
- Full sampling engine
- Full MSA engine
- Claude Code implementation edits
- Codex implementation edits
- Playwright installation
- GitHub Actions real CI
- Production deployment

Those require later issues, branches, pull requests, review, and approvals.

---

# Founder-Decision Items Still Open

The following remain draft / founder-review-required before implementation:

- Final document release authority
- Final scope approval authority
- Final cap/change authorization authority
- Final client role access levels
- Final no-PHI operational authority
- Emergency conditional authorization authority
- Change authorization thresholds
- Client Executive visibility boundaries
- Site Champion document visibility boundaries
- Billing Contact access boundaries
- Vendor User inclusion in v1
- RLS helper design
- Auth provider strategy
- Supabase schema design
- Storage bucket design
- Whether any PHI-capable workflow will ever be supported

These may be drafted in documents, but they are not implementation-approved until founder/legal/security review is complete.

---

# Next Approved Issue

Next issue after this gate:

Create Lovable visual UI shell v1

Purpose:
Create a visual-only AuxiliumOS interface shell using Lovable.

Allowed:
- UI shell
- Navigation placeholders
- Status cards
- Empty states
- Simple fake/demo data
- No backend
- No schema
- No Supabase connection
- No auth
- No RLS
- No storage
- No real client data
- No PHI

---

# Required Prompt Rule for Lovable Next

When starting the Lovable visual shell issue, use a controlled prompt from:

docs/08-ai/PROMPT_LIBRARY.md

Lovable must not be asked to build the whole app.

Lovable must not create schema, auth, storage, RLS, production data, or real workflows.

---

# Final Gate Result

Spec Gate Result:
Passed for visual-only first build preparation.

Not approved for:
- Production
- Real client data
- PHI
- Supabase schema
- Storage buckets
- Auth providers
- RLS policy creation
- Real backend workflows
- Full app build
