# RLS Policy Matrix

## Purpose

This file defines the future row-level-security expectations for AuxiliumOS.

It is a planning document for future Supabase RLS policies. It does not implement RLS yet.

## Decision Status

Status:
Draft / Founder/security review required / Not implementation-approved

---

# Permanent Rules

- UI hiding is not security.
- Backend/database access rules must enforce account, asset, project, document, and financial boundaries.
- Every client-data table must have account ownership or a documented reason it does not.
- Facility/site access may be narrower than account access.
- Document access is more restrictive than project access.
- Financial access is separate from project/document access.
- Vendor access is assigned-work-only.
- Removed users must lose access.
- Draft/internal/unreleased documents must not be visible to clients.
- Service-role and secret keys are backend-only and never exposed.
- RLS enabled without permissive policies is acceptable during setup.
- Broad public read/write policies are not acceptable.

---

# Future Table Groups

| Table group | Requires account_id? | Requires asset_id? | Requires project/request id? | RLS required? | Notes |
|---|---:|---:|---:|---:|---|
| accounts | Yes/self | No | No | Yes | Account visibility controls tenant access. |
| user_profiles | Maybe | No | No | Yes | User profile visibility must be limited. |
| account_memberships | Yes | No | No | Yes | Defines account membership. |
| roles/permissions | Maybe | No | No | Yes/controlled | Global/config tables may have limited read rules. |
| assets/facilities | Yes | Yes/self | No | Yes | Facility assignment required. |
| zones/areas | Yes | Yes | Maybe | Yes | Zone access follows asset/project rules. |
| incidents | Yes | Usually | Maybe | Yes | Client users see assigned scope only. |
| project_requests | Yes | Maybe | Yes/self | Yes | Requester/admin visibility must be controlled. |
| projects | Yes | Maybe | Yes/self | Yes | Project access by account/project assignment. |
| scope_records | Yes | Maybe | Project/request | Yes | Scope visibility restricted. |
| documents | Yes | Maybe | Maybe | Yes | Release state and document grants required. |
| document_versions | Yes | Maybe | Maybe | Yes | Follows parent document access. |
| messages | Yes | Maybe | Maybe | Yes | Thread participants and object link matter. |
| financial_records | Yes | Maybe | Maybe | Yes | Billing roles only unless granted. |
| vendors | Maybe | Maybe | Maybe | Yes if client-specific | Vendor access is assigned-work-only. |
| audit_events | Yes when client-specific | Maybe | Maybe | Restricted | Internal visibility and compliance rules. |

---

# Access Helper Concepts

Future RLS should support helper logic equivalent to:

- can_access_account(user_id, account_id)
- can_access_asset(user_id, asset_id)
- can_access_project(user_id, project_id)
- can_access_request(user_id, project_request_id)
- can_access_document(user_id, document_id)
- can_view_financial_record(user_id, financial_record_id)
- can_perform_action(user_id, action, object_type, object_id)

These helper concepts are planning concepts only. They are not implemented yet.

---

# Core RLS Expectations

## Account isolation

Users should only access accounts they belong to or have been granted access to.

## Asset/facility isolation

Users should only access assets/facilities they are assigned to or have account/portfolio/program permission for.

## Project/request isolation

Users should only access projects/requests they are assigned to or have permission for.

## Document release filtering

Client users should only see documents that are:

- linked to an object they can access
- released or explicitly granted
- allowed for their role
- not restricted, withdrawn, or blocked

## Vendor isolation

Vendor users should see assigned work only.

## Removed user denial

Removed/disabled users should not access client records.

## Financial separation

Financial records should be visible only to authorized billing/finance roles.

## Audit protection

Audit events should be protected from casual client access and should not be editable casually.

---

# Open Decisions

The following items require founder/security review before implementation:

- Exact RLS helper function design.
- Exact account membership table design.
- Whether document grants are separate from project grants.
- Whether billing visibility is project-based or account-based.
- Whether Site Champion can view all released documents for a facility.
- Whether Client Executive can view all account-level released documents.
- Whether Vendor User is included in V1 RLS or deferred.
- Whether audit events are visible to any client users.
- Whether config tables are readable by authenticated users or served through API views only.

---

# Implementation Notes for Later

- This matrix is not an implemented security system.
- Future migration files must create RLS policies.
- Future tests must verify access denial.
- Supabase dashboard-only changes should not become production schema.
- No client-data tables should be used without RLS policies and tests.
- No real client data should be used until access-denial tests pass.