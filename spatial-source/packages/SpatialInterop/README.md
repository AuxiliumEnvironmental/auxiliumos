# SpatialInterop

Portable Swift import and export for the pinned Auxilium Spatial developer contracts.
The package has no networking, publishing authority, cloud resources, capture SDK,
filesystem extraction, or application account dependency. All fixtures are synthetic.

## Public interface

```swift
let document = try GeometryJSONReader.decode(geometryBytes)
let received = try ExchangeImporter.importArchive(zipBytes)
let regeneratedScene = try received.scene()
let regeneratedSVG = try received.floorplanSVG()

let snapshot = try ExchangeExporter.export(document: document, floorID: "floor-1")
// snapshot.archiveData, .manifestDigest, .files, .documentID, .revision, .floorID
let glb = try GLBExporter.export(document: document, floorID: "floor-1")
```

These synchronous functions belong on a worker task. File-picker adapters must cap
reads before allocating an untrusted file in memory, retain security-scoped access
only during the read, and handle errors without displaying private input in logs.

An `ImportedExchange` retains exact original members, optional original archive,
and SHA-256 byte identities. Imported scene/SVG is validated for safe syntax,
references, indices and limits, then **never used as rendering truth**. Its rendering
methods rebuild from the validated geometry. A matching hash, input reviewState,
or successful import does not authenticate the sender or authorize export/publish.

## Format and limits

The four-file exchange contains exactly `manifest.json`, `geometry.json`,
`scene.json`, and `floorplan.svg`. It is a single-floor profile. Standalone geometry
JSON can carry multiple floors; a multi-floor exchange needs a new manifest profile.
GLB is a separate derivative and is never added to the four-file importer.

| Boundary | Limit or behavior |
| --- | --- |
| Archive and total expanded data | 64 MiB |
| One member | 32 MiB |
| ZIP | Exactly 4 regular members; stored or raw DEFLATE; ratio at most 200 |
| ZIP metadata | Flags 0 or UTF-8 only; no ZIP64, encryption, descriptors, extra fields or comments |
| ZIP consistency | Exact local/central names, methods, flags, CRC, sizes, timestamps; contiguous members; no overlays or extraction |
| JSON | UTF-8; depth 32; 1,000,000 values; string token 100,000 bytes; finite numbers; duplicate keys rejected before Codable |
| Contracts | Unknown properties, schemas, invalid counts/types/numbers/IDs rejected |
| Semantic geometry | SpatialCore validation plus conservative aggregate work budget 50,000,000 before expensive core loops |
| SVG | Flat emitted primitive vocabulary; no active content, DTD, entity declaration, external reference or nonfinite numeric attributes |
| XML | At most 400,000 elements; numeric magnitude at most 1,000,000; bounded attributes/text |
| Time | 15-second cooperative processing budget; not a hard real-time interrupt or an on-device latency claim |

Safety admission limits are not advertised usable capacity. The existing core has
bounded but non-cancellable calls; a worker task and aggregate admission checks
remain necessary. Coverage-guided fuzzing, profiling and physical-device resource
pressure acceptance remain pending. This is not a general-purpose ZIP/SVG parser.

Schema resources are exact copies of `contracts/*.schema.json`; a test prevents
silent drift. Regenerate only after a reviewed contract change:

```sh
cp contracts/geometry.schema.json contracts/scene.schema.json contracts/manifest.schema.json packages/SpatialInterop/Sources/SpatialInterop/Resources/
```

The compact schema interpreter supports only keywords used by those pinned resources.
An intentional future schema change must review both parser and schema interpretation.

## Export behavior

The exchange writer freezes value data, hashes exact compact JSON/SVG bytes, and
emits sorted, stored ZIP members with fixed metadata. Repeating identical inputs
with the same producer yields identical bytes. Later edits cannot mutate an earlier
export. This does not promise cross-language JSON canonicalization. Manifest bytes
are hashed separately; no self-hash is embedded.

The GLB writer uses glTF 2.0 with aligned little-endian JSON/BIN chunks, bounded
accessors, double-sided restrained blue surfaces, flat normals and separate semantic
LINES primitives. It exports actual canonical cutout triangles. It does not create
linework from triangle edges. It preserves meters/Y-up coordinates and document,
revision, schema and floor identity in `extras`. Raw captures and hidden resources
are not included. Float32 collapse of an edge or triangle fails explicitly.

Line width and transparency appearance depend on the receiving GLB viewer. Native
viewer acceptance and interoperability beyond tested validators remain pending.
No surveying or verified measurement claim is encoded.

Primary specification consulted: [Khronos glTF 2.0 specification](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html),
sections 3.4, 3.6, 3.7, 3.9.5, 3.9.7 and 4.4, retrieved 2026-10-09.

## Verification

```sh
swift test --package-path packages/SpatialInterop --jobs 1
```

`tests/import/run_verification.py` records exact source hashes, commands, environment,
outputs, and artifact identities. It also regenerates the synthetic native exchange
and GLB and runs the original Python package validator plus pinned test-only Khronos
`gltf-validator` 2.0.0-dev.3.10. Install that test tool with:

```sh
npm ci --prefix tests/import/.validator-toolchain --ignore-scripts --no-audit --no-fund
python3 tests/import/run_verification.py --swift /path/to/swift --python /path/to/verification-python --node /path/to/node
```

The Linux execution environment required `SWIFT_USE_OLD_DRIVER=1` because the newer
Swift driver crashed in runtime PID inspection. Pass `--legacy-driver` only when
needed there. The compiler remains Swift 6.2.1. This is not an iOS/Xcode or LiDAR test.

The fixtures in `tests/import/generated` are regenerated by `ExportTests` when
`SPATIAL_EXPORT_FIXTURE_DIR` is set by the evidence runner. Test packages and
node_modules are not app dependencies. Independent QA evidence is separate from
the package author's test results.

## Current final evidence

The final current-source test executable passed 34 XCTest cases. See
`evidence/execution/DIRECT_TESTS.json`, which supersedes the recorded failed
SwiftPM wrapper attempt without deleting it. The original Python bundle validator
also accepted the native-generated exchange. Khronos gltf-validator
2.0.0-dev.3.10 reported zero errors/warnings for the synthetic exported GLB.
This is format verification, not native visual/device acceptance.

The optional official validator is test-only. Its package and lockfile are
preserved at `tests/import/validator-package.json` and
`tests/import/validator-package-lock.json`. Copy them as package.json and
package-lock.json into `tests/import/.validator-toolchain`, run `npm ci` there,
then run `node tests/import/validate_glb.cjs FILE.glb REPORT.json` from repo root.
No validator dependency is added to the app.
