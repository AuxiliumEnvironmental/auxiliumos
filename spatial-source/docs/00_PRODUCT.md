# Product and scope

## Objective

Produce a usable, editable spatial record with minimal field effort: capture,
review critical gaps, correct, navigate 2D/3D, save locally, and export or publish
a specific revision. The user's priorities are shape, relative proportions,
room connections, speed, beautiful clarity and dependable recovery. Absolute
measurement certification is excluded. Internal spatial units remain necessary.

## Users and context

The first user is an Auxilium field professional, often working one-handed on
an iPhone. Reviewer/manager modes can show more detail without making capture
complex. AuxiliumOS is the business/work-management platform. Moldo may use
selected capabilities later through its own workflow and independent authority.
No new login is required just to exercise synthetic local development fixtures.
The production local-data policy is enforced before real field deployment.

## V1 deliverable

Architecture correction approved October 9, 2026: the full authoring product is
one maintained React/TypeScript workspace running independently in a browser,
inside the authorized AuxiliumOS development app, and in a Capacitor iPhone app.
Apple capture remains native Swift RoomPlan/ARKit through the versioned bridge.
The functional and physical-device requirements below are retained; older
native-only UI wording does not exclude browser/OS authoring. See
`01_ARCHITECTURE.md` and `../web/IMPLEMENTATION_CONTRACT.md`.

A real iOS application target, native supported-device capture, guided sequential
multi-room scanning, durable draft work, editable structural geometry, per-floor
2D/3D views, correction and undo, confidence/review indicators, controlled exports,
and a disabled-by-default adapter ready for subsequent OS integration.

One application has several views. Do not build separate apps for scanner,
floorplans, 3D and corrections. Keep native capture at the Apple boundary and the
portable model independent of RoomPlan object layouts. Preserve original captures
so normalization can improve without recapturing every property.

## Device and scope defaults

Primary acceptance devices: iPhone 15 Pro/Pro Max and iPhone 16 Pro/Pro Max.
Later Pro models are eligible only when runtime capability checks succeed and
representative device tests pass. Do not hard-code "newer iPhone = LiDAR".
Provisional deployment minimum: iOS 17, subject to current stable SDK verification.
iPad layout should not be blocked by the model; LiDAR iPad capture is a follow-on
acceptance target rather than a new mandatory device purchase or separate build.
No Apple Watch, Vision Pro, Mac-only scanning or unsupported front-camera path.

Start with small, single-floor properties and individual scan segments. Apple
published residential MultiRoom guidance in 2023 around 2,000 square feet total;
that is guidance, not a universal current hard limit or accuracy certification
[A02]. Keep independently labeled floors in the data model. Do not claim seamless
stairs, automatic cross-floor alignment or unlimited commercial interiors.

## Explicit exclusions

No Insta360/360 import, panoramas, ordinary-video reconstruction, photo-set
reconstruction, furniture catalog, textured digital twin, GPS-based room geometry,
measurement certification, automatic quantity-based estimating, custom SLAM model
training, live collaborative geometry editing, or direct business-domain writes.
No mapping of hidden cavities, conditions behind walls, or invisible hazards.

## Success and non-negotiable completeness

A layout must have the right connections, not just look plausible. Open/incomplete
boundaries remain visibly unresolved. Users can correct missed openings and
nonorthogonal geometry without rescanning everything. Basic editing does not
require connectivity. Published artifacts remain available independently of the
capture process. The OS does not need to import native capture dependencies.

The differentiating workflow to pursue is "capture only what is missing, review
what affects usability most, edit directly, keep everything linked by revision."
This is an implementation objective, not an existing advantage over competitors.
No percentile, error rate, speed advantage or superiority claim without evidence.

Owner feedback on October 9, 2026 rejects the current manual interaction quality.
Passing synthetic browser checks is not manual-authoring acceptance. Keep the
clean desktop appearance while reaching at least the companion's in-scope
drawing capabilities: continuous outlines, quick room creation, visible snapping,
efficient selection and direct corrections, including openings. Compare the same
small-property tasks using mouse and touch before claiming parity or superiority.
The companion's calibration, quantities and business records remain excluded.

The owner positively reviewed the interactive 2D/3D visual direction on mobile
on October 9, 2026. Preserve that visual direction while finishing manual
interaction capability. This feedback is not acceptance of the complete editor,
native capture, hosted account flow, or physical-device performance.

## Outward and inward compatibility

Current OS blueprint and ADR-001 were read from PR #84 head a749b7d67d177c02f557b02e305598dfd2fee78c
when this package was prepared. These are context references, not a pinned target
for overwriting a later OS revision. See SOURCE_RECONCILIATION.json. The companion's
actual editor source has since been inspected read-only at
6d2213b9f58171409332b25cd91bd0541e36c07f; see
`../evidence/shared-workspace/MANUAL_AUTHORING_REVIEW_2026_10_10.json`.
Retain Spatial's canonical graph, persistence and revision ownership while adapting
proven interaction patterns. The original 20-module OS destination is retained.
