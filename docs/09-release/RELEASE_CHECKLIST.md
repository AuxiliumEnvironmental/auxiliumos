# Release Checklist

Status: Proposed release design under the 2026-10-08 development mandate. An unchecked or planned item is not completed evidence. Authority: [OWNER_DECISIONS.json](../../OWNER_DECISIONS.json). Scope/evidence: [REQUIREMENTS.json](../../REQUIREMENTS.json).

## Candidate evidence

- Exact source commit, artifact, environment and migration/config versions recorded; remote persistence verified where claimed.
- Delivered behavior mapped to requirements and acceptance evidence. Remaining final-system requirements stay visible; a foundation release is never labeled the completed OS.
- Meaningful checks cover changed workflows and dependent invariants. Reuse unaffected evidence with its provenance; rerun when relevant code/config/data assumptions change. Do not rerun unrelated suites merely to consume time.
- Real permissions verified: wrong account/facility, revoked or suspended membership despite other roles, direct file URL, finance separation and vendor isolation.
- Scope/authorization/signing transitions and retry/concurrency behavior verified. Human scientific approval remains required; messages and AI cannot change approved scope.
- Exact-revision document review/release verified. Creating a replacement draft preserves the existing release. Restrictions, withdrawals and retention holds behave distinctly.
- Critical phone/client/staff/management flows checked, including save failure, long content, denied access and input recovery.
- Backup/restore evidence, monitoring, support ownership and compatible rollback/forward recovery recorded.
- Dependency and secret scans, privileged-admin MFA, document-release audit and independent outside security/code review recorded, with material findings resolved or explicitly dispositioned. These are requirements recovered from the full original AI Tool Workflow DOCX; no completion is claimed here.

## Live activation gates

Record the owner-policy version and approval for each binding capability being enabled: roles, audience, release, scope/sampling, financial terms, MSA/emergency authority, qualifications, vendors, identity, retention, runtime AI and outbound actions as applicable. A pending decision keeps that live action disabled or pending authorization; it does not stop independent implementation.

No PHI in v1. Real client onboarding requires tested access/release controls and the OD-015 production gate. Secrets remain outside artifacts/prompts. Moldo-only users have no OS access; live integration requires OD-016 contract and permissions. Companion is deferred.

## Outcome record

Record `approved for identified environment`, `failed`, or `blocked for identified activation`, with precise scope, evidence and next action. Do not infer owner approval from test success. After promotion, verify artifact identity and a focused operational check, then save the release record and handoff. If deployment or evidence is missing, state that explicitly rather than converting a checklist into a completion claim.


## Exact full-activation binding (2026-10-10)

Frontend publication permission remains in `BUILD_STATE.json` as its original dated evidence. It does not authorize full business activation. The control gate reads the separate `production_authorization.full_activation` record only when such an actual approval exists.

Run `node scripts/os-control.mjs release-inputs` after the candidate is final. This read-only command returns the required scope (`full_business_activation`), source inventory digest, production environment, configured `config/policy-defaults.json` target, owner-decisions digest and policy digest. It never creates approval fields or changes state. The production target remains unconfigured today.

A real approval record must bind those exact inputs and record the actual `approved_by`, `approved_at` and `evidence`. UTC timestamps use ISO seconds or milliseconds ending in `Z`. The gate rejects missing, impossible or future timestamps, approval preceding a required owner decision, changed source/configuration/decisions, an unconfigured or different target, and publication-only scope. Every decision required for full release must still have its own approved status, actual evidence and `production_enabled: true`. This is technical recording of existing authority, not a new business role or an approval supplied by AI.

The candidate digest includes working source and uncommitted additions. It excludes BUILD_STATE, generated evidence/checkpoints and build/dependency outputs to avoid a self-containing approval. The separate existing requirement/evidence and fresh-source checks still apply. These repository checks cannot authenticate an approver or attest to deployed bytes; actual target readback, operating acceptance and owner authority remain necessary. No full-activation approval was created by this repair.
