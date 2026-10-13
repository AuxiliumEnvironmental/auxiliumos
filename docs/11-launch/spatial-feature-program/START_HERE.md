## Current master checkpoint: October 13, 2026

F01-F05 are integrated and functionally verified in the maintained shared source. F03's nine recovered files were hash-matched; missing adapters were newly implemented, tested and published at `bb150674b49ab529ca62089ab2ff2722f2e3d65c`. The missing historical 27-file patch is no longer a blocker. F04 includes 20 fixture entries and optional wall/floor/ceiling cutouts and penetrations. F05 preserves affected-area observations across the combined structural edits.

The combined desktop/mobile editing journey, five cross-feature core checks, two migration/isolation checks and production build pass. Large-model performance remains open: the actual 2,000-observation run exceeded the 500 ms warm target and ended at its 300-second limit before selection/memory measurements. Platform delivery and physical-device gates remain separate.

First incomplete action: F06: resolve the measured 2000-observation latency gap, then deliver the verified combined source to the dedicated host, Apple snapshot and isolated OS generated module; retain physical-device and live project-authority gates.

Current evidence: `docs/11-launch/spatial-feature-program/coordination/INTEGRATION_REVIEW_2026_10_13.json`. Earlier sections below preserve historical scope and are superseded by this checkpoint.

# Auxilium Spatial: master feature program

## Current handoff checkpoint: October 12, 2026

F02 is integrated and code accepted with platform gaps. F04 and F05 are reviewed and pushed candidates awaiting ordered integration. F03's source patch is missing; its two received JSON files are receipts only. Receive F03_LOCAL_CANDIDATE.patch (or its handoff ZIP), verify its recorded hash, apply to the real F03 branch, complete its build/browser and restore-receipt gaps, then compose F03, F04 and F05 into accepted F02. F06 combined/platform checks follow.

Current evidence: `coordination/INTEGRATION_REVIEW_2026_10_12.json`. Do not restart completed feature chats or re-run matching verification. The workflow below remains the coordination protocol; no workers are currently running.

Prepared October 11, 2026 for Christian Duarte. This is a source preservation and execution package. The original package specified five features. Current branch progress is recorded below and in CURRENT_STATE.md; the immutable ZIP remains a recovery reference.

This conversation is the master coordination thread. Keep the master in Astra as the owner requested. This packet cannot change a chat's model, create future chats, see their hidden reasoning, or keep workers running after a turn. Separate chats coordinate through the committed assignment and returned handoff. No chat may assume it can read another chat.

## Feature chat and handoff workflow

F01 source is accepted. The owner now authorizes F02, F03, F04 and F05 to develop concurrently, each on its own named branch. Use the four prompts in `prompts/` and the live `coordination/ACTIVE_TASKS.json` on the program branch. No ZIP is required for a chat with current GitHub access. The ZIP remains an immutable recovery reference.

1. Master prepares exact branch leases and fixed shared contracts, then creates each branch at the activation commit.
2. Start one separate chat per feature using its prompt. Every chat reads the live ledger from the program branch and writes only its assigned feature branch.
3. Return each handoff to this master when ready. Chats do not share hidden state or automatically notify one another.
4. Master integrates in order F02, F03, F04, F05, then handles F06 combined acceptance and platform delivery. Development does not wait for earlier feature implementation; dependency-sensitive integration does.
5. Missing physical-device or authority gates remain explicit. Branch completion, integrated source acceptance and delivered platforms are distinct.

`ACTIVE_TASK.json` is retired and nonauthorizing. `PARALLEL_DEVELOPMENT.md` defines the current workflow. F04 optional wall/floor/ceiling cutouts and service penetrations are now authorized by D18/CUTOUT_SCOPE.md. Existing feature chats refresh the live ledger before their next edit/push; this update does not start or duplicate workers.

## Reading order and aliases

Read `CURRENT_STATE.md`, `MASTER_CONTROL.md`, `SHARED_CONTRACT.md`, then only the assigned feature packet and its listed source files. Read historical evidence only to answer a concrete question or reuse a relevant check. The complete archive is a recovery source, not a command to load every file into context.

| Alias | Location |
|---|---|
| `source:` | `spatial-source/` on the isolated GitHub program branch; `Auxilium_Spatial_Developer_Package/` inside the original source ZIP |
| `program:` | `docs/11-launch/spatial-feature-program/` on that branch; this package root locally |
| `host:` | Dedicated Lovable project `addeb89f-cdf1-4688-9157-b208793ffb8e`; backup scaffold in `host-scaffold/` |
| `companion:` | Read-only project `27ca8fae-ee6e-46c8-b8da-416c01f91629`; selected catalog evidence in `references/companion/` |
| `os:` | Actual latest AuxiliumOS integration branch and host, rechecked at activation; never the old generated editor by default |

## Integration sequence

| Task | Purpose | Predecessor |
|---|---|---|
| F00 | Reconcile source, approve shared editing/surface contracts and platform delivery mapping | none |
| F01 | Gray wall/floor/ceiling contrast | F00 |
| F02 | Opening dimensions, corner/edge gestures, door flips and catalog | F01 |
| F03 | Room and explicit structure ceiling-height editing | F02 |
| F04 | Dimensioned fixtures, objects and agreed real cutouts | F03 |
| F05 | Surface-attached moisture/fire affected areas | F04 |
| F06 | One combined cross-feature review and remaining platform delivery | F05 |

F00/F01/F02 source is accepted. The four feature implementations overlap on isolated branches, using the frozen contract. This table defines integration order only. F06 reuses accepted checks and focuses on combined interactions and delivery.

GitHub parent issue: https://github.com/AuxiliumEnvironmental/auxiliumos/issues/88
Branch: `spatial/feature-program-2026-10-11`. It is an isolated preservation/development branch, not an OS release. Final recorded commit and child issues are in `GITHUB_RECEIPT.json`.
