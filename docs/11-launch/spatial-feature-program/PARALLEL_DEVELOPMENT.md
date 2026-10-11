# Parallel Spatial feature development

Effective owner direction: October 11, 2026. The owner explicitly requested several feature chats working at the same time, with this master controlling integration order. This supersedes the original one-feature-at-a-time development restriction. It does not authorize simultaneous writes to one branch or live host.

## Four active development assignments

`coordination/ACTIVE_TASKS.json` is the authoritative assignment ledger on the program branch. `source:BUILD_QUEUE.json` remains the canonical work queue. The old `ACTIVE_TASK.json` is deliberately nonauthorizing so an old prompt fails closed.

F02 openings, F03 ceiling heights, F04 fixtures and F05 affected areas may all begin from their assigned isolated branches. Only one implementation owner writes each branch. Their branches start at the same master activation commit, descending from accepted F01. The master creates the branch before delivering its prompt; a worker verifies the live ledger and branch rather than guessing a missing branch or lease.

Each feature chat reads the live ledger from the program branch before its first edit and before push. A copy of the ledger inside a feature branch can become stale. Use a dedicated clone/worktree; preserve other writers and dirty files. Commit/push only its assigned branch and exact allowed paths. Never push a feature directly onto the shared program branch, force-rewrite another writer, or use Lovable to edit the live source concurrently.

## Concurrent implementation, ordered integration

Development starts now; integration follows F02, F03, F04, F05. F06 covers the composed product and remaining platform delivery. A predecessor is an integration dependency, not a reason to leave independent feature implementation idle.

Workers build actual feature code and focused tests, not just another planning packet. Mathematical helpers, feature UI, record validation, rendering and candidate integration adapters can be implemented on an isolated branch. Keep shared-file adapters in identifiable commits. Implement only your own feature; do not duplicate an entire predecessor to satisfy a dependency.

A branch-local result is `branch_implementation_complete_pending_integration`, with explicit actual dependency revisions tested. A synthetic fixture implementing an interface can exercise a helper; it does not establish a working upstream feature, deployed app or combined acceptance. Dependency-sensitive wiring and cumulative schema admission must be reconciled against real accepted predecessors before master acceptance. Do not ship temporary fake adapters as working functionality.

The master integrates actual diffs semantically in a clean staging checkout. Do not cherry-pick wholesale replacements of types, editor, scene, viewport, schema or import files over newer feature work. Coordinate a worker refresh only when it is idle, preserve its commits, and resolve conflicts once. A common file may change on isolated branches, but only the master decides its combined result. No automatic cross-chat mailbox or background execution is assumed; the owner brings each handoff back here.

## Shared interfaces and version ladder

Contract revision 3 and `SURFACE_INTERFACE.md` fix common semantics. F02 owns the first concrete opening gesture/commit fence and catalog implementation. F03 owns first `core/surfaces.ts` implementation plus ceiling identity/domain resolution. F04 consumes it for rigid fixtures and exact attachment outcomes. F05 consumes the same surface/remap vocabulary for observations. A task may propose a necessary change on its isolated branch, but it cannot silently redefine the shared interface for other chats.

Geometry/scene reservations: F02 1.2.0, F03 1.3.0, F04 1.4.0, F05 1.5.0. Keep every old schema immutable. A later branch can create a candidate new schema locally, but its cumulative definition must preserve all accepted predecessor fields, roles, migrations and constraints before integration. No branch's incomplete schema becomes accepted simply because its version number is larger. Local package/profile versions remain unchanged only while their admitted member/vocabulary contract stays unchanged.

Preserve F01 palette, F02 style-versus-aperture provenance, strict supported-version admission, saved original snapshots, one-transaction undo, authority/revision fences, real holes, camera usability and event-driven rendering. Preserve the existing single maintained editor and native capture bridge. No competing gesture or surface framework.

## Bounded checks and delivery

Use focused risk checks already listed in the task. One final candidate build. Reuse matching unchanged evidence; after integration run only probes for changed seams plus F06's combined journey. Do not run four full platform/stress/offline suites independently or ask Lovable to repeat local checks.

Only the master transfers accepted integrated source to the host, packages Apple assets or changes the OS embed. Keep source, local UI/build, host bytes/build/served version, Apple assets/compile/simulator/device and OS context acceptance distinct. No feature branch deployment, installation or business-record binding.

F04 fixtures are authorized now. Q01 still gates actual cutout types and F04-A04; it must not block fixtures or other chats. Named families are required. Unnamed variants remain recorded provisional choices under Q02. F05 consumes only real agreed holes and never invents cutout scope.

## Handoff and stopping condition

Return the actual branch/base/result commits, changed paths, focused command results, screenshots, shared-file adapter commits, dependency versions tested and remaining integration/platform/scope gaps. Do not close the issue or call a branch integrated. End with PASTE BACK TO MASTER. The master accepts/integrates the result and updates tracking. A finished worker stops instead of taking another feature.
