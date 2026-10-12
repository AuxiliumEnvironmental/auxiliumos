# Explicit contract evolution

The original geometry.schema.json, scene.schema.json and manifest.schema.json
remain byte-for-byte unchanged. They describe version 1.0 and the constrained
four-file exchange. Old golden documents still decode and round-trip without an
injected areas field. Unknown versions are rejected, not guessed.

## Geometry and scene 1.1

geometry-v1.1.schema.json adds optional floor areas: identity, label, simple X/Z
polygon and provenance. Area creation explicitly upgrades the mutable draft.
Deleting areas does not silently downgrade history; undo can restore the earlier
schema snapshot while still creating a new revision. The native and persistence
readers apply the same stricter graph and bounded-work validation.

scene-v1.1.schema.json permits semantic area edges. There are no area faces,
collision barriers or inferred room connections. A selected floor without areas
can emit the original 1.0 scene even when another floor needs geometry 1.1.
The four-file exchange manifest version is unchanged because its file/identity
contract is unchanged; its explicit readers recognize both geometry/scene schemas.

## Local-only export profiles

- auxilium-spatial-drawing-pages/1.0.0 contains all selected-floor SVG or PNG
  pages and an identity/byte manifest. It is derivative-only, not a geometry import.
- auxilium-spatial-local-document/1.0.0 contains canonical geometry plus indexed
  per-floor SVG, PDF, PNG and scene output, and optional GLB. Each path, length,
  hash, document, revision and floor association is explicit. Raw Apple scans and
  world maps are never included.

These profiles do not replace or silently widen the proposed publication wire
contract. The disabled publisher freezes the existing single-floor exchange
format and explicitly rejects unsupported multi-floor publication. Local all-floor
exports remain available. A live receiver/multi-floor wire capability requires a
separately authorized, versioned adapter rather than assuming recipient support.

Local archive import validates bounded ZIP/JSON/schema/geometry/manifest identity,
checks constrained SVG content, and compares the supplied scene with regenerated
canonical geometry. Received PDF, PNG and GLB are never loaded into native views;
PDF/GLB structural admission is not complete arbitrary-file decoding or visual
approval. Only validated geometry is imported into a new review-required draft.
The original archive in the returned in-memory transport object is not a grant
to publish, render or redistribute its derivatives.

## Store and access

SQLite migrations retain old versions and add outbox, managed-access binding,
recovered-draft source links and confirmed-history-cleanup journals. Changes do
not migrate any OS/Moldo database. PublicationAuthorization and managed leases
are injected scoped contracts, not reusable URL credentials or configured live
account integrations. The app uses local device-owner access only by default.

## F04 branch candidate: fixtures and optional through-holes

Geometry/scene 1.4.0 adds fixtures with catalog version 1, physical dimensions,
floor transforms or explicit sided wall charts; cutouts/penetrations use the
master-frozen SurfaceRef and rectangle/circle profiles. Existing 1.0/1.1 admission
is immutable. The first fixture/hole edit upgrades the mutable draft and preserves
the old undo snapshot. Native capture still produces legacy input.

This isolated F01-based branch is not the cumulative F02/F03 implementation. Its
optional Room.ceiling lookup consumes the exact D03 ceiling shape but does not
create, infer, migrate or edit ceilings. Ceiling holes require an established
matching ceiling ID. 1.2/1.3 input and styled apertures remain unsupported until
master composition; do not use this branch to overwrite accepted predecessor
schemas or readers. The schema files are candidates with that explicit limitation.

The complete local-document profile retains its existing safe drawing vocabulary,
member names and provenance contract. Geometry/scene inside it are separately
versioned. SVG/PDF/PNG derive the same planar material decomposition and fixture
edges. Scene/GLB include authoritative holes and authored ceiling planes only.
Fixture-only floors are geometry in manifests and receive GLB; drawing extents
include off-structure fixtures. Old single-floor exchange/outbox is not widened;
1.4 exports/imports through that profile reject with the complete local-document
alternative. No legacy writable downgrade is offered.

Circular geometry is a deterministic inscribed 48-gon shared by scene, resolver,
plan and exports. The maximum radial approximation error is
`radius * (1 - cos(pi / 48))`, approximately 0.214% of radius. Profile validation
uses the analytic circle to reject touching/overlap; subtraction uses that shared
approximation. No surface thickness, recess, boundary notch, shaft or portal is
inferred. Rigid chart profiles cannot span a bend. Ambiguous host changes reject
unless explicitly rehosted/deleted in the same transaction. Furniture remains
nonblocking and never subtracts observation support. F05's recorded-support and
F03's actual remap receipts still need composed integration checks.
