# MAP-08 · Verification, release and operations

**Purpose:** make the OS usable sooner through small accepted workflows, reliable evidence reuse, early risk review, controlled integration and recoverable operation. This map begins with the first task. It is not a cleanup phase after seven isolated builds finish.

**Primary scope:** C04 Resilience and data lifecycle and GOV-001 Durable and verifiable continuation; cross-map assurance of all product acceptance. Domain owners remain accountable for their own behavior and tests. MAP-08 owns shared evidence rules, integration/release coordination and operational proof, not every worker's test code.

**Baseline:** canonical `148d74d9720f0799e5d845bb789cd3fc3f43feb8` and the October 9 reconciliation package. `repo:` means `reference/sources/canonical/`; `baseline:` means `reference/`. These proposed packets are adopted through existing control registers. Exact source acceptance criteria remain in the coverage register and `repo:REQUIREMENTS.json`.

## 1. Work backward from accepted operation

The finished OS must complete the intended user journeys on the deployed candidate, deny inappropriate access, preserve professional/commercial authority, recover work after failures and provide an accountable operating record. A green unit suite, a published frontend, a successful migration or a collection of 20 screens is narrower evidence.

| End result | Required assurance capability | Durable artifact | Named proof |
| --- | --- | --- | --- |
| A real person can complete work | Connected backend-through-UI journeys | Requirement-to-source-to-evidence links | Actual authenticated allowed/denied journey on a named candidate |
| No agent can silently erase another's work | Source reconciliation, allocated files and one integration lead | Pinned task packet, branch/PR, reviewed merge and remote readback | Both valid source lines survive integration; changed files match allocation |
| Work does not repeatedly restart | Evidence reuse and exact continuation | Existing state/queue/requirements/checkpoint registers | Fresh chat identifies first unfinished action without rebuilding accepted code |
| Errors have bounded consequences | Failure handling, monitoring and recovery | Operational owner/runbook and incident observations | Failed migration, provider interruption and restore are exercised |
| Release means a specific accepted capability | Candidate/configuration/approval binding | Release record and applicable OD evidence | A publication-only record cannot authorize real-data business activation |

## 2. Baseline facts and control gaps

The frozen audit recovered 14 applied migration entries, three active JWT-verified edge functions, successful CI run 67 (`37988716325`) on the canonical head, and current Lovable source with document-release UI drift plus newer Spatial work. CI's actual hosted API and connected-browser jobs were skipped. These observations establish their named scope only and must be refreshed before a new deployment.

The current private bucket was restricted to synthetic `text/plain`, 65,536 bytes; relevant document lifecycle tables and objects were empty at observation. That is not a demonstrated complete hosted file lifecycle. Earlier owner login/account/facility/intake evidence exists, but this package audit did not repeat those personal owner journeys.

| Confirmed control issue | Specific repair | What establishes completion |
| --- | --- | --- |
| `BUILD_STATE`, `RESUME`, checkpoint/CI notes and schema registry lag source/provider facts | Reconcile existing registers; leave historical observations dated | Same candidate/target facts agree and first unfinished action is actually incomplete |
| `releaseReadiness()` only checks a nonempty `production_authorization.evidence` string | Bind named activation, environment/candidate and relevant approved policy evidence through the existing gate | Publication-only evidence fails real-business activation; correctly scoped evidence passes only its scope |
| Document review/release browser-fixture profiles omit `AUXILIUMOS_BROWSER_EXECUTABLE` | Include relevant environment input and record actual browser identity | Changing that input invalidates applicable evidence; browser identity is visible in the receipt |
| `DOC-001D-CONTENT` demands API evidence but registers only narrower profiles | Add genuine API coverage or explicitly split the completed layer and still-open parent acceptance | No `unit`/`database` receipt masquerades as `api` |
| Fresh-runtime stale receipts can make an implemented UI task appear next again | Reconcile known external CI/source evidence with computed status and recorded unfinished action | New chat resumes missing work and does not rebuild completed UI solely because local environment changed |
| UI fixture pass does not establish coherent or connected user experience | Add named journey/state review to actual affected acceptance | Current mobile/desktop flow, state preservation and durable save behavior are observed |

These gaps do not mean the release gate currently approves the OS. Other acceptance and decision gates remain unmet. Source: `baseline:04-assurance/VERIFICATION_AND_RELEASE_CONTRACT.md` and `repo:scripts/os-control.mjs`.

## 3. Controls, ownership and IF-19

Keep one source of truth for each concern:

- `BUILD_STATE.json`: observed facts and concrete access gaps.
- `BUILD_QUEUE.json`: live tasks, dependencies, allocated paths and next actions.
- `REQUIREMENTS.json`: full destination and acceptance/evidence floors.
- `OWNER_DECISIONS.json` with `config/policy-defaults.json`: development defaults and live activation boundaries.
- `VERIFICATION_PROFILES.json` and current evidence receipts: executable verification definitions and observations.
- `docs/00-control/SESSION_CHECKPOINT.json` and generated `RESUME.md`: resumable observations, not a second backlog.

This map and the package maps are implementation references. Do not add a competing “done” ledger. The root integration protocol owns task arbitration. One person or agent assigns shared schema/migration order, root registers and lockfiles. One designated fixture owner creates/changes shared hosted synthetic fixtures; one designated deployer performs provider writes. Others can review and run isolated checks without racing shared external state.

**IF-19 receipt/handoff target:** task/requirement IDs, source input and output refs, allocated and actual changed paths, interface versions, commands/profile IDs, environment and target identity, fixture identity, timestamps, outcomes and logs, unchanged evidence reused with reason, blockers and first incomplete action. Do not copy secrets, owner credentials, tokens, password links or raw sensitive data into it.

Separate chats do not inherently communicate or share local worktrees. They exchange actual repository PRs/contracts/checkpoints, or explicit versioned patch packages. A message that a change was “saved” is insufficient; read back the intended branch/ref. No chat promises to keep working after its execution session ends.

## 4. Cold start and source reconciliation

1. Read current `AGENTS.md`, state, queue, requirements, selected map and relevant contracts. Inspect current branch, HEAD, working tree, untracked files and remote branches before editing.
2. Run `npm run os:check` and `npm run os:status` after the documented environment is available. Preserve discrepancies; do not reset files or import the old archive to make status look tidy.
3. Compare repository, Lovable and Spatial identities. At the baseline, canonical document-release UI and newer Spatial integration must both survive the deliberate merge. Never copy one entire `web/` tree over the other.
4. Resolve the first incomplete action from source, queue and scoped evidence. A stale local receipt means the current execution context lacks current evidence; it does not prove the implementation vanished.
5. Assign one bounded slice, exact inputs/interfaces, owned paths and checks. A whole map is a workstream, not one unreviewable task.
6. Record blocked external steps narrowly and choose independent ready work. No missing credential, device or connector should be generalized into “the entire OS is blocked.”

Do not rerun the October 8 importer onto the modern working repository. Use the package's adoption map and current reviewed changes. Original archives remain recovery context.

## 5. Efficient verification matrix

| Risk changed | Smallest useful development evidence | Required operational claim boundary |
| --- | --- | --- |
| Copy or isolated layout | Inspect diff and affected rendered states; build when applicable | Current representative visual/accessibility review; no mirror-image unit tests just to count tests |
| Form, context or session state | Real component/browser valid, invalid, error, navigation and resume behavior | Actual backend save/reopen plus revoked/changed-user isolation before operational acceptance |
| Domain transition or approval | Allowed/forbidden/stale transitions, transaction rollback and retry behavior | Authentic API and concurrent sessions when concurrency is claimed |
| Tenancy or capabilities | Direct database/API permitted and denied identities; joins/counts/exports/object paths | Revoked identity with existing session and other roles cannot access new data |
| Documents | Exact bytes/version/reviewer/audience, replacement draft, withdrawal/restriction/hold | Actual permitted upload-to-recipient retrieval and denied recipient paths |
| Signature, scope, spending or finance | Exact-revision authority and effective amendment; duplicate/stale submission | Human authority and applicable live decisions, not a test or AI-generated approval |
| Integration | Contract compatibility, duplicate/out-of-order delivery, partial failure and retry | Real scoped peer test, revocation and independent operation during outage |
| Runtime AI | Scoped permitted sources, source freshness/citations, malicious input as data, draft adoption boundary | Applicable runtime activation approval and representative evaluation with protected data rules |
| Migration or recovery | Additive migration, invariant checks and explicit forward recovery | Named target and isolated restore evidence matched to approved recovery targets |

Existing profile levels are meaningful distinctions: `static_sql_contract`, `control_unit`, `unit`, `database`, `browser_fixture`, `api`, `browser`, `build` and `source_inspection`. PGlite with simulated claims is useful database evidence, not genuine Supabase Auth or hosted API proof. Intercepted HTTP browser fixtures are not actual provider journeys. Respect each requirement's registered evidence floor.

### Commands already present

```sh
npm run os:check
npm run os:status
npm run os:verify -- PROFILE
node scripts/os-control.mjs allocation TASK changed-paths.txt
npm run os:checkpoint -- --verify-remote
npm run os:release-check
```

Replace `PROFILE` and `TASK` with actual registered IDs. Generate `changed-paths.txt` from tracked diff and untracked inventory. `allocation` is a review aid, not filesystem isolation. `os:checkpoint -- --verify-remote` reads the remote; it never pushes. After a checkpoint commit is pushed, verify that new commit remotely without endlessly rewriting a checkpoint to contain its own hash.

## 6. Evidence reuse and bounded failure handling

The existing control script fingerprints covered files, command arguments, profile, lockfiles, Node/platform/architecture, declared environment variables and log checksum; changes during execution are rejected. Reuse a matching pass. Include imported helpers, shared styles/router/auth logic, fixtures, migrations and configuration that actually affect the claim in the profile inputs. A new chat does not itself justify rerunning everything.

The fingerprint is not complete cloud attestation. Record relevant target PostgreSQL/browser versions, deployed artifact/function/migration identity and fixture state. An executable at the same browser path can change contents. A recent noncacheable receipt still needs target preflight. Do not copy a local pass into another environment and call it current.

Failure handling:

1. Capture the first failure, exact command, source and safe log.
2. Classify the cause: product defect, invalid test assumption, missing runtime/credential, mutable provider state or source conflict.
3. Make one evidence-supported correction or diagnostic change, then run the smallest relevant check.
4. If the same failure recurs without new evidence, stop that retry loop and change approach. Do not repeatedly rebuild browsers, rerun unchanged suites or remove denial assertions to get green.
5. Keep the specific blocked acceptance visible. Continue independent ready slices and return to the blocked step when its missing prerequisite is actually resolved.

Full candidate checks run at the candidate integration gate. Shared auth/router/CSS changes justify representative dependent journeys; they do not justify each specialist independently running the full suite. Keep required existing CI checks until a reviewed conservative affected-profile selector exists. Batching coherent reviewed changes is preferable to silently weakening checks.

## 7. Protected credentials and hosted fixtures

The existing authentic acceptance path uses protected configuration, including GitHub Actions secret `AUXILIUMOS_TEST_SERVICE_ROLE_KEY` for the fixed development target. Its current availability must be checked safely; the earlier missing-secret observation is not a forever-current fact. Never ask for its value in chat, copy it into artifacts or replace it with a browser service key.

Before authentic tests, the designated operator verifies target project, migration/function/configuration identities, active gates and fixture ownership. The presence of a service key does not authorize real client data, owner impersonation or broader destructive cleanup. Use synthetic identities and uniquely identified fixtures. Preserve the real owner's dedicated rows.

The audit migration intentionally preserves history and can prevent hard deletion of accounts/profiles with audit references. The older directory API cleanup assumptions are incompatible unless the harness is reconciled. Use an isolated disposable environment where appropriate, or retain explicitly synthetic business/audit history while revoking access and removing only permitted disposable Auth identities. Do not delete audit rows, disable triggers or suppress cleanup errors to manufacture a passing test.

For a missing credential or unavailable connector, record exact profile, prerequisite, secure resolution route and independent work that can continue. Do not use a skipped privileged CI job as evidence for the hosted acceptance it did not execute. Do not switch providers or deployments to evade an access restriction.

## 8. Continuous integration between maps

Assurance participates when a slice contract is selected, when a sensitive interface is reviewed and when the integrated candidate is accepted. The domain team supplies its focused checks; MAP-08 checks adequacy, dependencies and evidence scope.

| Cross-map seam | Required joint check before propagating the pattern |
| --- | --- |
| MAP-01 + MAP-02 session/context | Same-user resume preserves useful input; identity/account change and revocation cannot leak prior context |
| MAP-03 + MAP-04 request/scope/authority | Submitted request does not authorize mobilization; exact approved scope and effective commercial authority govern work |
| MAP-03 + MAP-06 field/document lifecycle | Recorded evidence and version links survive review; released bytes correspond to the approved revision |
| MAP-04 + MAP-05 program coverage | Optional program/portfolio structure does not block simple work; effective coverage does not arise from a label |
| MAP-05 + MAP-06 client reporting | Reports and dashboards derive from authorized current records and released projections, with truthful freshness |
| MAP-06 + MAP-07 notifications/integrations | Outbound effects reflect correct audience and current revision; duplicates/retries cannot repeat consequential actions |
| MAP-07 + MAP-01 Spatial/Moldo | External identity is not OS access; personal Spatial drafts are not project/client release; outage does not break independent operation |

One representative complete journey should establish shared UI/API patterns before they are propagated broadly. Bounded narrower increments may be accepted internally while the parent cross-map journey remains open. Never claim an entire map is accepted solely because its own fixtures pass.

## 9. Operations and recovery

Recovery inventory covers Git source/configuration/migrations/lockfiles, work/control history, consistent database backups, private object versions and checksums, and provider configuration/credential-vault references. Git and downloadable packages are not database/file backups.

The target backup system needs an owner-controlled separately protected destination, restricted access, encrypted sensitive backups, monitored age/completeness/failures and a documented restore operator. OD-015 contains pending recovery-point/recovery-time/performance targets; no number in this map is a new approved SLA. OD-011 controls retention. No PHI or real client content enters development agents during a drill.

Restore sequence:

1. Preserve incident evidence and choose a consistent database/object point.
2. Restore into an isolated environment with outbound notifications, signing, payments and integrations disabled.
3. Match application/migration/configuration versions; verify record references, object inventory and representative checksums.
4. Reapply current revocations/restrictions using separately retained security evidence. A restored old membership cannot restore removed-user access.
5. Reconcile exact signed authorizations, released versions and external delivery offsets/results. Do not blindly replay side effects.
6. Run focused permission, lifecycle and integrity checks; record measured restoration and known gaps before an authorized cutover.

Demonstrate missing-object handling, corrupt-backup rejection, failed-migration recovery and denied revoked-user access. Use reviewed forward fixes rather than assuming a destructive down migration is safe. Record monitoring for operational errors, uptime, audit failures and administrative alerts with a named support owner before real client use. Dependency/secret scans, privileged-admin MFA evidence and independent outside security/code review remain candidate requirements from the original plan.

## 10. Release and activation bindings

Maintain separate observations for source saved remotely, deployed artifact, verified workflow and approved capability activation. Existing permission to publish the frontend persists within its scope. Do not repeatedly request it. It does not approve every later real-data operation, scientific approval, signature, spending action, integration or runtime-AI processing.

The release record identifies exact source/artifact, environment, migrations/functions/configuration, capabilities being enabled, applicable policy/decision versions, acceptance evidence, unresolved-risk disposition, support/recovery owners and rollback/forward-fix path. MAP-01/04/06/07 supply the action-specific authority. The existing OD action mapping stays authoritative; no approval is inferred from a nonempty note or passing CI.

Full launch requires all in-scope requirements and applicable decisions; a narrower development/demo milestone must be labeled by its actual scope. Read back deployment identity and execute focused permitted/denied operational checks after promotion. A published flag is not public bundle parity. A newly visible button is not a functioning business workflow.

## 11. Bounded implementation slices

These proposed packets are integrated into the existing queue. They can run alongside domain work with assigned files.

| Slice | Deliverable | Can begin when | Acceptance dependency |
| --- | --- | --- | --- |
| MAP-08-S01 | Reconcile source/provider/control facts and establish interface/task allocation | Current repository and package are available | Actual pins, drift and first unfinished action recorded without overwriting newer work |
| MAP-08-S02 | Repair scoped production gate, browser environment inputs and content API evidence binding | Exact current code/profile review is complete | Focused control tests demonstrate rejected false claims and valid scoped evidence |
| MAP-08-S03 | Early review of first cross-map vertical slice and shared fixture plan | IF-01/02/18 and the selected domain interface are defined | Required risk tests are agreed before broad UI/domain propagation |
| MAP-08-S04 | Authentic hosted acceptance for the ready identity/document slice | Protected configuration, reconciled cleanup and synthetic fixtures are available | Real allowed/denied API and connected browser evidence; no skipped-job substitution |
| MAP-08-S05 | Integration acceptance across request, scope, authority, work, release and reporting | Each participating bounded domain slice has reviewed source/contracts | End-to-end persistence, revision, human authority and failure recovery confirmed |
| MAP-08-S06 | Recovery/monitoring/performance implementation and isolated drill | IF-20 inventory, target data model and applicable approved targets exist | Measured restore, failed-migration response, security reapplication and named support owner |
| MAP-08-S07 | Final candidate reconciliation, outside review and scoped release record | All required module/cross-map evidence and relevant decisions are present | Exact candidate and deployment readback, required review disposition and operational checks |

MAP-08-S04 may be blocked while MAP-08-S02 or domain implementation proceeds. MAP-08-S06 planning can begin before all domains finish, but its final drill must use the actual candidate's records and object behavior. This avoids both premature certification and a late surprise recovery project.

## 12. Handoff and exit evidence

Every handoff states what changed, why, exact source/remote status, required profiles run/reused/skipped/blocked, affected environment, known limits and next incomplete action. “Implemented,” “locally verified,” “hosted verified,” “saved remotely,” “deployed” and “accepted for this release” remain distinct claims; keep the existing queue state vocabulary.

A successful map document or package verification proves reference integrity, not product acceptance. The OS becomes accepted when the actual named outcomes meet the source criteria with current evidence and applicable activation authority. No estimate or absolute defect-free promise substitutes for that proof.

## Source anchors

- `repo:AGENTS.md`, `repo:docs/00-control/EXECUTION_PROTOCOL.md`, `repo:docs/08-ai/FULL_STACK_BUILD_PROTOCOL.md`: task allocation, integration, continuation and sensitive review.
- `repo:scripts/os-control.mjs`, `repo:VERIFICATION_PROFILES.json`, `repo:BUILD_QUEUE.json`: actual control behavior and evidence registration.
- `repo:docs/07-testing/ACCEPTANCE_TEST_MATRIX.md`, `repo:REQUIREMENTS.json`: risk strategy and required acceptance.
- `repo:docs/03-data/ACCESS_AUDIT_IMPLEMENTATION.md`: fixture cleanup and audit/rollback limits.
- `repo:docs/03-data/OWNER_ONBOARDING.md`, `repo:.github/workflows/ci.yml`: protected owner/test workflows and fixed target boundaries.
- `repo:docs/09-release/RELEASE_CHECKLIST.md`, `repo:docs/09-release/BACKUP_RECOVERY_PLAN.md`: release, review, support and recovery requirements.
- `baseline:00-reconciliation/RECONCILED_STATUS.md`, `baseline:04-assurance/VERIFICATION_AND_RELEASE_CONTRACT.md`, `baseline:04-assurance/DEFECT_PREVENTION_MATRIX.md`: reconciled observations and supported corrections.

## Canonical acceptance accountability

The following exact criteria belong to this map. Axx is a reference alias for the ordered criterion in the pinned `repo:REQUIREMENTS.json`, not a new live requirement ID or a completed-status claim. Preserve all required evidence levels in the source. Collaborating maps and hashes are in `coverage/ACCEPTANCE_OWNERSHIP.json`.

### C04

- **C04.A01** — Restore a representative backup into an isolated environment and reconcile database records with private objects and audit history.
- **C04.A02** — A failed migration or partial integration has an exercised recovery path; no untested destructive down-migration is assumed safe.
- **C04.A03** — Record measured recovery and performance results against explicitly approved targets.
- **C04.A04** — Candidate release includes dependency and secret scanning, privileged-admin MFA evidence and independent outside security/code review with material findings resolved or explicitly dispositioned.
- **C04.A05** — Operational errors, uptime checks, audit failures and admin alerts are observed with a named support owner before real client use.

### GOV-001

- **GOV-001.A01** — The complete product scope, dependencies, decisions and source references are machine-checked.
- **GOV-001.A02** — Evidence is invalidated by changed input files, test commands, environment identity or logs; a chat summary is never test evidence.
- **GOV-001.A03** — Checkpoint and importer preserve observed state and refuse unsupported remote-save claims.
