# Table Ownership

Every table must have an owner and purpose.

---


---

# Foundation Slice Candidate Ownership

Added: 2026-07-06  
Source issue: #[SCHEMA_DESIGN_ISSUE_NUMBER] — Supabase schema design packet for foundation slice

All concepts below are draft / not implementation-approved.

| Candidate concept | Owner module | Supporting module(s) | Notes |
|---|---|---|---|
| `client_accounts` | Accounts | Core / Security | Candidate account record. |
| `user_profiles` | Core / Security | Accounts | Candidate app profile concept; auth provider not configured. |
| `account_memberships` | Core / Accounts / Security | Reports later | Blocked by role authority and membership model. |
| `facilities` | Assets | Accounts / Security | Candidate facility/property record. |
| `incident_requests` | Requests / Intake | Accounts / Assets / Security | Candidate request/incident record. |
| `documents` | Documents | Accounts / Assets / Requests / Security | Blocked by document grant and release authority decisions. |
| `audit_events` | Core / Security | All modules | Future immutable event record; audit visibility unresolved. |