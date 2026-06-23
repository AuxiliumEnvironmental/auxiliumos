# Security Guardrails

## Purpose

This file records security rules for AuxiliumOS setup and future development.

AuxiliumOS will eventually contain sensitive client, facility, project, document, authorization, and financial information. Security must be designed before real client data is used.

---

# Current Security Posture

## Current phase

Prep / AI Software Factory Setup

## Current data posture

No real client data should be used.

No PHI should be used.

No production data should be used.

Only fake/demo data may be used during early setup and development.

---

# Secrets Rule

Do not place secrets in:

- GitHub files
- ChatGPT chats
- Lovable chats
- Cursor prompts
- Claude Code prompts
- Codex prompts
- Screenshots
- Markdown docs
- Issue bodies
- Pull request bodies
- Project board cards

Secrets include:

- API keys
- Supabase secret keys
- Supabase service-role keys
- Database passwords
- JWT secrets
- OAuth secrets
- `.env` files
- Private tokens
- Passwords
- Client credentials
- Connection strings

---

# Supabase Key Rule

Supabase publishable or anon-style keys may be used in frontend applications only when paired with correct RLS and least-privilege policies.

Supabase secret keys and service-role keys must never be exposed in frontend code, browser code, AI chats, screenshots, or repository files.

Secret/service-role keys are backend-only because they can bypass RLS.

---

# RLS Rule

No client-data table may be used for production unless Row Level Security is enabled, documented, and tested.

RLS planning must exist before application tables containing account, asset, project, document, user access, message, agreement, financial, or audit data are used.

If Supabase offers automatic RLS for future tables, the secure default is to enable it.

Do not create broad public read/write policies.

RLS enabled without policies is acceptable during setup because it blocks API data access until policies are intentionally created.

---

# No-PHI Default Rule

AuxiliumOS v1 should be designed for facility, environmental, project, document, and operational data.

The following are prohibited unless a separate legal/security workflow approves otherwise:

- Patient names
- Medical records
- Patient photos
- Treatment details
- Diagnoses
- Patient identifiers
- Any other PHI

Healthcare clients should be handled as facility-data clients unless a formal PHI-capable design is created.

---

# Document Security Rule

No document becomes client-visible by default.

Client-visible documents require:

- Document class
- Version
- Release approval
- Permission check
- Audit event

Draft reports and internal notes must not be visible to clients by default.

---

# AI Security Rule

AI tools may not receive:

- Secrets
- API keys
- Service-role keys
- Database passwords
- Real client data
- PHI
- Unredacted sensitive client documents

AI may propose, draft, summarize, build, or review.

AI may not silently decide security authority, RLS exceptions, professional boundaries, document release, production deployment, or client data policy.

---

# Production Rule

Production is not created yet.

Production may not be used until:

- Access model exists
- RLS is tested
- Document release workflow is tested
- Role matrix is approved
- No-PHI policy is approved
- Backup/restore plan exists
- Deployment workflow exists
- Human approval is recorded