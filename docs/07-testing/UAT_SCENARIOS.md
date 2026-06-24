# UAT Scenarios

## Purpose

This file defines user-acceptance-test scenarios for the first AuxiliumOS build slice.

These are not automated Playwright tests yet.

They are human-readable scenarios that describe what the first build must prove before more complex features are added.

## Decision Status

Status:
Draft / Founder review required / Not implementation-approved

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

# Scenario 1 — Site Champion submits incident/request

## Actor

Site Champion

## Preconditions

- Fake account exists.
- Fake facility exists.
- Site Champion user belongs to that account.
- Site Champion is assigned to that facility.
- No real client data is used.

## Steps

1. Site Champion logs in.
2. Site Champion views assigned facility.
3. Site Champion clicks submit incident/request.
4. Site Champion enters event/request type.
5. Site Champion enters urgency.
6. Site Champion enters affected area.
7. Site Champion enters short description.
8. Site Champion sees no-PHI warning.
9. Site Champion uploads fake file/photo if upload exists.
10. Site Champion submits request.

## Expected Result

- Request is created.
- Request is linked to account.
- Request is linked to facility.
- Request appears in admin queue.
- Uploaded file is not client-visible as a released document.
- Audit event records request submission.

---

# Scenario 2 — Admin reviews submitted request

## Actor

Auxilium Intake Admin

## Preconditions

- Scenario 1 request exists.
- Intake Admin user exists.

## Steps

1. Intake Admin logs in.
2. Intake Admin opens admin queue.
3. Intake Admin views submitted request.
4. Intake Admin changes request status to review or needs information.
5. Intake Admin saves update.

## Expected Result

- Request status changes.
- Client-side user does not gain new document access.
- Audit event records admin status change.

---

# Scenario 3 — Document uploaded but hidden from client

## Actor

Auxilium internal user

## Preconditions

- Fake request/project exists.
- Fake document upload is available.

## Steps

1. Internal user uploads fake document.
2. Internal user assigns document class.
3. Document remains unreleased.
4. Client user logs in.
5. Client user checks document list.

## Expected Result

- Document exists internally.
- Document is not client-visible.
- Client does not see draft/internal/unreleased document.
- Audit event records upload.

---

# Scenario 4 — Document release

## Actor

Document Controller

## Preconditions

- Fake document exists.
- Document is not client-visible.

## Steps

1. Document Controller opens document record.
2. Document Controller confirms document class and linked object.
3. Document Controller changes status to released.
4. Client user logs in.
5. Client user views document list.

## Expected Result

- Released document appears to permitted client user.
- Released document does not appear to unrelated users.
- Audit event records release.

---

# Scenario 5 — Wrong account access denied

## Actor

Unrelated client user

## Preconditions

- Account A exists.
- Account B exists.
- User belongs to Account B only.
- Document belongs to Account A.

## Steps

1. Account B user logs in.
2. Account B user attempts to access Account A facility/project/document.

## Expected Result

- Access is denied.
- Account A data is not visible.
- Document cannot be accessed through UI.
- Future direct URL/API access must also be denied when RLS exists.

---

# Scenario 6 — Draft/internal document hidden

## Actor

Client Document Viewer

## Preconditions

- Draft report exists.
- Internal note exists.
- Neither document is released.

## Steps

1. Client user logs in.
2. Client user opens project/facility document area.

## Expected Result

- Draft report is hidden.
- Internal note is hidden.
- Only released permitted documents appear.

---

# Scenario 7 — Chat/message cannot change scope

## Actor

Client user

## Preconditions

- Request/project exists.
- Scope behavior may be placeholder in V1.

## Steps

1. Client user sends message asking to add work, expand area, or change scope.
2. Admin views message.

## Expected Result

- Message does not alter approved scope.
- Message may create a task, clarification, or change request draft only.
- Scope remains unchanged unless future change authorization workflow is used.

---

# Scenario 8 — Removed user loses access

## Actor

Removed client user

## Preconditions

- User previously belonged to account.
- User is removed or disabled.

## Steps

1. Removed user attempts to log in or view account/project/document.

## Expected Result

- Access is denied.
- User cannot view documents or project data.
- Future audit/access event should record denial where applicable.

---

# Scenario 9 — Billing contact separation

## Actor

Billing Contact

## Preconditions

- Billing Contact user exists.
- Invoice placeholder exists.
- Technical report placeholder exists.

## Steps

1. Billing Contact logs in.
2. Billing Contact views billing area.
3. Billing Contact attempts to view technical report.

## Expected Result

- Billing Contact may see permitted billing records.
- Billing Contact does not see technical reports by default unless separately granted.

---

# Scenario 10 — Vendor access limitation

## Actor

Vendor User

## Preconditions

- Vendor User exists.
- Vendor is assigned to one fake work item only.

## Steps

1. Vendor logs in.
2. Vendor views assigned work.
3. Vendor attempts to access unrelated project/document.

## Expected Result

- Vendor sees assigned work only.
- Vendor cannot access unrelated projects, documents, invoices, executive dashboards, or internal notes.

---

# UAT Rule

If a future build cannot pass these scenarios with fake data, it is not ready for real client data.