# Spatial source and integration audit

Prepared from local preserved sources and the parent's freshly cloned Git refs on 2026-10-11. Read-only source audit; no app tests, provider changes, GitHub writes, dependency installation, migrations or deployment were performed.

## Verified preservation identity

- Archive checkpoint: `eebd27f8fd3c5b2d4e21c7c6957f9dcd017c0a59`, branch `build/apple-spatial`.
- Independently recomputed all 1,179 source hashes in `baseline/RECOVERY.json`: no missing/changed files. Recovery bundle SHA256 matches; recorded tree is clean with no untracked files or dirty patch.
- `git bundle list-heads baseline/recovery/repository.bundle` contains the exact checkpoint plus retained history refs.
- `baseline/recovery/RESTORE.md` correctly restores into a new checkout. It must never reset newer working/source trees.
- Preserved exact runtime source is `b64448eac79e3cd0b046f7c5e1a256b3e9c73905`. Archive head also includes later evidence/control checkpoint changes. Treat source checkpoint, runtime input and host commit as different identities.

## Maintained source and platform reality

The authoritative maintained editor is `baseline/Auxilium_Spatial_Developer_Package/web/`. `START_HERE.md` defines the architecture as one React/TypeScript workspace for standalone web, authorized OS embedding and Capacitor iPhone host, retaining Swift RoomPlan/ARKit capture through narrow bridges. `ios/` native-only authoring is preserved reference source, not a second editor that should be independently feature-built.

The latest preserved dedicated Spatial host is project `addeb89f-cdf1-4688-9157-b208793ffb8e`, host commit `467221a836c10ac2730bfa2375adde0ec447165c`. `evidence/precision-drawing-2026-10-10/FINAL_HOST_COMPARISON.json` binds the nine source/test files plus three protected host files to runtime `b64448e`. `PUBLIC_DELIVERY.json` records HTTP 200 and precision markers in public HTML/route/workspace assets at `https://spatialauxilium.io` on 2026-10-10 17:07:54Z. These are preserved observations; this audit did not freshly inspect the provider or live domain.

## GitHub location is not yet a current standalone source claim

Accessible cloned repository: `https://github.com/AuxiliumEnvironmental/auxiliumos.git`.

- Current reviewed OS branch in this checkout: `origin/work/integration-2026-10-10` at `a2b31bff3e88ab3a1a86285ab935552796c4d3cd`; detached checkout is clean.
- Historical Spatial build branch: `origin/spatial/integration-2026-10-09` at `42b7754265a8755f0f478a135d5506311d731b44`.
- That branch's `spatial-source/SOURCE_SNAPSHOT.json` identifies source `fc3a9b212e2a43b8a4fb41dbc6790ad3710279ba`, with 187 build-snapshot entries. It explicitly calls itself a generated build snapshot and says canonical source remains the separate Spatial repository. It lacks canonical root BUILD_STATE/RESUME. It is not the current 1,179-file archive.
- The OS integration branch's `web/src/spatial-generated/SOURCE_MANIFEST.json` is older still in its recorded source identity: `b286cdf49997a5a90af043ba542cd5c1ae41a705`.
- The preserved standalone reconciliation says its canonical Git history was local/recovery-bundle backed. `integration/STANDALONE_DELIVERY.md` does not establish that a dedicated Lovable-synced GitHub repository has been created. A parent live-provider read may establish a newer remote; none is proven by this archive.
- Do not describe the latest standalone source as already pushed to GitHub just because the old OS build snapshot and a Lovable deployment exist.

## Current ownership and integration restrictions

The OS `BUILD_STATE.json`, `docs/00-control/evidence/integration-reconciliation-2026-10-10.json`, and adopted-map README reserve Spatial source, host, OS selector/adapter and generated Spatial artifacts to the separate Spatial lead. OS source and document work are newer and must survive.

Spatial `integration/README.md` preserves the existing OS selector and old embedded editor pending a reviewed, recoverable cutover. Its maintained source can later be packaged through `integration/package_os.py`; generated files must not be hand-edited. The standalone build path is `integration/package_standalone.py`.

The latest owner now requests parity across platforms. Record that as a new target and implement shared source plus target delivery receipts; it does not make old OS or Apple assets current automatically. Full OS project scope remains unconnected. Current personal/synthetic work cannot be silently promoted to project business records. Membership, source audiences and exact-version publication authority must remain explicit. Live publisher is disabled. Moldo/companion are independent; no source/permission transfer is implied.

Running `npm run os:status` was inspected to be read-only and succeeded. It reports zero fully verified product modules and first candidate UI-2026-10-09; many local evidence profiles are stale or not present, which does not erase separately recorded CI evidence and is not a reason to rerun all OS tests for this documentation work. Recorded first unfinished OS runtime action is the authorized hosted planning/private-file/document journey after fresh fixture/gate/revision preflight, with released-recipient bytes separate. This is not the first Spatial feature task.

## Apple evidence and remaining gates

`evidence/shared-workspace/APPLE_COMPILE.json` records GitHub run 37969726280 at integration source `f04253966ac57e4dc8780d16efb5ebc172e183e2`, Xcode 26.3 / iOS SDK 26.2 / Swift 6.2.4. The actual preserved `apple-run-37969726280.log` contains two BUILD SUCCEEDED outcomes, 14 simulator tests with zero failures, and TEST SUCCEEDED. Scope is unsigned compile/link plus synthetic bridge/capture-retention policy, not physical LiDAR behavior.

The receipt records 147 non-web inputs matched for reuse and expressly says subsequent web changes were not exercised on iOS. Do not use that compile result as acceptance of today's installed web assets. Physical supported-iPhone capture, interruption/alignment, lock/kill/low-disk/thermal behavior, WebKit IndexedDB protection, VoiceOver/Dynamic Type, share destination, signing/install and native performance remain separate.

The isolated old GitHub branch's `.github/workflows/spatial-apple.yml` auto-runs only for pushes to that exact old branch with spatial-source/workflow changes. Preserve it and avoid gratuitous snapshot pushes there. Canonical source has a manually triggered `.github/workflows/apple-unsigned.yml`; its standalone paths must not be copied over the OS root workflow blindly.

## Performance facts

`docs/07_VERIFICATION.md` retains proposed budgets: local feedback p95 <=100 ms; warm 2D/3D <=500 ms; target 60 Hz / about 16.7 ms frame work on baseline iPhone 15 Pro; no continued retained-memory growth after cache stabilization across 20 open/edit/close cycles. These are targets, not proven claims.

`web/tests/ui/WARM_SWITCH_EVIDENCE.json` records a software-WebGL geometric stress sample with 100 rooms, 1,000 walls, 500 openings, zero overlay markers: 30 warm samples, p95 421 ms; cold creation 1,117.4 ms. Warm sample is below the warm target; cold number is not a warm failure. Total-memory acceptance and the proposed 2,000-overlay portion remain unaccepted. `START_HERE.md` says large software-WebGL transitions exceed target without this distinction; use the scoped primary receipt. The new damage feature creates the real overlay workload and must close its own incremental cost, picking, geometry clipping and memory risks.

Preserve the latest frame-limited previews, memoized saved geometry, exact release/cancel coordinates and one Finish transaction. New drags need cheap preview paths and command commit at gesture end. No new per-frame persistence, whole-scene rebuild, network call or unbounded render loop.

## Documentation discrepancies to resolve in the program overview

1. `evidence/KNOWN_LIMITS.md` is historical native-only text claiming no Apple compile; newer actual Apple log supersedes it.
2. `README.md` emphasizes the old OS preview; `RESUME.md` and latest delivery receipt identify the independent live domain.
3. `integration/STANDALONE_DELIVERY.md` contains obsolete unpublished/domain-pending prose and an older host refresh. Preserve as history and explicitly point workers to the new authoritative state document.
4. Queue SP-WEB-HOST still says domain pending while latest receipt records served custom-domain assets.
5. `current_shared_workspace_evidence` fields include an old OS host/runtime and `host_contains_current_manual_source:false`; later `standalone_delivery` records govern the dedicated host, not OS.
6. BUILD_STATE's native-input reuse does not mean the exact current web package has been rebuilt or tested in an installed Apple app.
7. An older statement that source GitHub was unavailable does not prove current unavailability; use the parent's current connector observations.

Do not fix history by erasing older failures, rewriting historical manifests or making all statuses look equal.

## Recommended safe GitHub tracking/preservation

Preferred minimal route after discussion with master: push the recovered original Spatial Git history/root layout as a new isolated branch `spatial/source-2026-10-11` at exact `eebd27f`; create the feature-program branch from that baseline and target its PR to the Spatial baseline, never OS main or integration. This preserves original source history, AGENTS and build paths. The baseline is frozen by process; the program branch becomes the stated Spatial development branch. Verify actual branch HEAD/tree after pushing. No new repository is claimed, and existing OS refs/runtime remain unchanged. A source-only API snapshot under `spatial-source/` on a new OS-derived branch is a fallback if original-history Git push cannot be used; it must be labeled a snapshot and its path/history limitations recorded. This preferred source branch supersedes the optional prefix-copy recommendation below.

1. Inspect the actual dedicated Lovable project's Git linkage first. If a current linked repo exists, reconcile its host overlay and maintained source exact bytes and choose the canonical source map explicitly. Never guess a repo name.
2. Record this feature program on an isolated documentation branch from current reviewed OS source, under a bounded path such as `docs/11-launch/spatial-feature-program/`; include manifest, canonical source/ref mapping, master prompt, one task packet per feature, queue, platform matrix, and recovery reference. Keep OS root controls/requirements unchanged unless the OS integration lead allocates a specific amendment.
3. Preserve complete canonical source and history in the recovery package. If no standalone GitHub repo is verified and source must be saved in the existing authorized repo now, use a clearly named isolated Spatial source branch with the entire canonical package under `spatial-source/`, source manifest and historical bundle reference. Do not merge its unrelated OS parent/runtime tree into OS as a feature delivery. Do not present the old 187-file snapshot as the whole source.
4. PR/issue tracking should link the exact baseline commit/package digest and feature IDs. A docs/source-preservation PR is not app implementation. Verify actual branch ref and readback before saying saved to GitHub; keep commits/PR URLs as pending until real.
5. One Astra master owns contract acceptance, shared allocations and deployment receipts. Only one feature implementation chat active at a time, per newest owner instruction. Parallel agents may audit or review bounded nonoverlapping tasks; ordinary chats coordinate through actual committed task packets/returns, never assumed shared memory.
6. Freeze accepted input commit before each chat, list exact allowed paths and dependencies, return diff/commit plus changed-risk evidence and explicit platform gaps. The next chat reads the accepted predecessor, not the original archive.
7. One shared behavior implementation must be built into web, dedicated host and Apple assets, then later OS adapter/generated outputs under the reviewed authority contract. Mark each surface independently: source implemented, generated, compiled, served, device verified. Reuse unchanged evidence only with matching relevant inputs.


