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


## F05 branch candidate: affected observations (geometry/scene 1.5.0)

This candidate is based on accepted F01, not a claim that F02-F04 are integrated.
The master must compose the real predecessor types, commands, schema versions,
scene roles, migrations and final material-domain resolver before acceptance.
Do not replace F03/F04 `core/surfaces.ts` with this branch's baseline wall-opening
adapter. F05 consumes the frozen surface functions and their material domains;
it has no competing cutout implementation. The optional established ceiling
field here is a contract fixture, not ceiling initialization. Versions 1.2/1.3/1.4
remain rejected rather than pretending to migrate unknown predecessor fields.
Existing 1.0/1.1 inputs remain admitted without fabricated observations.

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
real F03/F04 typed command receipts remain a dependency-sensitive integration step.

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
installed assets, host delivery and full F02-F04 parity remain separately gated.
