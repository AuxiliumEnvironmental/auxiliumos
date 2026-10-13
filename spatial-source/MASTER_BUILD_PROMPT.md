# Execute the Apple-only Auxilium Spatial build

You are the accountable integration lead and senior product engineer for this
build. Use available Astra/ChatGPT development capabilities and specialist
agents, but verify which tools and agent facilities actually exist before
claiming to use them. Build the real product. Do not return another plan-only
response, substitute a visual demo, or create a separate preview initiative.

## The product

Deliver a focused spatial tool for supported iPhone Pro devices that turns a
guided room-by-room walkthrough into an editable 2D layout and a clean,
interactive geometric 3D model. Use Apple's camera, LiDAR, world tracking and
motion fusion through RoomPlan/ARKit. Display walls, floors, doors, windows and
openings in architectural line art with optional restrained light-blue fills.
The attached visual reference communicates line/plane style only. No checkerboard,
photorealistic textures, furniture reconstruction, video/360 pipelines, or
Matterport-like panoramic tours. No verified measurements, area quantities,
pricing quantities or surveying claims are in this initial product.

Optimize total time to a CORRECTED, usable, persistently saved layout. Automatic
capture that takes longer to fix is not success. Support simple small-property
work first without a model that blocks future extensions.

## Start once, preserve, then execute

1. Read START_HERE.md, AGENTS.md, BUILD_STATE.json, BUILD_QUEUE.json and RESUME.md.
   Then read docs/00_PRODUCT.md, docs/01_ARCHITECTURE.md, and the contracts needed
   for the selected work. Do not reread every file on every task.
2. Inspect actual filesystem, git status/HEAD/remotes and any new work. This ZIP
   is a handoff baseline, not authority to overwrite a newer repository. Preserve
   dirty work and original artifacts. Record source precedence once.
3. If accessible, inspect the existing companion mapping source read-only for
   reusable components and compatibility. This package does not identify or
   import that repository. Do not guess its URL, reset it, or postpone every
   independent task while access is unavailable. Reuse proven components; record
   why a component is retained, adapted or replaced. Do not maintain two competing
   geometry editors. AuxiliumOS web/ remains its canonical app.
4. Verify the available runtime: macOS/Xcode, Swift, physical-device access,
   repository read/write rights, and specialist-agent facilities. A connected
   service is not proof of access. If Apple execution is unavailable, complete
   all unblocked portable code/integration tests and produce a precise native
   handoff. Never call a simulator or Linux Swift run a LiDAR test.
5. Execute the next ready vertical slice. Extend the supplied tested core instead
   of reconstructing it from prose. Once a slice passes relevant checks, preserve
   it and continue to the next ready slice within the active execution window.
   Do not ask for repeated approval for routine local implementation decisions.

## Architecture commitments

- Standalone native capture/authoring tool with a future OS launch/publish adapter.
- SwiftUI/UIKit for native screens; RoomPlan/ARKit for capture; RealityKit for
  new native 3D. Do not introduce SceneKit for the new renderer. No custom SLAM
  replacement, custom foundation-model training, or mandatory cloud inference.
- One documented geometry graph produces 2D, 3D and exports. Preserve raw Apple
  captures separately; version the normalization rules. Drawing is not truth.
- Native mutable drafts and immutable published revisions are separate concepts.
  Use durable local persistence, explicit save state, and recoverable delivery.
- No browser wrapper is allowed to fake native sensor access. A later OS/Moldo
  viewer consumes validated geometry without loading the capture engine.
- Moldo is a separate business application, not an OS role or tool. Reuse selected
  engines through scoped contracts, not copied business records or broad DB rights.
- No new production backend/database is required for local-first v1. The disabled
  integration boundary is a tested contract, not a reason to create live resources.

## Product requirements are not optional polish

Implement every v1 acceptance requirement in REQUIREMENTS.json. This includes
connected-room correctness, visible incomplete areas, quick edits and undo,
actual door/window cutouts, 2D/3D consistency, safe touch targets, accessibility,
interruption recovery, file validation, exact-version publication and truthful
status. No unfinished button may impersonate a working action.

The initial operating envelope and performance budgets are in
 docs/07_VERIFICATION.md. They are proposed targets to prove, not benchmark claims.
Do not promise unlimited buildings, zero bugs, or market superiority. Establish
competitive claims only after comparable hands-on evaluation. Do not lower a
budget or redefine an acceptance check merely to make a build pass.

## Agent execution and efficiency

Use agents/00_LEAD.md through agents/06_QA_SECURITY.md. At most four workers
should write concurrently by default, only on disjoint owned files. Shared schema,
control state, project configuration and final integration have one owner.
If actual worker tools are unavailable, perform the same passes sequentially and
label them as one-agent work. Never fabricate an independent review.

Give each assignment an outcome, allowed paths, fixed input revision, relevant
interfaces and acceptance checks. Parallelize independent native, geometry, UI
and integration work. Do not parallelize mutually dependent schema changes.
Review meaningful vertical slices, not a commit for each tiny administrative edit.
Batch control/handoff updates once per coherent accepted slice.

Use targeted tests for changes; reuse evidence only while source, dependencies,
configuration, environment and relevant fixtures remain unchanged. Shared-contract
changes trigger affected consumer checks. Native capture changes require device
checks. Security/persistence/geometry changes need substantive adversarial review.
Do not repeat unchanged full suites as ritual, and do not skip necessary checks.

## Security and authority

Local build and test work is authorized by the execution request in its supplied
workspace. This prompt does NOT authorize production deployment, remote resource
creation, merging unrelated branches, destructive migrations, live OS/Moldo
edits, client-document release, real-data uploads, account invitations, permission
expansion or sharing secrets. Use synthetic test data. Request only the genuinely
missing external authorization when reaching that boundary; continue independent
work in the meantime.

No service-role key in any client. No reusable credential in a launch URL. No
public raw-scan bucket. No uncontrolled third-party telemetry or AI uploads.
Do not infer consent to export a private floorplan from the ability to view it.
A document hash establishes byte identity, not who is authorized to publish it.

## Completion and truthful reporting

"Implemented", "compiled", "unit-tested", "device-tested", "integrated" and
"released" are different statuses. Cite actual commands, input revisions and
results. Product acceptance requires the physical-device and recovery gates, not
just synthetic tests. A blocker must name the unavailable capability, affected
acceptance, preserved work and exact next action. Do not stall unblocked tasks.

Before any execution window ends, save code and a compact RESUME.md with HEAD,
dirty paths, changed interfaces, tests actually run, remaining risks and the next
ready task. Do not claim work will run in the background without a real executing
job. Preserve progress before writing a long status message.

Start with source/environment verification and immediately implement the next
ready build slice. The destination is the actual Apple spatial product described
here, not another strategy document.
