# Relationship Map

Document parent/child relationships and foreign keys here.

---

# Foundation Slice Candidate Relationships

Added: 2026-07-06  
Source issue: #66 — Supabase schema design packet for foundation slice

All relationships below are draft / not implementation-approved.

| Parent concept | Child concept | Relationship intent |
|---|---|---|
| `client_accounts` | `account_memberships` | An account may have many user memberships. |
| `user_profiles` | `account_memberships` | A user/profile may belong to many accounts. |
| `client_accounts` | `facilities` | An account may have many facilities/assets. |
| `client_accounts` | `incident_requests` | An account may have many incident/request records. |
| `facilities` | `incident_requests` | A facility may have many incident/request records. |
| `client_accounts` | `documents` | An account may have many documents. |
| `facilities` | `documents` | A facility may have many documents. |
| `incident_requests` | `documents` | An incident/request may have many linked documents. |
| `client_accounts` | `audit_events` | An account may have many audit events. |
| future actor/user concept | `audit_events` | An actor may create many audit events. |

Admin Queue is expected to be a future derived surface over request/review status unless separately approved.

Document Release Queue is expected to be a future derived surface over document status/release state unless separately approved.