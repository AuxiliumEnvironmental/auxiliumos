# Security Guardrails

## Purpose

This file records security rules for AuxiliumOS setup and future development.

AuxiliumOS will eventually contain sensitive client, facility, project, document, authorization, and financial information. Security must be designed before real client data is used.

## Decision Status

Status:
Draft / Founder/legal/security review required / Not implementation-approved

---

# Current Security Posture

## Current phase

Prep / AI Software Factory Setup transitioning into Specification Gate.

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

# No-PHI Policy

## Default v1 posture

AuxiliumOS v1 is designed for facility, environmental, project, document, and operational data.

AuxiliumOS v1 is not designed to store PHI.

## Prohibited unless separate legal/security approval exists

- Patient names
- Medical records
- Patient photos
- Treatment details
- Diagnoses
- Patient identifiers
- Insurance/member numbers
- Medical billing records
- Patient-specific medical narratives
- Any other PHI

## Healthcare client upload warning

Healthcare users should be instructed:

Do not upload patient names, medical records, patient photographs, treatment information, diagnoses, or patient identifiers. Upload facility, environmental, incident, project, access, safety, building, system, document, or operational information only.

## If PHI is discovered

If PHI is discovered or suspected:

1. Stop processing the content.
2. Do not send it to AI tools.
3. Restrict access.
4. Notify designated internal authority.
5. Determine deletion, quarantine, or legal/security workflow.
6. Record an audit event where appropriate.
7. Do not use the content for testing, demos, screenshots, or training.

## AI/PHI rule

AI tools may not receive PHI.

This includes ChatGPT, Cursor, Lovable, Claude Code, Codex, GitHub Copilot, OCR tools, summarization tools, or other AI systems.

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

---

# Open Decisions

The following require founder/legal/security review:

- Whether any future PHI-capable workflow will ever be supported.
- Whether a BAA-capable platform or contract is required for specific clients.
- Whether healthcare clients need additional upload warnings.
- How suspected PHI should be quarantined or deleted.
- Who is the designated internal authority for PHI/security incidents.
- Whether document scanning/redaction tools will be needed later.

---

# Implementation Notes for Later

- No-PHI warning should appear in healthcare/facility incident upload workflows.
- Upload forms should discourage patient-specific data.
- Demo/test data must remain fake.
- Real client data requires separate onboarding gate.
- Any PHI-capable workflow requires legal/security/contractual review before build.