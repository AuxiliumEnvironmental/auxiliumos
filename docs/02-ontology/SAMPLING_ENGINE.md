# Sampling and testing

Catalogue version: `2026-10-08.1`
Status: Recovered historical candidates and proposed development defaults. No scientific, legal, commercial, permission, or production activation approval is implied.

## Source and authority

The lists below preserve the source candidates in [AuxiliumOS Founder Homework Workbook](../10-history/original-plans/AuxiliumOS_Founder_Homework_Workbook.md), sections 5.1 and 5.2, from the planning packet packaged on June 14, 2026. The source workbook contains unfilled answer fields. Its candidate lists are requirements-discovery inputs, not completed owner decisions. Operating principles also come from [AuxiliumOS Master Map, Guardrails, and Development Roadmap](../10-history/original-plans/AuxiliumOS_Master_Map_Guardrails_Roadmap.md), packaged June 14, 2026. Current user instructions govern modernization and nonblocking development.

Owner review references: OD-005, OD-006, OD-008, OD-009, OD-013. Map implementation and evidence to the applicable entries in the root [REQUIREMENTS.json](../../REQUIREMENTS.json); this catalogue does not replace that delivery ledger. The identifiers introduced here identify catalogue entries, not approved services or requirement completion.

## Proposed sampling categories

These categories organize configuration. They do not prescribe collection counts, methods, thresholds, equipment suitability or scientific conclusions.

| Catalogue ID | Source candidate |
|---|---|
| SAMPLE-001 | Bulk/material asbestos samples |
| SAMPLE-002 | Bulk/material lead or other material samples |
| SAMPLE-003 | Surface soot/residue samples |
| SAMPLE-004 | Surface dust/lead dust samples |
| SAMPLE-005 | Surface drug-related residue samples |
| SAMPLE-006 | Mold air samples |
| SAMPLE-007 | Mold surface samples |
| SAMPLE-008 | VOC air samples |
| SAMPLE-009 | Formaldehyde air samples |
| SAMPLE-010 | Particulate/dust air samples |
| SAMPLE-011 | Personal exposure samples |
| SAMPLE-012 | Area air samples |
| SAMPLE-013 | Direct-reading instrument logs |
| SAMPLE-014 | Soil samples |
| SAMPLE-015 | Groundwater samples |
| SAMPLE-016 | Vapor samples |

The alternate June 14 table-form workbook also groups these by bulk/material, surface wipe/tape/residue, air, personal exposure, direct-reading/screening, soil/groundwater/vapor, asbestos, lead, microbial/mold, combustion byproduct/soot/residue, VOC/formaldehyde/chemical, silica/dust/particulate, and drug residue. Preserve those as analyte/category aliases or facets where useful; do not create competing sample identities. A direct-reading instrument log must identify that it is field measurement data rather than a laboratory result.

## Proposed preference and authority model

The source proposes: no sampling requested; recommend only; pre-authorized within a cap; specific sampling requested; not sure/ask Auxilium; and explicit sampling declined. These are client preferences or decisions, not interchangeable final authorization states.

Development default: record client preference, Auxilium recommendation, actual authorized plan/cap, collection, laboratory status and interpretation as separate fields/records. “Specific sampling requested” still requires review. A cap constrains spending and does not approve an unsupported method. A declination is preserved with proposed limitations and reviewer decisions; it does not automatically validate a strong conclusion.

## Versioned configuration and operational records

A sampling module needs: stable ID/version; linked issue/technical module; category/analyte; verified method and method version; media; collection procedure reference; equipment; COC requirements; lab vendor; standard/rush turnaround; verified cost/markup/shipping; interpretation/report integration inputs; QA/QC; safety/PPE implications; scaling basis; counts/ranges only where supported; field flexibility; authorization policy; limitations; source/reviewer; and effective/activation status.

Candidate scaling bases recovered from the alternate workbook are area, unit, floor, building, material type, pathway, control location, employee, task and shift. Selecting a basis does not establish a count formula. Unknown historical averages remain unknown, not zero or an invented default.

Operational records need authorized scope/plan version, sample ID, account/project/site/location, collection metadata, custody events and lab identifiers, order/result attachments, result revisions, status/exceptions, reviewer/interpretation and audit links. Field observations, laboratory reported values and professional interpretation remain distinguishable. Confidentiality and the no-PHI boundary apply to free text, uploads and identity links.

## Dependencies and acceptance

- Authorized quantities/cost caps and field deviations are visible; extra sampling creates a controlled request when required.
- Sample IDs reconcile across field record, COC, lab order and results. Duplicates, missing results and revised laboratory reports are surfaced.
- A result upload cannot approve scope, release a report or become an AI-final technical conclusion.
- Synthetic scenarios cover recommend-only, specific requested but unauthorized, authorized within cap, cap exceeded, declined sampling with reviewer limitations, missing COC and corrected results.
- Method details, interpretation criteria and qualifications require traceable reviewed sources before live activation. Development continues on the structures, recovery behavior and synthetic paths while those decisions are recorded.
