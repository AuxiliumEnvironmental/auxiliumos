# Auxilium Spatial F00 review handoff

F00 preparation is complete for master review. No feature was implemented. No lease, master acceptance, GitHub update, host transfer or release was recorded. This is a small supplemental handoff, not another source backup or replacement for the master ZIP.

## Source and coordination

| Item | Verified observation |
|---|---|
| Program base | `141a4cd756751c437e4ecdde07a1db9703588687` on `spatial/feature-program-2026-10-11` |
| Maintained source | `spatial-source/web/`; runtime checkpoint `b64448eac79e3cd0b046f7c5e1a256b3e9c73905` |
| Original recovery checkpoint | `eebd27f8fd3c5b2d4e21c7c6957f9dcd017c0a59` |
| Dedicated host | `467221a836c10ac2730bfa2375adde0ec447165c`, latest agent finished |
| Reviewed OS branch | `a2b31bff3e88ab3a1a86285ab935552796c4d3cd`, unchanged |
| OS host | `4adbb330c0b4e7832bcae938a6507ee4b27ae0c3`, latest agent finished |
| Activation and queue | Live `active_task: null`; F00/F01 planned in the one existing Spatial BUILD_QUEUE |
| Newer relevant work | None found on those refs; clean fresh checkout, 31 relevant source files match original runtime |

The program branch/source root is the working source. Its snapshot history differs from the original recovery Git history. The archived historical Spatial branch `42b7754` was already known; OS `main` at `1729a52` is 45 commits behind the reviewed integration branch. Neither is a newer source to overwrite into this branch. Uncommitted work outside this checkout is not visible and was not touched.

## Reviewable deliverables

- [F00_PROPOSAL.patch](F00_PROPOSAL.patch): four documentation-only changes against the exact base above, successfully dry-checked with `git apply --check`.
- [Proposed shared contract](proposed/docs/11-launch/spatial-feature-program/SHARED_CONTRACT.md): verified reuse points, concrete D01-D10 decisions and explicit open product questions.
- [Proposed decisions](proposed/docs/11-launch/spatial-feature-program/DECISIONS.json): revision 2, all entries still proposed; no accepted-by identity or timestamp.
- [Proposed platform delivery](proposed/docs/11-launch/spatial-feature-program/PLATFORM_DELIVERY.md): current identities and safe transfer/packaging boundaries.
- [Proposed F01 activation](proposed/docs/11-launch/spatial-feature-program/coordination/F01_ACTIVATION_PROPOSED.json): exact source base, seven writable source/test paths, dependencies, focused checks and master recording steps; `active_task` stays null.
- [Structured F00 handoff](F00_HANDOFF.json): uses the supplied template and records evidence/platform status separately.
- [Source checks](evidence/SOURCE_CHECKS.json), [remote observations](evidence/REMOTE_OBSERVATIONS.json), [focused checks](evidence/DOCUMENT_CHECKS.json), [independent review](evidence/INDEPENDENT_REVIEW.json), [review resolutions](evidence/REVIEW_RESOLUTION.json), [final ref check](evidence/FINAL_REF_CHECK.json).

## Concrete recommendations

1. F01 stays a material-only change. Share wall/floor/ceiling tokens with GLB, preserve category contrast when selected, retain batching/idle rendering and the existing display-ceiling export limit. No types/schema/store/Swift prerequisite is required.
2. F02 extends the existing full-arclength opening helpers. Persist style/end/side only where applicable; reverse them correctly on host reversal. All drags use the existing command/store boundary with an explicit drag-start revision/context fence.
3. F03 gives each room explicit ceiling intent. Infer only a previously uniform plane, retain null for unequal tops, and preserve neighbor intent before extending shared walls. Lowering the ceiling leaves structural wall height intact. All selected structure changes are one transaction.
4. F04/F05 reuse stable wall-side or room-surface references and physical local coordinates. Exact remaps preserve geometry; unresolved observations remain recoverable. Rigid-fixture conflicts reject instead of silently reattaching. True holes clip material; furniture never subtracts recorded evidence.
5. Add each strict schema delta only in its consuming feature. Keep source, served host, packaged Apple assets and OS integration evidence separate. The OS packager is not atomic around its route check; stage future transfers first.

These are proposed engineering decisions. Cutout meaning remains open until F04; unnamed catalog variants also need a bounded F04 checklist. Neither blocks F01. No product clarification is required from the owner for the first palette change.

## Master adoption and next assignment

1. Read the proposal and the focused independent-review receipt. Record acceptance or specific corrections; do not report this preparation as already accepted.
2. Reconcile current program HEAD, dirty work and `coordination/ACTIVE_TASK.json`. Preserve any newly active task; do not overwrite it. Review the patch against current documents if they advanced.
3. Adopt the four proposed documents as a reviewed commit if accepted. Example from the repository root: `git apply --check /path/to/F00_PROPOSAL.patch`, then apply only after reviewing the current diff. This handoff did not apply or commit them.
4. The proposed F01 source base is exactly `141a4cd756751c437e4ecdde07a1db9703588687`. If adopting F00 produces a new documentation-only commit, set F01's actual base to that exact accepted commit. Reuse matching source hashes; do not invent the future hash now. If runtime source changed, reconcile the relevant difference first.
5. Appoint one F01 worker, record the actual activation using the proposal's path/acceptance fields, and update the existing Spatial queue/control state. Do not create a second queue or treat the proposal file as a lease. Link this handoff on #89 and record the master disposition when appropriate; #89 remains open and unchanged in this turn.
6. Provide the accepted source, contract and recorded assignment to F01. No F02 work starts in that chat.

## Verification and remaining gates

F00 ran focused reference/path/JSON/diff checks and compared 31 relevant source inputs. The original inner ZIP still matches `52cd76535230296fc3fe16fee75c952c637bd113a67a422953bb462819eec60d`. The existing all-1179-file audit and recovery verification were reused, not repeated. No app, Apple, OS, performance, database or broad regression suite ran.

Apple historical unsigned builds and 14 synthetic simulator checks do not establish current installed shared-web assets or physical iPhone acceptance. Current device capture, interruption/recovery, touch/accessibility, WebKit protection, native sharing and frame/memory gates remain open. The 2000-overlay workload remains an F05/F06 concern. OS project authority and recoverable maintained-editor cutover remain separate. Provider metadata here is not a new public-web journey.

GitHub changes actually made: **none**. Read access and existing refs/issues were verified; no write was attempted. Dedicated Spatial/OS/companion/Moldo runtime and the uploaded master ZIP are unchanged.

## PASTE BACK TO MASTER

F00 preparation is ready for your review in this handoff ZIP. Inspected program commit `141a4cd756751c437e4ecdde07a1db9703588687`; current Spatial host `467221a836c10ac2730bfa2375adde0ec447165c` and reviewed OS source/host refs are unchanged. Live ACTIVE_TASK is null. The patch proposes shared-contract/decision revision 2, platform delivery notes and a nonactivated F01 assignment with exact paths and focused checks. No runtime feature, queue/lease, GitHub, host or deployment change was made. Cutout scope remains open for F04 and does not block F01. Review `REVIEW_FIRST.md`, `F00_PROPOSAL.patch` and `F00_HANDOFF.json`; accept/correct the proposals, pin the resulting exact source base and record the F01 activation yourself.
