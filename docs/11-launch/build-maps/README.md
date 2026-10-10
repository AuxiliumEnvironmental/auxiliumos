# Coordinated build maps in the live repository

These maps were adopted from the October 9 frozen package after S00 source readback. Read this file before START_HERE.md: paths in the original package retain their original reference syntax.

- `repo:path` now reads the repository root path. The frozen reference commit is `148d74d9720f0799e5d845bb789cd3fc3f43feb8`; always reconcile later live source.
- `baseline:path` means `reference/path` inside the exact original attached archive, not this repository. Its identity is in ADOPTED_REFERENCE.json. A worker needing an unadopted baseline file must receive those exact bytes. Do not assume another chat can see attachments.
- `spatial:path` means the frozen Spatial snapshot in that archive. The active standalone Spatial lead owns newer source and its source transfer. This package does not authorize replacing it.

The eight maps, twenty logical interfaces, acceptance ownership and slice proposals are retained unchanged. They are reference documentation. BUILD_QUEUE.json, BUILD_STATE.json, REQUIREMENTS.json, OWNER_DECISIONS.json and VERIFICATION_PROFILES.json remain the only live masters. No new application tree, service, role or scheduler was imported.

Exact assigned source, accepted interface inputs and return paths belong in docs/00-control/task-packets/. The live S00 observation is docs/00-control/evidence/integration-reconciliation-2026-10-10.json. One integration lead owns shared controls and provider writes. Other ordinary chats must return reviewable repository commits or patches; this project does not provide automatic shared memory or filesystem access.

S01 is currently dispatched as CTRL-003-ACTIVATION and S02 as UI-2026-10-10-CONTEXT in the existing queue. This sentence is a historical dispatch pointer, not a second task status.
