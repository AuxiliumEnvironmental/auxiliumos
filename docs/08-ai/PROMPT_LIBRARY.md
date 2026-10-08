# Prompt library
Use docs/00-control/BUILD_LAUNCH_PROMPT.txt for a fresh build chat. Use AGENTS.md and the selected task as authority. Do not repeat the old multi-step manual GitHub Desktop ritual for every small edit when tools can perform the authorized workflow directly.

Worker packet:
- Task and acceptance IDs; why this change is needed.
- Pinned commit/tree and relevant source files.
- Allowed file paths and shared contracts that must not be changed.
- Dependencies and explicit proposed decision defaults.
- Expected implementation, meaningful tests, evidence and stop/return condition.

Worker return: changed files/diff, exact checks/results, known risks, provisional decisions and first unfinished action. The lead validates the patch and current evidence; a confident summary alone is insufficient.
