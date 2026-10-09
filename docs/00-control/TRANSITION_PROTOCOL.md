# Transition protocol
At a logical checkpoint, update canonical registers and meaningful evidence; run `npm run os:checkpoint`; commit/push to the working branch when accessible and verify the remote commit. Preserve unresolved work and exact next action. See EXECUTION_PROTOCOL.md for the Git/checkpoint boundary.

Use a fresh chat in the same AuxiliumOS project when the current context becomes long or before the next major build session. Supply the working repository/branch and docs/00-control/BUILD_LAUNCH_PROMPT.txt. Load only AGENTS.md, BUILD_STATE.json, RESUME.md and current task sources. Do not upload an old repository ZIP as if it were current. Do not require the owner to reconfirm already-authorized work after every transition.

Cold resume verifies actual root/origin/branch/HEAD/status and `os:status`. Compare any prior summaries to current files. Reuse evidence only when its fingerprint matches; resume the first incomplete dependency-ready task. Report missing access or owner decisions once with a concrete impact; continue independent work.
