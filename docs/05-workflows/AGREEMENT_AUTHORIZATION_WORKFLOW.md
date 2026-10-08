# Agreement Authorization Workflow

Status: Proposed implementation design under the 2026-10-08 development mandate. This is a software contract, not approved legal language or an implemented signature service.

Authority: [OWNER_DECISIONS.json](../../OWNER_DECISIONS.json), OD-005 through OD-009 and OD-017. Track implementation/evidence in [REQUIREMENTS.json](../../REQUIREMENTS.json). Develop with synthetic terms and signers; pending policy approval gates only binding use or external sending.

## Required authorization record

Link the account/program, Request/Project, exact scope revision, terms/template revision, rate basis, payer, required signer/delegation, cap or explicit applicable cap policy, sampling decision, deliverables, prerequisites and expiration policy. Missing commercial values remain pending, never an invented zero/unlimited authorization. An active MSA needs an applicable clause and covered facility/service, not merely an account flag.

## Controlled flow

1. Prepare `draft`; resolve scope and commercial conflicts.
2. Enter `internal_review`; assigned technical/commercial reviewers approve their responsibilities.
3. Enter `ready_to_send` after terms and scope revisions are frozen and recipient authority is checked.
4. Send through an authorized channel and record `sent`, delivery attempt and document fingerprint.
5. Record `partially_signed` or `fully_signed` with exact-version evidence, signer identity, authority, timestamp and consent evidence required by the configured signature process.
6. Mark `effective` only when all required signatures, payment/PO/cap and other stated prerequisites pass. Then permit scheduling release.

`declined`, `expired`, `voided` and `superseded` preserve history and reasons. Editing a sent payload creates a new version and invalidates that payload's pending signing path. Never mutate an already signed agreement or silently backdate authorization. A qualified reviewer approves scientific scope; a commercial signer does not replace that review.

## Changes and exceptions

Use `CHANGE_AUTHORIZATION_WORKFLOW.md` for additions or changed caps, sampling and deliverables. Preserve original and replacement obligations. `EMERGENCY_EXCEPTION_WORKFLOW.md` defines limited exceptions; urgency does not auto-approve spending or unsafe work. Chat can request a change, not authorize it directly. No PHI in payloads or fixtures.

## Acceptance and recovery

Test wrong signer/account, revoked membership, over-limit delegation, altered scope, missing prerequisite, expired request and duplicate/reordered signing callbacks. Callbacks require verified origin and matching identifiers; a client-provided status is not signature evidence. Repeated processing produces one effective authorization and one intended notification.

An interrupted provider call remains pending reconciliation; query the recorded transaction before resending. Keep the immutable signed artifact and audit evidence. Distribute it only to authorized parties through document controls. No live send, signature claim or legal enforceability claim follows merely from a passing development test.
