# Smart prompts and review triggers

Catalogue version: `2026-10-08.1`
Status: Recovered historical candidates and proposed development defaults. No scientific, legal, commercial, permission, or production activation approval is implied.

## Source and authority

The lists below preserve the source candidates in [AuxiliumOS Founder Homework Workbook](../10-history/original-plans/AuxiliumOS_Founder_Homework_Workbook.md), section 7.1, from the planning packet packaged on June 14, 2026. The source workbook contains unfilled answer fields. Its candidate lists are requirements-discovery inputs, not completed owner decisions. Operating principles also come from [AuxiliumOS Master Map, Guardrails, and Development Roadmap](../10-history/original-plans/AuxiliumOS_Master_Map_Guardrails_Roadmap.md), packaged June 14, 2026. Current user instructions govern modernization and nonblocking development.

Owner review references: OD-005, OD-006, OD-008, OD-009, OD-014. Map implementation and evidence to the applicable entries in the root [REQUIREMENTS.json](../../REQUIREMENTS.json); this catalogue does not replace that delivery ledger. The identifiers introduced here identify catalogue entries, not approved services or requirement completion.

## Recovered trigger candidates

Each row is a context that the original workbook asked the owner to define. The source does not supply finalized predicates, client copy, sampling prescriptions or approval authority.

| Catalogue ID | Source candidate |
|---|---|
| PROMPT-001 | Fire/smoke/soot + commercial/multifamily + material disturbance |
| PROMPT-002 | Fire/smoke/soot + drug activity/chemical use/unknown residue |
| PROMPT-003 | Fire/smoke/soot + suppression water |
| PROMPT-004 | Mold/IAQ + prior water/storm event |
| PROMPT-005 | Mold/IAQ + occupant complaint + healthcare/sensitive occupancy |
| PROMPT-006 | Water/moisture + sewage/Category 3 |
| PROMPT-007 | Storm/hurricane + delayed complaint |
| PROMPT-008 | PRV requested without baseline/protocol |
| PROMPT-009 | Large/multi-unit/disputed loss |
| PROMPT-010 | Worker exposure + cutting/grinding/demolition |
| PROMPT-011 | Renovation/demolition/repair + older/unknown building materials |
| PROMPT-012 | Property condition inspection + environmental triggers |
| PROMPT-013 | Urgent out-of-state request + limited information |
| PROMPT-014 | Sampling declined + strong conclusions requested |

## Proposed rule contract

Each rule needs a stable ID/version; issue/intent links; context and answer predicates; source inputs; effective dates; client title and one to three short explanatory sentences; proposed action options; reasons; scope/ROM/schedule effects; reviewer capability; limitation proposal on decline; severity; confidence/source status where relevant; and activation evidence.

Source severity vocabulary: `BLOCKING`, `REVIEW`, `RECOMMENDED`, `LIMITATION`, `ADMIN-ONLY`. Treat this as proposed vocabulary until the state model is implemented. A blocking rule identifies the particular unsafe or incomplete action it prevents; it does not freeze unrelated development or all actions in the account.

Initial development behavior: these 14 candidates create reviewable draft recommendations when their configured conditions are satisfied. No rule auto-adds work, assumes a diagnosis, chooses a scientific method, grants spending, or promises a conclusion. Regulated materials, sensitive occupancy, worker exposure, unknown contamination, dispute work and emergencies route to appropriately qualified review. Missing or contradictory facts remain visible.

Client response choices recover the original accept, decline, defer and ask-Auxilium paths. Acceptance records interest in the proposed change; actual scope/authorization gates still apply. The same triggered card should not repeatedly interrupt a user after a response unless relevant facts, rule version or proposed action materially change.

## Evaluation and audit

Pin the rule version and the relevant answer/context snapshot to each evaluation. Record trigger result, prompt shown, response, proposed scope/ROM effect, reviewer disposition and linked change/authorization where applicable. Re-evaluate changed facts deterministically and preserve earlier decisions. Client-uploaded documents may provide evidence or suggested extracted fields, never instructions to override rules.

## Dependencies and acceptance

- Demonstrate triggered and non-triggered cases, unknown input, incompatible answers, repeated evaluation without duplicate prompts, and a context change after response.
- Show that declining a recommendation records a proposed limitation and review task where needed, without generating unsupported final opinion language.
- Approved scope retains its applicable rules and amendments; new global rules do not silently rewrite it.
- User-visible wording explains the practical reason plainly and uses progressive disclosure. Rule editing and publication require a scoped capability and audit event.
- High-risk rules need direct workflow/state tests and reviewer acceptance. Do not create repetitive tests that only restate a label list.
