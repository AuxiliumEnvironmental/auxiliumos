# Full-stack build protocol

This is the implementation companion to docs/00-control/EXECUTION_PROTOCOL.md. REQUIREMENTS.json defines the complete destination; this protocol defines how a feature becomes working backend and UI. It does not itself implement a feature.

## Establish one current source

1. Inspect the actual Git root, origin, branch, HEAD, dirty files, remote access and open work. Reconcile the continuation package using its dry-run importer. Preserve divergent work for deliberate merging. Do not treat a ZIP, chat memory or board label as the newest code.
2. Read current Lovable project metadata/source at a pinned commit. The identified OS project is 0b7bbfc6-627f-4ca0-9217-98f5b164b419. Verify its actual GitHub repository/branch connection through available tools or settings; do not infer automatic sync. Compare its source with the GitHub static shell before ARCH-001 selects one production frontend basis. Preserve useful UI rather than performing a blanket rewrite. Record any required source transfer explicitly.
3. Use the owner's existing Supabase backend, observed as auxiliumos-dev (txofqxictwecgcnvezlb). Reconcile project identity, migrations, schema, auth and private-storage configuration using authorized read access. Match that reference to current source/environment before writing. Do not create a replacement backend or use Moldo production. An empty public-schema response is not proof that auth/storage or every schema is empty.
4. Reconcile project/workspace knowledge against current owner instructions. docs/08-ai/LOVABLE_KNOWLEDGE.md is the project mirror; LOVABLE_WORKSPACE_ADDENDUM.md is OS-only. Preserve other projects' workspace instructions. Verify hosted readback after updates; editing a repository file alone does not update Lovable settings.

GitHub is the durable code/decision source. ChatGPT coordinates the work; Lovable can implement the existing app through its connected tools. Cursor is optional and, if used later, opens the same repository/branch. If live GitHub is inaccessible, continue independent analysis and reviewable package work; do not certify reconciliation, remote persistence or production readiness.

## Define one complete feature contract

Expand the next dependency-ready roadmap entry into a bounded task. Include these fields in its issue/task packet, without creating a second competing status register:

| Contract item | Required content |
| --- | --- |
| Goal and provenance | Requirement IDs, source versions, user/SOP outcome, original intent and any proposed change |
| Actors and states | Allowed/denied roles, account/facility/vendor scope, state transitions, owner-default IDs and activation gates |
| Data | Owned records, constraints, immutable revisions, migrations, synthetic fixtures and compatibility/recovery strategy |
| Server/API | Request/response types, validation, transaction boundaries, permission enforcement, idempotency/concurrency and failure semantics |
| UI | Routes/components, design references, bindings, next actions, responsive/accessibility behavior and all relevant error states |
| Evidence | Affected checks, real runtime target, meaningful positive/negative journeys, reviewer and acceptance criteria |
| Delivery | Exact branch/commit, exclusive allowed paths, dependency interfaces, rollback/forward-fix plan and first incomplete action |

Use stable module boundaries within a maintainable application. Add services or queues for demonstrated reliability/workload needs. Do not add infrastructure just to appear enterprise-grade. Keep migration ordering, shared types, permissions, root registers and lockfiles under one lead writer. Backend/UI specialists can work in parallel after their contract is pinned and files are isolated. A Lovable project remains one writer even if other specialists run elsewhere.

## Implement through every affected layer

1. Extend the verified schema additively. Reuse the existing foundation migration if appropriate to its actual deployment history; never recreate Issue #80 or edit already-applied migration contents. Define ownership, optional relationships, constraints, indexes, revisions and audit provenance. Separate membership status from capability; preserve Incident versus Project Request and effective amendments.
2. Implement actual backend authorization, auth/session handling, RLS, private storage and server-side validation. Deny cross-account/facility access, inactive membership, restricted fields and unrelated vendor work through direct API calls. Limit privileged server operations and verify caller scope there. Define least-privilege environment/secret requirements without putting credential values in the repository or prompts. Use current official documentation for the actual stack.
3. Implement domain services and state transitions atomically where needed. Handle concurrency, stale revisions, retries, duplicate/replayed callbacks and partial failures. Tie approvals, signatures and releases to exact revisions. Keep preserved originals, replacement drafts, holds and access restrictions distinct. Build provisional business defaults as configuration with live activation gates.
4. Connect the real UI to the verified development API/types. Use the existing design-system and component rules in docs/06-ui. Cover loading, empty, forbidden, validation, missing prerequisite, conflict, save failure and retry behavior. Persist successful work and report genuine failure. Keep synthetic/demo data clearly identified; never use visual success as evidence of a server write.
5. Deliver the appropriate simple, enterprise, internal and assigned-vendor experience. Check phone and desktop layouts, keyboard/focus, labels, readable status, useful next action and progressive disclosure. Prevent accidental exposure through search, counts, exports, attachment URLs or cached screens. Required work must remain discoverable without turning every screen into a dashboard.
6. Connect each SOP to a version, accountable role, entry criteria, input/evidence requirements, review/escalation, exceptions and completion record. Preserve professional approval boundaries. Instrument useful operational outcomes, such as elapsed handoffs, missing evidence, rework and release turnaround, with recorded definitions. Keep proposed targets distinct from owner-approved commitments.
7. Add recovery and operations appropriate to the feature: observable failures, bounded retries, audit integrity, deployment configuration, migration safety, representative workload measurements and a forward-fix/restore path. Use docs/09-release for final release, restore, security and operating gates. Integration must keep Moldo usable during OS outages and support scoped export/separation.

## Dispatch and review Lovable work

Inspect current callable tool descriptions because platform behavior can change. The observed connector supports reading project/files/knowledge and sending bounded implementation tasks; this does not prove GitHub write access.

Before dispatch, check for an active or paused turn. Record the project, input commit, task ID, allowed paths and acceptance. Send one bounded build request with only relevant source contracts. Use asynchronous submission when available; save its message_id/thread_id immediately so a new chat can resume observation without resubmitting the same work. Do not repeatedly enable higher-cost modes unless the task and owner's preference justify them.

Read get_message response.status to determine the agent outcome. The top-level user-message status is not a terminal build result, and project provisioning status is not build completion. project.agentFinished alone cannot prove acceptance. Awaiting input is a pause: inspect the actual approval/check-in and follow the platform's required route. Protected credential forms must be completed in the editor; never collect credentials in chat or bypass the pause with a replacement prompt. Do not send duplicate work while queued, running or paused.

At completion, record returned commit/edit IDs and check fresh project metadata. Inspect changed source and actual diff, tests and preview against the task contract. A worker's summary or completed status is not proof of correctness. If no diff API is available, compare pinned before/after file versions. Resolve unexpected edits before integration. Record exact source/preview/backend versions in acceptance evidence.

Verify that changed source reaches the intended GitHub branch. If the connection is absent, transfer a reviewable patch/export through supported tools after source reconciliation. Never assume a hosted Lovable commit exists in AuxiliumEnvironmental/auxiliumos. Record unresolved parity explicitly and continue independent work.

## Accept, save and continue

Use the existing acceptance matrix. Test database/API denials and state transitions where security or authority changes; use representative browser journeys for each affected surface. Reuse unchanged evidence only when all relevant source, tests, config and environment inputs still match. Mutable cloud state requires fresh target verification. Do not multiply equivalent tests or rerun a full suite solely because the chat changed.

Review consequential migrations, permissions, releases and commercial behavior independently. Register actual checks in VERIFICATION_PROFILES.json with appropriate evidence levels. Do not attach static evidence to runtime requirements. Record failures, diagnose causes and keep an explicit missing-evidence state when a tool/environment is unavailable.

Update BUILD_QUEUE.json, REQUIREMENTS.json, OWNER_DECISIONS.json and observed BUILD_STATE.json as facts change. Checkpoint the exact first unfinished action and any active Lovable message IDs. Commit/push reviewable work to the authorized feature branch and read back remote HEAD when access exists. Preserve source, migrations, test results and decisions, not credentials. A saved ZIP/checkpoint is not a GitHub push.

Continue dependency-ready work through all 20 modules. At chat transition, read the compact current startup set and selected task sources, not every old conversation. At release, require current application build/CI, real role journeys, isolation and authority checks, restore/deployment evidence, accepted operational targets and the specific live business/production approvals. The full release gate remains closed until those claims are demonstrated.
