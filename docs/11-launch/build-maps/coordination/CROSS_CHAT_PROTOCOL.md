# Coordinating separate build chats

## What each chat owns

One integration lead owns the current source, task graph, shared contract acceptance, migration order, shared-file allocation and final integration. Map chats own their assigned outcomes and return reviewed source changes. They do not each create a separate app, fork a shared editor, redefine the same schema or independently deploy the same Lovable project.

Use a maximum of three active specialists by default, consistent with the current repository instructions and any lower platform limit. Eight maps do not require eight concurrent writers. More parallel work is useful only when the bottlenecks and file allocations are genuinely independent.

## Durable coordination

Use the actual repository's queue and source as the shared record. A chat's presence in the same project is not evidence that it can read another chat's unsaved work. Before relying on coordination, verify that each writer can read the assigned branch/commit and that the integrator can retrieve its returned patch. Separate runtime workspaces may have different local files. The same workspace may expose all agents' files. Neither arrangement should be assumed.

Preferred handoff: an isolated worktree/feature branch and a reviewable commit/PR in the existing repository. If remote write access is unavailable, return an exact patch and any required new-file bytes, base commit, hash inventory and verification evidence. The integrator checks it against the current head before applying. A narrative summary alone is not a source transfer.

No extra chat service, event bus, task database or orchestration product is needed for this workflow. Use direct agent messaging where actually available and authorized, but persist the consequential result in the source/queue. Ordinary user chats do not gain direct messaging capability merely because a prompt tells them to communicate.

## Before a worker starts

The lead uses the existing task-packet contract and records:

1. Existing queue task/parent, one useful outcome and exact acceptance IDs from this package's coverage map.
2. Current input commit/tree, relevant provider/tool revisions and the first incomplete action.
3. Owner, reviewer, branch/worktree, exact allowed files, reserved shared files and overlapping active tasks.
4. Required interface IDs with accepted source revision and dependency state. No “latest” or unspecified shared schema.
5. Actor/context/state/revision/authority rules and what the UI action actually changes.
6. Applicable decision defaults and live activation gates, smallest meaningful verification and explicit unavailable evidence.
7. Stop conditions, source recovery and return format.

The package's map and slice IDs are references to help dispatch. They are not replacements for existing live queue IDs. Avoid indefinite whole-directory allocations. For a new file, reserve its exact proposed path before creation. For a small copy/layout edit, keep the packet proportional; do not fabricate database work to fill a template.

## File and deployment ownership

| Concern | Default custodian | How another map changes it |
| --- | --- | --- |
| Auth/session/runtime access, generic policy and audit infrastructure | MAP-01 | Contract proposal plus one explicitly assigned writer; MAP-01 security review |
| Router, shell, Home, shared styles/tokens/context/form patterns | MAP-02 | A bounded patch against the accepted UI contract; one shared-file writer |
| Account/facility/enterprise records and directory API | MAP-05 | Preserve directory contract; coordinate consuming context picker changes |
| Intake/scope/sampling/project behavior and allocated feature UI | MAP-03 | Consumers use named interfaces; approved amendments through owning domain |
| Commercial/vendor/finance behavior and allocated feature UI | MAP-04 | Effective authority/ledger contract reviewed before dependent implementation |
| Content ingest/private-object clearance/versions/review/release, communications and AI behavior | MAP-06 | MAP-01 security/audit review; consumer cannot bypass content lifecycle |
| External adapters, Spatial source/package handoff, Moldo boundary | MAP-07 | Actual tool source owner and OS lead coordinate exact inputs/outputs; no generated fork |
| Verification runner, shared profiles, CI and release rules | MAP-08 with lead integration | Affected evidence floor and negative checks reviewed; no silent weakened gate |
| Migration identifiers/order, shared schema application, root registers, lockfiles and provider writes | Integration lead | Lead may delegate an exact operation, but retains one coordinator and readback |

Custody is not a permanent ban on a different competent worker editing a file. For one atomic fix, the lead can allocate all required files to one writer and obtain the relevant custodians' review. This prevents a simple shared-state repair from becoming a chain of disconnected half-fixes. No two active tasks may independently write the same shared file.

Only one writer targets a Lovable project at a time. Development database mutations and shared fixture setup/cleanup are serialized. A domain worker may author a proposed additive migration in its branch; the lead reserves its identifier, reviews dependencies and applies it once. Never rewrite an already applied migration, force a divergent branch or overwrite an unexplained provider change.

## Changing a shared interface

The producer identifies the affected interface ID, base revision, proposed change, compatibility impact and consumers. Supply concrete request/result/state/error examples and tests. A consumer reviews whether its current implementation can use it. The lead records the accepted contract in the existing domain/API documentation and queue packet, then allocates the code change.

If a change is incompatible, choose a deliberate migration/compatibility sequence. Preserve old effective business records and current released content. A local frontend workaround cannot silently change meaning, and an adapter cannot write around owning-domain validation. Do not freeze every future interface before building; pin only what the next connected slice needs.

## Return and merge

A worker returns the outcome, input/output source identifiers, actual file list/diff, interface changes, executed commands and results, reused evidence with rationale, unknowns, review findings and first incomplete action. The return must distinguish local, remote-saved, hosted and published state.

The lead checks the actual diff and source head, resolves shared changes, runs invalidated affected checks and the required integration gate, then records the result in the existing live masters. A green simulated test is not inherited hosted acceptance. A later change to a dependency invalidates only the relevant evidence, not every unrelated completed module.

If the head moved during work, compare the changed contract/files before merging. Do not blindly select “ours” or “theirs.” Preserve exact unsaved patch bytes before switching or cleaning. Verify remote readback after saving; verify deployed source separately after an actual deployment.

## Recovering stalled work

Save actual task/message/session IDs when dispatching an external operation. After a timeout, inspect its source/deployment readback before retrying. A spinner is not evidence of productive execution; a missing summary is not evidence that the operation failed.

Preserve the first failure, run one bounded diagnostic, then change approach if the same result repeats without new information. Do not create a competing writer to bypass an unresolved operation or protected approval. Retire abandoned allocations after checking the original writer is no longer active. Continue independent authorized tasks and state the exact blocked action.

At handoff or context limit, save a coherent checkpoint and exact next step. Do not promise unattended work after the session ends unless an actual running/scheduled operation is observed. A fresh chat resumes the recorded incomplete action instead of reconstructing decisions from scattered messages.

## Decision boundaries

Routine implementation remains authorized under the existing mandate. Use consistent configurable synthetic defaults. The owner need not reapprove the entire plan at every task. Actual live commercial/professional/data-sharing/outbound activation waits only for its existing decision gate. New business roles, policies, pricing, scientific thresholds, paid products or additional product capabilities are not engineering conveniences.
