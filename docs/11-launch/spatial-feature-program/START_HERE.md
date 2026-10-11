# Auxilium Spatial: master feature program

Prepared October 11, 2026 for Christian Duarte. This is a source preservation and execution package. The five new features are specified, not implemented by this package.

This conversation is the master coordination thread. Keep the master in Astra as the owner requested. This packet cannot change a chat's model, create future chats, see their hidden reasoning, or keep workers running after a turn. Separate chats coordinate through the committed assignment and returned handoff. No chat may assume it can read another chat.

## Use the package

1. Put this ZIP in the shared project references. Keep the paired original source ZIP available as well. This package includes it under `recovery/` when distributed as the complete recovery ZIP.
2. Use `prompts/00_MASTER.txt` for the master. F00 preparation is accepted; the next task is F01 surface contrast. The current worker assignment is recorded only in `coordination/ACTIVE_TASK.json`.
3. For the next authorized task, give its chat the corresponding `prompts/Fxx_*.txt`, this reference package, and the exact current assignment from `coordination/ACTIVE_TASK.json`. A feature prompt alone does not authorize a second concurrent writer.
4. Run one feature chat at a time. Return its completed `coordination/HANDOFF_TEMPLATE.json` and commit link to the master. The master accepts the result and updates the next assignment. Later chats start from that accepted commit, never the original ZIP.
5. If an Apple device or OS authority gate is unavailable, record that specific open gate. Continue source work under a master-recorded `code_accepted_with_platform_gaps` disposition when appropriate. Do not label the feature delivered everywhere.

## Reading order and aliases

Read `CURRENT_STATE.md`, `MASTER_CONTROL.md`, `SHARED_CONTRACT.md`, then only the assigned feature packet and its listed source files. Read historical evidence only to answer a concrete question or reuse a relevant check. The complete archive is a recovery source, not a command to load every file into context.

| Alias | Location |
|---|---|
| `source:` | `spatial-source/` on the isolated GitHub program branch; `Auxilium_Spatial_Developer_Package/` inside the original source ZIP |
| `program:` | `docs/11-launch/spatial-feature-program/` on that branch; this package root locally |
| `host:` | Dedicated Lovable project `addeb89f-cdf1-4688-9157-b208793ffb8e`; backup scaffold in `host-scaffold/` |
| `companion:` | Read-only project `27ca8fae-ee6e-46c8-b8da-416c01f91629`; selected catalog evidence in `references/companion/` |
| `os:` | Actual latest AuxiliumOS integration branch and host, rechecked at activation; never the old generated editor by default |

## Sequence

| Task | Purpose | Predecessor |
|---|---|---|
| F00 | Reconcile source, approve shared editing/surface contracts and platform delivery mapping | none |
| F01 | Gray wall/floor/ceiling contrast | F00 |
| F02 | Opening dimensions, corner/edge gestures, door flips and catalog | F01 |
| F03 | Room and explicit structure ceiling-height editing | F02 |
| F04 | Dimensioned fixtures, objects and agreed real cutouts | F03 |
| F05 | Surface-attached moisture/fire affected areas | F04 |
| F06 | One combined cross-feature review and remaining platform delivery | F05 |

F00 prevents incompatible models. F01 gives a small visible improvement. Openings establish the 3D manipulation rules before heights and objects reuse them. Damage is last because host geometry, holes and attachment behavior must be stable first. F06 reuses accepted checks and focuses on interactions, not a repeat of every feature suite.

GitHub parent issue: https://github.com/AuxiliumEnvironmental/auxiliumos/issues/88
Branch: `spatial/feature-program-2026-10-11`. It is an isolated preservation/development branch, not an OS release. Final recorded commit and child issues are in `GITHUB_RECEIPT.json`.
