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

An explicit `createCopy` resolves an import/native recovery identity collision
without replacing the corrected draft. It creates a new document at revision 1,
retains object IDs and provenance, and atomically stores a source-identity sidecar
plus the exact original canonical bytes. Reopen verifies original ID, revision
and digest against those retained bytes. An exact-source retry reopens the prior
copy, including its subsequent edits. Undo/restore retain this sidecar. Geometry
schemas stay unchanged; exports identify the new document truthfully. Full local
backups of copies use additive profile `auxilium-spatial-local-document/1.1.0`
with hashed, paired `source/geometry.json` and `source/identity.json` members.
`importWorkspace` and `createImported` retain that association atomically. Ordinary
local documents remain profile 1.0.0 and old exchanges remain unchanged. A copy of
a copy retains its original source association; a separate private input digest
makes exact retries idempotent. This provenance is recovery metadata, not authority.

Frozen snapshots contain the exact canonical UTF-8 JSON bytes and their SHA-256.
Every export validates those bytes against the graph and hash. Single-floor scene,
SVG, PNG and GLB exports require an explicit floor when the document has several.
PDF supports all floors. `local-document` always exports all floors with geometry,
per-floor scene, SVG, PNG, PDF and nonempty GLB, using the existing local-document
manifest profile (1.1.0 only when copy provenance is present). The original four-member exchange is still single-floor.
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
files. Deflate admission also verifies complete compressed-stream consumption;
this adapter is pinned to fflate 0.8.3's runtime state and must be rechecked on
upgrade. Exchange SVG keeps its original flat vocabulary. Local drawing SVG uses
the preserved native bounded circle/text/tspan and semantic-attribute vocabulary.
PNG admission retains the native 16-million-pixel, 8-bit supported-color limits;
PDF admission decodes escaped names and rejects the existing active-name set. Scene
bytes must agree with the regenerated canonical scene. PDF/PNG/GLB derivative
admission is bounded structural validation, not an arbitrary third-party decoder;
these received bytes are never loaded into views.

PNG is rendered by the actual browser's canvas from generated safe SVG at
2400 × 1800. Image URLs and canvas resources are released after success or failure.
PDF uses vector geometry and standard-font text for supported characters. Full
Unicode text uses the browser's system-font rasterizer rather than losing glyphs
or shipping font binaries. A conservative missing-glyph check stops known missing
font output with an explicit error; exact SVG/geometry text remains available.
Installed Greek/Latin glyphs were exercised in Chromium. This Linux runtime has no
CJK font; no universal Unicode or iOS-font acceptance is implied. The exporter
removes jsPDF's mandatory default view action from its own generated catalog while
preserving xref byte offsets, keeping the existing strict import profile intact.
PNG, Unicode PDF and complete local-document export
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

Evidence capture commands from `web/`:

- `python3 tests/data/verify-data.py`: fresh TS/IndexedDB/receiver checks with input hashes.
- `python3 tests/data/verify-probes.py`: existing exchange reader, official GLB validator and PDF renderer.
- `node --import tsx tests/data/browser-recovery.mjs`: actual isolated Chromium process termination after acknowledged UI saves and during an uncommitted UI-triggered IndexedDB write, followed by reopening graph/history/frozen revisions and disabled outbox.
- `python3 tests/data/verify-browser.py`: actual workspace PNG/PDF/SVG downloads, all-floor local-document roundtrip, schema/member validation and missing-font failure, with exact source/runtime/font hashes.

The browser command uses an explicitly available Chromium executable (set
`SPATIAL_BROWSER_EXECUTABLE`) and starts Vite inside the same test process. It
requires the existing verification Python environment and `pdftoppm`. Prior
failures and earlier evidence remain in `tests/data/generated/`; successful reruns
do not erase the missing-glyph, generated-PDF-profile or earlier review findings.
