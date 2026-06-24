# Out of Scope

## Purpose

This file lists items that AuxiliumOS v1 should not support unless a future approved issue, founder decision, legal review, security review, and implementation plan specifically allow them.

---

# PHI / Patient Medical Data

AuxiliumOS v1 does not intentionally support PHI storage or processing.

Out of scope unless separately approved:

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

Healthcare workflows should use facility, environmental, incident, project, access, safety, building, system, document, and operational data only.

---

# Medical Opinions

AuxiliumOS and Auxilium Environmental workflows do not provide:

- Medical diagnosis
- Treatment advice
- Patient-specific medical conclusions
- Health outcome conclusions
- Medical causation opinions

Occupant or worker symptom information may require careful limitation language and should not become medical opinion.

---

# Legal / Claim / Coverage Opinions

AuxiliumOS v1 should not create legal, claim-settlement, policy-coverage, or public-adjusting opinions.

Auxilium may document technical/project information, but coverage/legal conclusions require appropriate professional authority.

---

# Engineering

AuxiliumOS v1 should not imply Auxilium is providing engineering services unless performed under a properly authorized engineering scope by qualified/registered professionals.

Engineering design, certification, stamped opinions, and engineered corrective action are out of scope unless separately engaged.

---

# Licensed/Specialty Work

AuxiliumOS v1 should not imply Auxilium self-performs roles requiring separate licensing, vendor authority, or specialist qualification.

Examples:

- Engineering
- Fire/life-safety certification
- HVAC/TAB certification
- Generator testing/certification
- Asbestos abatement
- Lead abatement
- Mold remediation where conflict rules apply
- High-hazard hazmat response
- Medical physicist/radiation work
- Legal counsel
- Public adjusting/claim negotiation

---

# Production Use

Production use is out of scope until:

- Role matrix is reviewed.
- Document access matrix is reviewed.
- RLS policies are implemented and tested.
- Document release workflow is tested.
- No-PHI policy is approved.
- Backup/restore plan exists.
- Deployment workflow exists.
- Human approval is recorded.

---

# Real Client Data

Real client data is out of scope during prep/specification.

Real client data may be used only after:

- Access model exists.
- RLS is tested.
- Document release workflow is tested.
- Security guardrails are approved.
- Client data onboarding gate is approved.

---

# Full Monster Build

The full AuxiliumOS end-state is out of scope for the first build slice.

The first build slice is limited to:

Account
→ User Role
→ Facility
→ Incident Request
→ Admin Queue
→ Document Upload
→ Document Release
→ Client View
→ Audit Event

Out of scope for the first slice:

- Full service ontology
- Full ROM engine
- Full sampling engine
- Full MSA engine
- Full site passport
- Full QBR dashboard
- Full vendor governance
- Full finance/accounting integration
- Full production deployment
- Full AI automation