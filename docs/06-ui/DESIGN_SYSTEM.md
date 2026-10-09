# Design System

Status: Proposed visual implementation defaults under the 2026-10-08 development mandate. These are editable design choices, not implemented UI or final brand approval. Track coverage/evidence in [REQUIREMENTS.json](../../REQUIREMENTS.json); permission and authority policy stays in [OWNER_DECISIONS.json](../../OWNER_DECISIONS.json).

## Direction

AuxiliumOS should make complex operations legible. Use a restrained professional shell, clear action hierarchy and progressive disclosure. Simple and enterprise views share components; enterprise breadth does not make every screen denser. Preserve useful existing brand assets after verifying their source. Do not automatically copy Moldo's consumer branding.

## Proposed tokens

| Token group | Initial direction |
|---|---|
| Background/surface | White and light neutral surfaces; clearly separated panels |
| Text | Dark neutral body text; muted text remains readable |
| Navigation/action | Deep blue navigation and one consistently recognizable primary action |
| State | Semantic success, warning, error and information with labels/icons |
| Type | Readable sans serif; consistent page, section, label and body hierarchy |
| Spacing | A small shared spacing scale; larger gaps between sections than related fields |
| Shape/elevation | Consistent modest radius and limited shadows; borders for structure |

Implement named semantic tokens rather than repeated arbitrary values. Select final colors against actual adjacent surfaces and measured legibility. Dark mode, if included, gets its own verified semantic palette. No state is communicated only by color.

## Layout and language

Phone screens prioritize one task, with secondary actions available without crowding. Desktop views can expose comparisons and queues while preserving reading order. Avoid full-page horizontal scrolling, clipped buttons, tiny labels and dense multi-column mobile forms. Long facility names, units and translated browser text must not break layout.

Use concrete verbs, US English and short helpful explanations. Avoid em dashes, fear-based claims, unsupported compliance promises and implementation jargon in product flows. Distinguish Not yet authorized from Error. Do not display scientific certainty or safety conclusions generated from UI status alone.

## Acceptance

Review representative client, field, management and release tasks at phone/tablet/desktop sizes, with enlarged text, keyboard navigation, focus, reduced motion and realistic long synthetic content. Record screenshots with their source commit; a screenshot is visual evidence, not proof of backend behavior. Moldo integration displays provenance without replacing Moldo's existing experience. Companion redesign remains deferred.
