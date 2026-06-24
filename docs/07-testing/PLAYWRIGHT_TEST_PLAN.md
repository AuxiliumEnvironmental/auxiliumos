# Playwright Test Plan

## Purpose

This file defines the future Playwright browser-test plan for AuxiliumOS.

Playwright is not installed yet.

This document does not create automated tests. It defines what future automated tests must prove after the first app build exists.

## Decision Status

Status:
Draft / Founder review required / Not implementation-approved

---

# Permanent Testing Rules

- No real client data in tests.
- No PHI in tests.
- No secrets in tests.
- Use fake/demo users only.
- Browser tests must verify both allowed access and denied access.
- Document release must be tested before real client data.
- Role boundaries must be tested before real client users.
- Chat/messages must be tested to ensure they cannot directly change scope.
- Tests should be tied to the first build slice before expanding.

---

# First Build Slice Under Test

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

# Test User Personas

Future Playwright tests should use fake users such as:

- aux_admin
- aux_intake_admin
- aux_document_controller
- client_executive_account_a
- site_champion_facility_a
- site_champion_facility_b
- project_requester_account_a
- document_viewer_account_a
- billing_contact_account_a
- vendor_user_assigned
- removed_user

---

# Test Data

Future tests should use fake data such as:

- Account A
- Account B
- Facility A1
- Facility A2
- Facility B1
- Incident Request A
- Draft Document A
- Released Document A
- Restricted Document A
- Invoice A
- Vendor Assignment A
- Audit Event A

---

# Playwright Scenario 001 — Client user login and dashboard

## Actor

Client user

## Goal

Verify a client user can log in and see only permitted dashboard content.

## Expected

- User sees assigned account/facility context.
- User does not see unrelated account data.
- User does not see internal admin navigation.

---

# Playwright Scenario 002 — Site Champion submits incident/request

## Actor

Site Champion

## Goal

Verify assigned site user can submit a request/incident.

## Expected

- Request form loads.
- No-PHI warning appears where relevant.
- Required fields are enforced.
- Submission succeeds with fake data.
- Admin queue receives request.
- Audit event exists or is queued for future verification.

---

# Playwright Scenario 003 — Admin reviews request

## Actor

Auxilium Intake Admin

## Goal

Verify admin can see submitted request and update review status.

## Expected

- Admin queue displays request.
- Admin can open request.
- Admin can change status.
- Client cannot perform admin-only action.

---

# Playwright Scenario 004 — Uploaded document hidden by default

## Actor

Client user and internal user

## Goal

Verify uploaded/internal document is not client-visible until released.

## Expected

- Internal user can see uploaded document.
- Client user cannot see unreleased document.
- Draft/internal documents are hidden.

---

# Playwright Scenario 005 — Released document visible to authorized user

## Actor

Document Viewer or authorized client user

## Goal

Verify released document appears only for permitted user.

## Expected

- Authorized user sees released document.
- Unauthorized user does not see released document.
- Document download/view action is tracked where available.

---

# Playwright Scenario 006 — Wrong account denied

## Actor

Client user from unrelated account

## Goal

Verify account isolation.

## Expected

- User cannot see Account A data while belonging only to Account B.
- Navigation does not reveal unrelated data.
- Direct URL attempt fails after RLS/API protection exists.

---

# Playwright Scenario 007 — Site Champion facility isolation

## Actor

Site Champion assigned to Facility A1

## Goal

Verify facility-level isolation.

## Expected

- User sees Facility A1.
- User does not see Facility A2 or Facility B1 unless granted.

---

# Playwright Scenario 008 — Billing Contact separation

## Actor

Billing Contact

## Goal

Verify billing user does not automatically see technical documents.

## Expected

- Billing Contact can see permitted billing area.
- Billing Contact cannot see unreleased technical reports by default.
- Billing Contact cannot release documents.

---

# Playwright Scenario 009 — Vendor access limitation

## Actor

Vendor User

## Goal

Verify vendor sees assigned work only.

## Expected

- Vendor sees assigned work/document upload area only.
- Vendor cannot see unrelated projects, invoices, internal notes, QBRs, or executive dashboards.

---

# Playwright Scenario 010 — Removed user denied

## Actor

Removed/disabled user

## Goal

Verify removed user loses access.

## Expected

- Login denied or app access denied.
- User cannot view account/project/document data.

---

# Playwright Scenario 011 — Chat/message cannot change scope

## Actor

Client user

## Goal

Verify message flow does not directly mutate scope.

## Expected

- Message can be submitted.
- Message can create task/question/change request draft if implemented.
- Approved scope record remains unchanged.
- No cap/deliverable/sampling change occurs directly from message.

---

# Playwright Scenario 012 — Document release role boundary

## Actor

Project Manager and Document Controller

## Goal

Verify only authorized release role can release document.

## Expected

- PM may request release if allowed.
- Document Controller performs release if policy requires.
- Unauthorized user cannot release document.

---

# Playwright Scenario 013 — Draft report hidden

## Actor

Client Document Viewer

## Goal

Verify draft reports are not visible.

## Expected

- Draft report hidden from client.
- Final released report visible only after release.

---

# Playwright Scenario 014 — No-PHI warning appears

## Actor

Site Champion / client uploader

## Goal

Verify relevant upload/request forms warn users not to upload PHI.

## Expected

- No-PHI warning appears before upload/submission.
- Warning is visible and plain-language.

---

# Automation Timing

Do not install Playwright until:

- App exists.
- package.json exists.
- First UI flows exist.
- Fake auth/test-user approach exists.
- Dev environment is stable.
- RLS or mock access rules exist for meaningful denial tests.

---

# Future Playwright Install Notes

When ready, create a separate issue:

Install Playwright and add first UAT tests.

Do not install Playwright inside this documentation issue.

---

# Test Gate Rule

Before real client data is used, browser tests must prove:

- Account isolation.
- Facility isolation.
- Released-document visibility.
- Draft/internal-document hiding.
- Removed-user denial.
- Unauthorized-user denial.
- Message cannot change scope.
- No-PHI warning appears in relevant upload/intake flows.