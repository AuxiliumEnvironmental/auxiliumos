# Current state and provenance

## Master integration update: October 12, 2026

F02 openings is **code accepted with platform gaps** and integrated into this program source. Reviewed branch commit: `6342e87e27376fb664dfe904d299a2c94ffac1ff`. Its full production build and focused catalog, numeric/elevation, mobile 3D, IndexedDB and archive browser checks pass. The integrated application and contracts match the reviewed candidate byte for byte. A cancellation-feedback defect and browser fixture assumptions were corrected. Some cancellation paths retain code-review/core evidence rather than separate browser runs.

F04 fixtures and optional wall/floor/ceiling cutouts/penetrations are reviewed and saved at `44315237caccb4fb2511ebf54867f504f7a4d859`. The 20-entry catalog and real cutouts remain on that feature branch. Review fixes cover hidden-ceiling picks, group selection and movement across wall bends. F05 affected areas is reviewed and saved at `dc53c7a1bce141706764a8da3af82c1c69fb1333`; replacement ceiling identities now preserve observations unresolved. F05's final build, store/export checks and desktop/mobile browser journeys pass. Neither branch is accepted as composed source yet.

**First incomplete action:** Receive F03_LOCAL_CANDIDATE.patch (or its handoff ZIP), verify its recorded hash, apply to the real F03 branch, complete its build/browser and restore-receipt gaps, then compose F03, F04 and F05 into accepted F02. F06 combined/platform checks follow.

The supplied F03 handoff and verification JSON are receipts, not its implementation. Its branch remains at `a90d4f9f132153498d7567758a14132cbafa5c0f`. The missing 27-file patch has SHA256 `dbc06596d98bbf450c71e876fea4c489342a5daa13822eb4c3357eb326dd41d0`; attached files, accessible scratch and targeted Library lookup did not recover it. Preserve the existing candidate rather than rebuilding it from prose.

See `coordination/INTEGRATION_REVIEW_2026_10_12.json` and `coordination/handoffs/`. No worker is claimed to keep running after handoff. Host, Apple and OS delivery remain under F06. The following sections retain the earlier preparation and F01 evidence in their original scope.

## Master review update: October 11, 2026

F01 surface contrast is **code accepted with platform gaps**, recorded at `3240880195cd6653d0816da5cb4412bda2516e52`. Implementation: `33cc3527f239726d2a4503242da9b0a7531ed4b9`; evidence: `d553a3dbb25470abd5e0b157f708f7dda8383769`. Matching source/evidence and both mobile screenshots passed master review. See `coordination/F01_ACCEPTANCE.json`.

The owner approved concurrent feature development. F02 openings, F03 ceiling heights, F04 fixtures and F05 affected areas are assigned isolated branches in `coordination/ACTIVE_TASKS.json`. Contract revision 4 and `SURFACE_INTERFACE.md` freeze their shared semantics. No feature worker is claimed to be running merely because an assignment exists. Integration remains F02 then F03 then F04 then F05. The old single-task file is retired.

The owner resolved Q01 on October 11: optional wall/floor/ceiling cutouts and service penetrations are authorized under D18/CUTOUT_SCOPE.md. F04 has an additive exact-path grant; F03/F05 consume the same real material domains. Q02 still tracks unnamed catalog variants. This is scope authorization, not cutout implementation or worker-start evidence. Source acceptance has not transferred F01 to the host, packaged Apple assets or updated the OS embed. Those delivery gates remain master-owned under F06.

## What is verified in this preparation pass

The original latest source ZIP is Library item `libfile_4ea6ba7599f0819187b238dd9c7e1106`, version 10, modified October 10, 2026. Its SHA256 is `52cd76535230296fc3fe16fee75c952c637bd113a67a422953bb462819eec60d`. All 1,179 source-file hashes and its Git bundle checksum were independently matched. The tree was clean. No new product feature or app acceptance test was run in this pass.

| Identity | Observed value | Meaning |
|---|---|---|
| Original complete checkpoint | `eebd27f8fd3c5b2d4e21c7c6957f9dcd017c0a59` | Source, evidence, control state and original local Git history |
| Runtime source checkpoint | `b64448eac79e3cd0b046f7c5e1a256b3e9c73905` | Latest precision-drawing implementation |
| Dedicated Lovable host | `467221a836c10ac2730bfa2375adde0ec447165c` | Fresh provider metadata, agent finished; existing published project |
| Reviewed OS integration | `a2b31bff3e88ab3a1a86285ab935552796c4d3cd` | Separate OS work; preserve it |
| Historical OS Spatial source snapshot | `fc3a9b212e2a43b8a4fb41dbc6790ad3710279ba` | Older snapshot on `spatial/integration-2026-10-09` |
| OS generated module manifest | `b286cdf49997a5a90af043ba542cd5c1ae41a705` | Older embedded-editor identity, not current standalone parity |
| Companion read-only input | `6d2213b9f58171409332b25cd91bd0541e36c07f` | Verified catalog reference |

Current independent application address recorded in the source is https://spatialauxilium.io, with published host https://spatial-compass-core.lovable.app. The preserved October 10 delivery receipt records successful HTML/route/workspace delivery. This preparation freshly re-read provider metadata/source, not a new full live interaction journey.

## Actual architecture and capabilities

One maintained React/TypeScript workspace in `source:web/` provides browser, hosted and Capacitor authoring. Swift RoomPlan/ARKit capture and file bridges remain native. The older Swift-only editor is preserved compatibility/reference code, not a second feature implementation target. Shared source does not automatically refresh packaged Apple assets or the older OS editor.

The current source has manual connected-room drawing, press-drag/two-tap room sizing, magnetic corner/wall connections, wall strokes, direct plan opening placement/manipulation, group selection/movement, draft recovery, geometric 3D/cutaway/walkthrough, local revision storage and frozen exports. Treat recorded checks as evidence for their specific inputs, not proof of physical device acceptance.

Gaps at the original preparation baseline: no direct 3D opening editing callback; no door subtype/orientation fields; room ceilings are derived display faces, not authored heights; floor/ceiling picking conflates room identity; no fixture or affected-area records; strict old-version admission rejects new fields; F01 has aligned the supported GLB structural materials, while future styled openings need coordinated drawing/scene/export updates. The feature packets identify actual file paths.

## Platform acceptance remains separate

Historical Apple run `37969726280`, integration source `f04253966ac57e4dc8780d16efb5ebc172e183e2`, has two unsigned build successes and 14 synthetic simulator tests. Those are real preserved logs. They do not establish that the newest web assets were installed/tested on an iPhone. Physical LiDAR capture, lock/kill/low-disk/thermal behavior, touch/accessibility, WebKit storage protection, sharing, signing/installation and current performance remain open.

Recorded warm software-WebGL stress p95 is 421ms with 100 rooms, 1,000 walls, 500 openings and zero overlays; cold creation is 1,117.4ms. The warm value is below the declared 500ms warm target. Do not misreport the cold value as a warm failure. The 2,000-overlay workload, device frame pacing and memory acceptance are not established. Use original budgets as targets, not guarantees.

OS project authority/live publication remains separate. The selector and older embed must survive until a reviewed cutover of the maintained source. Moldo and the companion remain independent. No new backend, account permissions, production data, publisher, TestFlight or app release was enabled by this preparation.

## Contradictions explicitly retained

Older `README`, `integration/STANDALONE_DELIVERY`, queue entries and `KNOWN_LIMITS` contain unpublished/domain-pending or no-Apple-compile prose. Newer receipts supersede those statements for the matching target only. `host:SPATIAL_SOURCE_IDENTITY.json` is the original import manifest at `1fede19`, not proof of the last incremental source transfer. Current host commit plus actual readback and precision-drawing receipt govern. Do not erase old failures or edit historical receipts to make statuses agree.

The fresh source snapshot adds this program's control references. Original source bytes/history remain in the paired immutable ZIP. Git transport could read the repository but lacked push authentication; GitHub connector writes are used for a labeled snapshot. Do not claim original Spatial Git history was pushed or that the preservation branch is connected to Lovable sync. It requires explicit source transfer with readback until a verified sync arrangement exists.
