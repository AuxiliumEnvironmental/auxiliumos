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

## F02 opening authoring (geometry / scene 1.2.0)

The shared web editor admits immutable 1.0.0 and 1.1.0 documents and adds strict
1.2.0 admission. An explicit catalog edit upgrades a mutable revision; opening
a document never rewrites its original snapshot. Legacy generic apertures retain
unspecified subtype/orientation. Style provenance is authored independently of
aperture provenance and cannot grant inferred openings navigation authority.

Scene 1.2.0 adds opening-owned `opening` faces for diagrammatic frames/panels.
Complete local-document 1.0/1.1 profiles retain their existing member contract,
including separately versioned geometry/scene, drawings and GLB. Unsupported
versions reject intact. The constrained legacy exchange/outbox rejects 1.2.0
with a complete-local-document alternative; the v1 publisher remains disabled.
Drawing recovery writes formatVersion 2 for styled opening drafts and continues
reading/writing legacy formatVersion 1 for other drafts. A v1 record with style
fields is rejected rather than silently stripped. No database version changes.

Styles persist in meters with wall-local end/side orientation. Wall reversal
swaps both applicable orientation dimensions; split/join translates arclength.
Rigid styles cannot cross a noncollinear bend. Generic legacy apertures may.
Companion symbol extents are not physical opening heights. SVG/PDF/PNG use the
same plan primitives and include their extents. GLB opening material handling
is explicit and preserves the accepted structural surface palette.

## F03 ceiling heights (geometry / scene 1.3.0)

Geometry 1.3.0 retains the complete 1.2.0 opening contract and requires each
room to record either a stable planar ceiling or explicit null intent. The first
ceiling edit establishes legacy uniform positive wall tops as inferred ceilings;
unknown and uneven tops remain null. Opening or exporting older documents does
not migrate their frozen geometry. Authored ceiling edits preserve floor datums,
neighboring room intent and aperture geometry, extend necessary wall envelopes,
and reject conflicts atomically. Later feature upgrades retain these fields.

Scene 1.3.0 emits each canonical ceiling once using its own stable identity.
Display-only legacy ceiling previews do not duplicate canonical scene faces.
Complete local documents retain the geometry and canonical scene; GLB retains
ceiling identities and materials; drawing directories include established
heights and their unverified basis. The legacy exchange remains constrained to
1.0/1.1. Undo, redo and restore issue surface mappings bound to the actual source
and newly saved revision, including unresolved outcomes for replaced hosts.
## F04 fixtures and optional through-holes (geometry / scene 1.4.0)

Geometry 1.4.0 preserves the complete 1.2 opening and 1.3 ceiling contracts and
adds optional fixtures and cutouts. First fixture or floor/wall hole edits establish
legacy ceiling intent before upgrading the mutable draft; frozen source and undo
snapshots remain unchanged. A ceiling hole requires an already established matching
ceiling ID. Feature edits never downgrade a newer admitted schema.

Fixtures use catalog version 1, physical dimensions and explicit floor or sided wall
mounts. Cutouts and penetrations share SurfaceRef charts and real material subtraction
across the resolver, scene, plan, complete local document, SVG/PDF/PNG and GLB.
Canonical ceilings use their own stable identity and are emitted only once. Legacy
single-floor exchange remains restricted to 1.0/1.1; newer geometry must use the
complete local-document format. No writable downgrade is offered.

Circles use a shared deterministic inscribed 48-gon, with maximum radial approximation
error `radius * (1 - cos(pi / 48))`, approximately 0.214% of radius. Analytic profile
validation rejects touching/overlap. Through-holes have no invented thickness,
recess, boundary notch, shaft or portal. Rigid profiles cannot span a wall bend.
Ambiguous host changes reject unless explicitly rehosted or deleted in the same
transaction. Furniture remains nonblocking and never subtracts surface support.

Cutout addition, movement and removal produce canonical surface remaps on both wall
sides and horizontal hosts. Split remaps retain the original material domain including
voids removed in the same transaction. F05 consumes this canonical domain and keeps
its recorded-support intersection; its cumulative acceptance remains a separate gate.


## F05 affected observations (cumulative geometry/scene 1.5.0)

Geometry and scene 1.5.0 retain the actual F02-F04 opening, ceiling, fixture and
cutout contracts. F05 consumes the shared F03 resolver with F04 material
subtraction. The first observation edit on an older mutable document uses the
ceiling migration before advancing to 1.5.0; every room has Ceiling or explicit
null. Opening or exporting earlier snapshots never migrates them. Versions
1.0 through 1.4 retain their own strict admission and receive no fabricated
observations.

`affectedAreas` is document-owned, not floor-owned, so deleting a host floor cannot
delete its observations. Each record retains its original surface reference,
authored polygon, source document/revision, recorded material support and edited,
unverified provenance. Attachments hold rigid source-chart-to-current-chart maps
and retained source-domain pieces. Missing/ambiguous hosts become null unresolved
attachments visible in review. Host edits never expand recorded support. Explicit
reshape/reattach confirms new support in a new revision; old snapshots remain in
existing durable history. No readings, verified totals, diagnoses or restoration
scope are created.

Same-host material/height changes preserve original support and clip display.
Wall reversal swaps arclength and side. Splits/joins partition physical charts.
Multi-node moves resolve once per coherent transaction segment. Ambiguous topology
or deformation is retained for review, never guessed onto nearby geometry. The
canonical surface receipts carry exact retained domains through the transaction.

Plan, SVG, PDF and PNG share pre-clipped primitives: light floor fills, two-direction
ceiling grids and side-offset wall length lines. The 6 cm plan offset is diagrammatic
only. SVG admission is not widened. 3D/GLB use blue/red translucent front-sided
observation faces. Overlapping kinds alternate strips instead of blending purple.
The 1 mm derived surface bias is not a stored measurement. Observations do not
participate in walking collision or cutaway ownership. Explicit surface editing,
revision/authority fences, bounded frame-coalesced previews, cancellation and
terminal-only commands keep navigation and persistence separate.

Complete local-document export retains records and source identity through full
geometry and regenerated derivatives. Unknown fields still fail admission. Legacy
case-exchange/bundle export and import explicitly reject 1.5 so the publication
outbox cannot silently send lossy observations. No case/OS publisher schema,
database version, historical revision or native decoder is changed. Apple, device,
installed assets and host delivery remain separately gated.
