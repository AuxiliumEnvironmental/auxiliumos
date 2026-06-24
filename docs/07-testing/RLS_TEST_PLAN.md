# RLS Test Plan

## Purpose

This file defines the first row-level-security and access-control test scenarios for AuxiliumOS.

These tests are not implemented yet. They define what future Supabase, database, and browser tests must prove before real client data is used.

## Decision Status

Status:
Draft / Founder/security review required / Not implementation-approved

---

# Test Data Rule

All tests must use fake/demo data only.

Do not use:

- Real client data
- PHI
- Real documents
- Real invoices
- Real passwords
- Real API keys
- Real Supabase service-role keys

---

# Planned Test Users

Future fake test users:

- aux_system_admin
- aux_account_manager
- aux_intake_admin
- aux_pm
- aux_technical_reviewer
- aux_document_controller
- aux_finance_admin
- client_exec_account_a
- client_exec_account_b
- site_champion_facility_a
- site_champion_facility_b
- pa_user_firm_a
- pa_user_firm_b
- billing_contact_account_a
- vendor_user_assigned
- vendor_user_unassigned
- removed_user

---

# Planned Test Objects

Future fake test objects:

- Account A
- Account B
- Facility A1
- Facility A2
- Facility B1
- Project Request A
- Project Request B
- Project A
- Project B
- Draft Document A
- Released Document A
- Restricted Document A
- Invoice A
- Vendor Assignment A
- Audit Event A

---

# RLS-001 — Account isolation

User:
PA user from Firm A

Attempt:
View Firm B project/request/document.

Expected:
Access denied.

---

# RLS-002 — Facility isolation

User:
Site Champion assigned to Facility A1

Attempt:
View Facility A2 or Facility B1 without permission.

Expected:
Access denied unless explicitly granted.

---

# RLS-003 — Vendor isolation

User:
Vendor assigned to one work item

Attempt:
View unrelated projects, documents, invoices, executive dashboards, or internal notes.

Expected:
Access denied.

---

# RLS-004 — Draft document hidden

User:
Client user with project access

Attempt:
View draft report or internal note.

Expected:
Access denied / not visible.

---

# RLS-005 — Released document visible

User:
Authorized client user

Attempt:
View released document linked to assigned project/facility.

Expected:
Access allowed.

---

# RLS-006 — Removed user denied

User:
Removed/disabled user

Attempt:
View account, facility, project, document, invoice, or message.

Expected:
Access denied.

---

# RLS-007 — Billing separation

User:
Billing Contact

Attempt:
View invoice and technical report.

Expected:
Invoice access allowed if assigned. Technical report denied unless separately granted.

---

# RLS-008 — Document URL guessing fails

User:
Unauthorized user

Attempt:
Access document by guessed URL/path/id.

Expected:
Access denied.

---

# RLS-009 — Chat cannot mutate scope

User:
Client user

Attempt:
Send message requesting scope change.

Expected:
Message may create task/question/change request draft only. Approved scope record remains unchanged.

---

# RLS-010 — Admin actions audited

User:
Document Controller or Admin

Action:
Release document.

Expected:
Audit event created.

---

# RLS-011 — Client Executive visibility boundary

User:
Client Executive

Attempt:
View account/facility/project documents.

Expected:
Can view only records permitted by role/account/program rules. Internal notes and unreleased documents remain hidden.

---

# RLS-012 — Site Champion invoice denial

User:
Site Champion

Attempt:
View invoice.

Expected:
Denied by default unless assigned billing permission.

---

# RLS-013 — Restricted document denial

User:
Authorized project user

Attempt:
View restricted document.

Expected:
Denied unless special grant exists.

---

# Future Test Methods

Possible future test methods:

- Supabase local development
- pgTAP/database tests
- Seeded fake users
- Seeded fake records
- Playwright browser tests
- API tests
- Manual UAT before automation

---

# Test Gate Rule

Before real client data is used, the project must prove:

- Account isolation works.
- Facility isolation works.
- Document release filtering works.
- Draft/internal documents are hidden.
- Unauthorized users are denied.
- Removed users lose access.
- Chat cannot mutate scope.
- Audit events are created for meaningful actions.