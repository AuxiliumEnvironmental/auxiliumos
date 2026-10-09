# Shared workspace data implementation

This is the browser/Capacitor workspace's data layer, implemented against the
existing Swift geometry and local-file contracts. It creates no network resources
and contains no HTTP publication transport.

`SpatialWebStore` acknowledges a save only after the IndexedDB read/write
transaction completes. Draft geometry, undo, redo, checksums and edit receipts are
one atomic record. Concurrent tabs compare the source revision and checksum before
writing. History is limited to 100 states and a 16 MiB budget per direction,
always retaining at least the latest available undo/redo state. Immutable
frozen revisions and queued delivery bytes are retained separately. Database names
are context-scoped; the authenticated OS adapter is responsible for checking
current read/export/edit authority before using the store. A browser namespace is
not an authorization mechanism, encryption or a promise against browser eviction.
Native Apple source captures remain in native protected persistence.

Frozen snapshots contain the exact canonical UTF-8 JSON bytes and their SHA-256.
Every export validates those bytes against the graph and hash. Single-floor scene,
SVG, PNG and GLB exports require an explicit floor when the document has several.
PDF supports all floors. `local-document` always exports all floors with geometry,
per-floor scene, SVG, PNG, PDF and nonempty GLB, using the existing local-document
manifest profile. The original four-member exchange is still single-floor.
No derivative is used as editing or rendering truth after import.
Long room labels and semantic-area labels use complete directory pages. SVG/PNG
exports return the existing drawing-pages ZIP profile when more than one page is
needed. PDF includes every page; local-document records exact per-floor page
counts. The exchange retains one safe SVG member with vertically stacked panels,
so its fixed four-file vocabulary is unchanged and labels are not discarded.

The strict importer rejects duplicate JSON keys, unsafe object keys, invalid UTF-8,
nonfinite numbers, unsupported schemas and graph inconsistencies. ZIP admission
checks metadata, contiguous local/central members, CRC, duplicate/traversal/symlink
paths, expansion ratio and byte caps before retaining entries. It never extracts
files. SVG is limited to the original flat emitted primitive vocabulary. Scene
bytes must agree with the regenerated canonical scene. PDF/PNG/GLB derivative
admission is bounded structural validation, not an arbitrary third-party decoder;
these received bytes are never loaded into views.

PNG is rendered by the actual browser's canvas from generated safe SVG at
2400 × 1800. Image URLs and canvas resources are released after success or failure.
PDF uses vector geometry and standard-font text for supported characters. Full
Unicode text uses the browser's system-font rasterizer rather than losing glyphs
or shipping font binaries. PNG, Unicode PDF and complete local-document export
therefore require an actual browser renderer; a Node run cannot certify them.

`SpatialOutbox` persists immutable bytes and a stable request ID before delivery.
Its default transport is disabled. Synthetic adapters exercise status-first retry,
exact reservations/receipts, current source/destination authority, authentication
expiry, durable pending states, optimistic destination conflicts, revocation,
cross-tab leases and cancellation. An upload or pending response is never called
delivered. No receipt is accepted without adapter authentication. A local hash
establishes byte identity and cannot authorize publication or client release.

Portable verification: `node --import tsx --test tests/data/*.test.ts` from `web/`.
These are fresh TypeScript tests with fake-indexeddb and synthetic receivers.
They are not browser process-death, Apple compilation or physical-device evidence.
