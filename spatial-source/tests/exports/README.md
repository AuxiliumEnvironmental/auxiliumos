# Exact-revision drawing and multi-floor export checks

`DrawingExporter` builds one deterministic page layout from admitted canonical
geometry. The first page shows room keys, door/passage gaps, double-line windows,
semantic-area outlines and incomplete endpoints. Directory pages retain full
document, floor, room and area labels, including Unicode and long labels. There
are no dimensions, area values, quantity claims, GPS north arrow, image textures
or raw captures. Geometry and source IDs are unchanged.

The real Apple backend uses CoreGraphics/CoreText for vector PDF and ImageIO for
PNG. There is deliberately no portable substitute bitmap font. Linux returns
`nativeRendererUnavailable` for PDF/PNG. Narrow PDF export does not allocate PNG
buffers; narrow PNG export does not draw PDF pages. Native export, font fallback,
pixel orientation and the generated PDF/PNG visual appearance need Apple tests.

## APIs for the actual editor

- `DrawingExporter.exportSVGArchive(document:floorID:)` includes every SVG page.
- `DrawingExporter.exportPDF(document:floorID:)` returns one multi-page PDF.
- `DrawingExporter.exportPNGArchive(document:floorID:pixelsPerPoint:)` includes
  every PNG page, never only a floor drawing without its label directory.
- `DrawingExporter.export(document:floorID:)` returns all page derivatives.
- `LocalDocumentExporter.export(document:)` packages the exact whole document,
  explicit per-floor artifacts, floor IDs, elevations, revisions and hashes.
- `LocalDocumentImporter.importArchive(_:)` restores admitted canonical geometry.

Call with the persisted frozen snapshot, off the main actor. Do not regenerate
bytes for an uncertain delivery retry. Hash and retain the exact emitted archive.

## Profiles and admission

The existing strict four-file exchange profile is not widened. The additive
`auxilium-spatial-local-document/1.0.0` profile uses ordinal paths, never user
labels or IDs as paths. It includes `geometry.json`, each floor's canonical
`scene.json`, `model.glb` unless the scene is empty, multi-page `floorplan.pdf`,
every numbered SVG/PNG page, and `manifest.json`. Every artifact except the
manifest has a manifest length and SHA-256; hash the exact manifest bytes
separately. Limits: 100 floors, 500 pages/floor, 4096 ZIP entries, 32 MiB/member,
64 MiB/archive. These are rejection caps, not capture or performance claims.

The derivative-only `auxilium-spatial-drawing-pages/1.0.0` profile has one floor's
SVG or PNG pages plus a manifest. It intentionally does not disclose unrelated
floor geometry and cannot be imported as a geometry document.

Local-document import uses a stored-ZIP-only dialect, exact central/local header
agreement, CRCs, fixed paths, no extras, descriptors, encryption, links, traversal,
overlays, preamble or trailing data. JSON is duplicate-key/unknown-field strict.
Manifest identity and exact bytes are verified. Incoming scene must equal the
regenerated canonical scene. SVG uses a separate bounded known-emitter grammar
with no active content or external references. PNG gets signature, pixel bounds,
chunk/CRC/end checks, not a pixel decode. PDF gets classic header/end and dangerous
name rejection, not a complete arbitrary-PDF safety proof. GLB gets header and
length admission, not a complete arbitrary-GLB decode. **PDF/PNG/GLB derivatives
remain opaque received bytes, are not exposed as view-ready files, and must not
be rendered. The app regenerates presentation from the accepted geometry.** A
hash never grants export or publication authority.

## Verification

Swift tests cover actual layout, exact snapshots, +X/+Z orientation, opening gaps,
noncolor window symbols, visible incompleteness, semantic areas, Unicode/long
label retention, empty floor, 100-room synthetic layout, safety admission and
archive identity/mutations. Native-only test branches decode the generated PDF
and PNG on Apple. Passing the Linux branch is only proof of the explicit
unsupported-backend result.

`LocalDocumentExportTests` injects **admission-only test payloads**, including a
one-pixel PNG and a PDF header stub. Those test archive identity, not rendered
floorplan correctness. `manifest-only-two-floors.zip` is not a customer export.

Set `SPATIAL_DRAWING_FIXTURE_DIR` while running the test binary to emit test
artifacts. On Apple this also emits actual native PDF/PNG and a complete native
local-document archive. `verify_export_archives.py` independently decodes ZIP,
JSON, SVG and per-floor GLB identity. `render_svg_review.py` uses the system
librsvg/Cairo decoder for supplementary SVG visual inspection. Its PNG images
are **SVG review images, not app-generated PNG evidence or running-app screenshots**.

Apple API references used for source review:

- https://developer.apple.com/documentation/coregraphics/cgcontext/init(consumer:mediabox:_:)
- https://developer.apple.com/documentation/imageio/kcgimagepropertypngdescription
- https://gnome.pages.gitlab.gnome.org/librsvg/Rsvg-2.0/method.Handle.render_document.html
- https://www.cairographics.org/manual/cairo-PNG-Support.html

Physical-device capture/recovery/accessibility and appearance remain separate
acceptance gates. These checks establish no sensor accuracy or field capacity.
