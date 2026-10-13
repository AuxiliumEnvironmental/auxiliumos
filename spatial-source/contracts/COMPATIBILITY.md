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
