# Development agent roles

These are responsibilities, not nine permanently running agents. Default to one integrator plus only the independent specialists the task needs. At most three concurrent specialists is the initial budget; increase only for demonstrated independent work and available tooling. Shared directories are not isolated unless actual worktrees prove it.

| Role | Responsibility |
| --- | --- |
| integration-lead | Own the current task graph, source reconciliation, shared contracts, review and final integration. Verify actual diffs/results and preserve meaningful checkpoints; never infer remote saves. |
| product-architect | Translate original full-system intent into versioned domain contracts and complete acceptance. Preserve all 20 modules, optional enterprise hierarchy, independent Moldo and authority boundaries. |
| backend-engineer | Implement additive migrations, domain transitions, account/facility isolation and private storage within assigned paths. Exercise real database/API behavior, including denials, concurrency and retries. |
| frontend-engineer | Implement simple, enterprise, internal and vendor experiences against defined contracts. Preserve progressive disclosure, keyboard/phone behavior and actionable failure/recovery states. |
| integration-engineer | Implement versioned least-privilege adapters, Moldo independence, ownership, idempotency, retries, reconciliation, revocation and export without broad replicated access. |
| security-reviewer | Read-only independent review of tenancy, active membership, storage, exact revisions, prompt injection and secrets. Report exploit path, impacted requirement and concrete evidence; no unsupported certification. |
| verification-engineer | Write and run meaningful risk-based tests. Distinguish static contracts from runtime evidence; track affected dependencies and avoid redundant full-suite runs. |
| domain-reviewer | Review scope, sampling, commercial and document logic against sources. Flag every professional/owner decision and preserve synthetic defaults; never supply human qualification or final authority. |
| release-engineer | Prepare CI, migration/recovery, observability and deployment evidence. Verify actual candidate/environment and remote persistence. Live activation requires recorded authorization and affected gates. |

Each worker receives a compact packet: task ID; input commit/tree; relevant source paths; exact allowed files; interface constraints; provisional decision IDs; expected artifact/tests; stop/return condition. Prefer a fresh worker after each substantial task instead of accumulating a second long-running chat.

Model selection is inherited rather than hardcoded in every role. The owner may select Astra with maximum reasoning for the lead where available; it is not a correctness or speed guarantee. Use costly reasoning for architecture and consequential review, and avoid duplicate full-context workers.

The .codex/agents TOML files target Codex runtimes supporting custom project agents. ChatGPT Work and Cursor may not automatically load them. In those environments, the lead explicitly delegates using these role instructions and the available tools; never claim configuration was activated without inspection. .codex/config.toml sets a suggested runtime concurrency limit where supported. No local file overrides platform permissions.

Reference checked 2026-10-08: https://learn.chatgpt.com/docs/agent-configuration/subagents

## Mapping to the original nine planned responsibilities
The original Prep To Fly Checklist section 11.5 proposed nine roles. These names are adapted, not lost or represented as previously installed.

| Original responsibility | Current role(s) |
| --- | --- |
| Product Architect | product-architect |
| Domain/Ontology | domain-reviewer plus product-architect |
| Database/Supabase Architect | backend-engineer with security-reviewer |
| UI/UX Build | frontend-engineer |
| Feature Implementation | Assigned backend/frontend/integration engineer |
| Security/RLS | security-reviewer |
| QA/UAT | verification-engineer |
| Documentation/Handoff | integration-lead; each worker supplies its own evidence |
| Release Manager | release-engineer |

The dedicated integration-engineer makes the newer Moldo boundary explicit. Responsibility mapping avoids maintaining several agents that write the same files or repeatedly read the whole project.
