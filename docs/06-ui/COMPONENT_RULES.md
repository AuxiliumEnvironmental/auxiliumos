# Component Rules

Status: Proposed implementation design under the 2026-10-08 development mandate. No runtime or final policy approval is claimed. Link component evidence to [REQUIREMENTS.json](../../REQUIREMENTS.json); authority comes from [OWNER_DECISIONS.json](../../OWNER_DECISIONS.json).

## Reusable behavior

- Forms use persistent labels, logical sections, explicit required fields, units where relevant and inline errors. Preserve valid input after failure. A primary action states the outcome: Submit request, Request review, or Release this version.
- Lists support loading, empty, denied, error and populated states; stable keys and pagination prevent large datasets becoming unusable. Filters and deep links preserve context.
- Status components distinguish draft, saved, pending synchronization, awaiting decision, effective and failed. Color always has a text/icon cue. Optimistic UI must never portray a binding approval/release as durable before the server confirms it.
- Approval components display exact version, actor authority, changes and audience. The server rechecks membership status, assignment and policy at execution. Hiding or disabling a button is not authorization.
- Uploads show progress, successful persistence and retryable failures. Upload retry cannot duplicate a released version. Quarantined content cannot preview or reach AI. No PHI in demonstrations.
- Messages link to their account/project/document. Suggested changes become drafts; they cannot alter scope, caps, sampling or release state.

## Mobile and accessibility

Use sufficiently large separated touch targets, keyboard access, visible focus, semantic labels and announced errors/status. Drawers/dialogs keep their primary action reachable when the keyboard opens and restore focus on close. Support text enlargement and reduced motion. Long labels wrap; tables adapt to cards or deliberate contained scrolling without clipping the page.

## Acceptance and recovery

Verify each new shared behavior once with representative inputs, plus consuming workflows whose behavior changes. Check phone keyboard, long names, duplicate taps, interrupted network, retry, concurrent record updates and revoked membership. Cancel restores a safe prior view; unsaved changes require a recoverable choice. Reuse stable components rather than duplicating per-service implementations.

Retention hold and access restriction remain separate controls. Released-document actions bind to one revision; preparing a replacement does not hide the current report. Moldo-only users receive no OS access. Companion-specific editors are deferred, not embedded as a requirement for ordinary OS forms.
