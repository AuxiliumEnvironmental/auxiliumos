# Issues intents and technical modules

Catalogue version: `2026-10-08.1`
Status: Recovered historical candidates and proposed development defaults. No scientific, legal, commercial, permission, or production activation approval is implied.

## Source and authority

The lists below preserve the source candidates in [AuxiliumOS Founder Homework Workbook](../10-history/original-plans/AuxiliumOS_Founder_Homework_Workbook.md), sections 4.2, 4.3 and 4.4, from the planning packet packaged on June 14, 2026. The source workbook contains unfilled answer fields. Its candidate lists are requirements-discovery inputs, not completed owner decisions. Operating principles also come from [AuxiliumOS Master Map, Guardrails, and Development Roadmap](../10-history/original-plans/AuxiliumOS_Master_Map_Guardrails_Roadmap.md), packaged June 14, 2026. Current user instructions govern modernization and nonblocking development.

Owner review references: OD-005, OD-007, OD-008, OD-009. Map implementation and evidence to the applicable entries in the root [REQUIREMENTS.json](../../REQUIREMENTS.json); this catalogue does not replace that delivery ledger. The identifiers introduced here identify catalogue entries, not approved services or requirement completion.

## Proposed issues

The issue describes the reported event or concern. Keep the client's original wording alongside subsequent Auxilium classification.

| Catalogue ID | Source candidate |
|---|---|
| ISSUE-001 | Fire / Smoke / Soot |
| ISSUE-002 | Water / Moisture / Flood |
| ISSUE-003 | Sewage / Contaminated Water |
| ISSUE-004 | Storm / Wind / Hail / Hurricane |
| ISSUE-005 | Mold / Microbial |
| ISSUE-006 | IAQ / Occupant Complaint |
| ISSUE-007 | Odor / Residue |
| ISSUE-008 | Chemical Concern |
| ISSUE-009 | Suspected Drug-Related Contamination |
| ISSUE-010 | Asbestos |
| ISSUE-011 | Lead |
| ISSUE-012 | Dust / Silica / Particulate |
| ISSUE-013 | VOC / Formaldehyde / Chemical Exposure |
| ISSUE-014 | Worker Exposure |
| ISSUE-015 | Regulated Materials Before Work |
| ISSUE-016 | General Property Condition |
| ISSUE-017 | Environmental Site / Soil / Groundwater / Vapor |
| ISSUE-018 | Healthcare Facility Incident |
| ISSUE-019 | Unknown / Help Classify |

## Proposed service intents

Intent records what the client wants the engagement to accomplish. It does not establish that the proposed conclusion or service is technically supportable.

| Catalogue ID | Source candidate |
|---|---|
| INTENT-001 | Assess what is happening |
| INTENT-002 | Identify source/pathway/extent |
| INTENT-003 | Document affected areas |
| INTENT-004 | Evaluate a specific concern |
| INTENT-005 | Recommend whether testing is needed |
| INTENT-006 | Perform approved testing/sampling |
| INTENT-007 | Develop protocol or scope |
| INTENT-008 | Review existing report, estimate, or contractor scope |
| INTENT-009 | Review contractor work |
| INTENT-010 | Monitor or oversee work |
| INTENT-011 | Verify work after completion |
| INTENT-012 | Provide clearance-type assessment where applicable |
| INTENT-013 | Provide 3D documentation/measurements |
| INTENT-014 | Provide expert/dispute-level support |
| INTENT-015 | Provide consultation only |
| INTENT-016 | Help classify the request |

## Proposed technical work modules

These are units of technical work, distinct from the 20 software modules. Historical names that describe an output or a method should be linked to the appropriate output/method record rather than creating a second source of truth.

| Catalogue ID | Source candidate |
|---|---|
| TECH-001 | Visual condition assessment |
| TECH-002 | Moisture mapping |
| TECH-003 | Source/pathway assessment |
| TECH-004 | Affected-area boundary documentation |
| TECH-005 | Fire residue/soot assessment |
| TECH-006 | HVAC pathway review |
| TECH-007 | Suppression-water overlay |
| TECH-008 | Odor/residue evaluation |
| TECH-009 | Surface contamination evaluation |
| TECH-010 | Asbestos material identification/testing support |
| TECH-011 | Lead paint/dust/material assessment |
| TECH-012 | Worker exposure monitoring |
| TECH-013 | Task/shift/job classification exposure assessment |
| TECH-014 | Respirator fit testing support |
| TECH-015 | Contractor work review |
| TECH-016 | Containment/work practice observation |
| TECH-017 | Post-remediation verification |
| TECH-018 | Post-drying verification |
| TECH-019 | 3D documentation |
| TECH-020 | Measurement package |
| TECH-021 | Document review |
| TECH-022 | Senior technical review |
| TECH-023 | Site passport creation |
| TECH-024 | Critical asset registry update |
| TECH-025 | Site readiness review |
| TECH-026 | Vendor documentation review |
| TECH-027 | QBR risk update |

## Mapping contract and development defaults

An issue-intent mapping has its own ID/version, applicability predicates, allowed/unsupported status, candidate technical modules, relationship types, required questions, linked sampling and deliverables, safety/qualification review, exclusions, ROM variables, source, effective dates and approval status. Use [RELATIONSHIP_TAXONOMY.md](RELATIONSHIP_TAXONOMY.md). Never generate every possible combination as automatically valid.

Proposed examples for synthetic implementation, not final technical prescriptions:

| Input context | Proposed application behavior |
|---|---|
| Water/moisture with a source/pathway/extent intent | Offer visual condition, moisture mapping and source/pathway modules for review; do not automatically include invasive work or sampling |
| Fire/smoke with assessment intent | Collect affected-area and event facts; evaluate triggered suppression-water, HVAC, regulated-material and unknown-residue questions |
| Approved testing requested | Require a reviewed sample plan, applicable authority and qualification rather than choosing a laboratory method from the issue label |
| PRV or clearance-type work requested | Ask for the applicable baseline/protocol and intended verification criteria; route missing or incompatible context for qualified review |
| Expert/dispute support requested | Identify the intended use and route scope, reviewer and deliverable requirements; do not infer legal/coverage authority |
| Unknown/help classify | Preserve the narrative, ask a short set of useful questions and route for classification without forcing a fabricated issue |

For each issue maintain plain-language label/description, common mistaken requests, valid intent links, first-level and conditional questions, candidate modules, possible sampling/deliverables, limitations, review triggers, ROM variables and edge cases. For each intent maintain use/not-use conditions, questions, deliverable links, sampling states, reviewer conditions and limitations. For each technical module maintain methods, qualification/safety implications, included/billable/MSA relationships and exclusions.

## Dependencies and acceptance

- Intake preserves the original request and shows reviewed classification separately. Reclassification is auditable.
- A client can save a template, repeat a prior request, prefill an authorized asset, search permitted offerings or request help classifying. Repetition copies proposed inputs and re-evaluates current rules; it does not copy old authorization.
- Unknown or unsupported combinations route to review. They neither auto-authorize work nor stop unrelated software development.
- Scope records pin exact mapping/rule versions and record accepted, declined, deferred and excluded recommendations.
- Changed context invalidates stale suggestions before acceptance. Tests cover one valid mapping, one incompatible mapping, unknown classification, reclassification, and rule-version changes.
- Backend ownership/permissions, professional approval and final scope/change workflows control actions regardless of visible client tiles.
