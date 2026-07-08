# Field Dictionary

Define important fields and meanings here.

---

# Foundation Slice Candidate Field Dictionary

Added: 2026-07-06  
Source issue: #[SCHEMA_DESIGN_ISSUE_NUMBER] — Supabase schema design packet for foundation slice

All fields below are draft / not implementation-approved.

## Common Field Concepts

| Field concept | Meaning | Notes |
|---|---|---|
| `id` | Stable record identifier | Final ID strategy not implemented. |
| `created_at` | Record creation timestamp | Future database default likely needed. |
| `updated_at` | Record update timestamp | Future update strategy needed. |
| `status` | Controlled lifecycle status | Final allowed values must come from workflow docs. |
| `is_demo` | Marks fake/demo records | Real client data remains disallowed. |

## Foundation Field Concepts

| Field concept | Candidate location | Meaning | Blocker |
|---|---|---|---|
| `account_id` | Most client-data concepts | Links record to Client Account | Account membership/RLS design |
| `user_profile_id` | Memberships/audit/request concepts | Links to future user/profile | Auth provider strategy |
| `facility_id` | Facility-linked concepts | Links to Asset/Facility | Facility access model |
| `incident_request_id` | Document/audit concepts | Links to Incident / Project Request | Request workflow design |
| `document_class` | Documents | Classifies document type | Document access matrix approval |
| `release_state` | Documents | Indicates internal/draft/released state | Document release workflow approval |
| `event_type` | Audit events | Describes important action | Audit event taxonomy |
| `object_type` | Audit events | Identifies linked object type | Final object registry |
| `object_id` | Audit events | Identifies linked record | Final relationship design |