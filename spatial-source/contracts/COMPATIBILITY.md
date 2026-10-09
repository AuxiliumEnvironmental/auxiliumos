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
